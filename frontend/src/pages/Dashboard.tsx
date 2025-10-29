import { useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Chip from '../components/Chip'
import EnergyUsageChart from '../components/EnergyUsageChart'
import pkg from '../../package.json'
import { useDashboardData } from '../hooks/useDashboardData'
import { useDashboardRealtime } from '../hooks/useDashboardRealtime'
import { resolveWebSocketConfig } from '../config'
import type { BlockRecord, EnergyReading } from '../types/dashboard'
import { wipeSimulatorData, getMeterReadingsByRange } from '../utils/api'

// Reworked dashboard: historical-only charts based on stored readings.

type DashboardProps = {
  selectedMeterId?: number | null
  onSelectMeter?: (meterId: number) => void
}

type ChartReading = {
  timestamp: number
  total_power_kw: number
  aux_power_kw: number
  trend_kw: number
  time: string
}

function normalizeReading(reading: EnergyReading): ChartReading {
  const timestamp = typeof reading.timestamp === 'string' ? Number(reading.timestamp) : reading.timestamp
  const totalPowerKw = parseFloat(reading.total_power_kw)

  const total = Number.isFinite(totalPowerKw) ? totalPowerKw : 0
  const aux = total > 0 ? Math.max(0, total * 0.65) : 0

  return {
    timestamp,
    total_power_kw: total,
    aux_power_kw: aux,
    trend_kw: total, // placeholder; will be smoothed below
    time: new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Removed unused helper functions since charts operate only on stored readings

export default function Dashboard({ selectedMeterId: externalSelectedMeterId = null, onSelectMeter }: DashboardProps) {

  const {
    meters,
    selectedMeterId: internalSelectedMeterId,
    selectMeter,
    snapshot,
    readings,
    connectedSimulators,
    updateConnectedSimulators,
    loading,
    error,
    refresh,
    lastUpdated
  } = useDashboardData(externalSelectedMeterId ?? undefined)

  const [isWiping, setIsWiping] = useState(false)
  const [historicalReadings, setHistoricalReadings] = useState<EnergyReading[]>([])
  const [selectedBlockForHistory, setSelectedBlockForHistory] = useState<BlockRecord | null>(null)
  const [loadingHistorical, setLoadingHistorical] = useState<boolean>(false)

  const meter = snapshot?.meter ?? null
  const meterDisplayName = meter?.client_name?.trim() ? meter.client_name : meter?.device_id ?? 'Unknown meter'
  const currentBlock = snapshot?.currentBlock ?? null
  const lastTenBlocks = snapshot?.lastTenBlocks ?? []
  const dashboardsOnline = snapshot?.dashboardStats?.dashboardsOnline ?? 0
  const hasDashboardsReady = snapshot?.dashboardStats?.dashboardsReady ?? false

  const chartData = useMemo<ChartReading[]>(() => {
    const base = readings.map(normalizeReading)
    // simple moving average for trend
    const window = 5
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum += base[i].total_power_kw
      if (i >= window) sum -= base[i - window].total_power_kw
      const count = Math.min(i + 1, window)
      base[i].trend_kw = count > 0 ? sum / count : base[i].total_power_kw
    }
    return base
  }, [readings])
  const latestReading = chartData.length > 0 ? chartData[chartData.length - 1] : null

  const targetKwhRaw = meter?.target_peak_kwh ?? null
  const targetKwh = targetKwhRaw != null
    ? (typeof targetKwhRaw === 'string' ? parseFloat(targetKwhRaw) : Number(targetKwhRaw))
    : 200
  // Progress to target is computed inline where needed

  // Select the most recent COMPLETED 30-min block for historical chart
  useEffect(() => {
    if (lastTenBlocks && lastTenBlocks.length > 0) {
      setSelectedBlockForHistory(lastTenBlocks[lastTenBlocks.length - 1])
    }
  }, [lastTenBlocks])

  // Realtime auto-refresh: use websocket updates to trigger snapshot refresh.
  const wsConfig = resolveWebSocketConfig()
  const { isConnected, activeEndpoint, connectionError } = useDashboardRealtime(wsConfig.primaryUrl, {
    fallbackUrls: wsConfig.fallbackUrls,
    requestSnapshot: (options) => {
      // Delegate to useDashboardData refresh; it already throttles and uses selected meter
      refresh({ ...(options || {}), silent: true })
    },
    onSimulatorsUpdate: updateConnectedSimulators
  })

  // Polling fallback: when websocket is NOT connected, poll every 60s.
  // When connected, rely on realtime debounced refreshes and skip polling.
  useEffect(() => {
    let intervalId: number | null = null
    if (!isConnected) {
      intervalId = window.setInterval(() => {
        refresh({ silent: true })
      }, 60_000)
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isConnected, refresh])
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never'

  const currentInterval = meter?.reading_interval ?? null

  useEffect(() => {
    if (
      externalSelectedMeterId !== null &&
      externalSelectedMeterId !== undefined &&
      externalSelectedMeterId !== internalSelectedMeterId
    ) {
      selectMeter(externalSelectedMeterId)
    }
  }, [externalSelectedMeterId, internalSelectedMeterId, selectMeter])

  const handleMeterChange = (meterId: number) => {
    selectMeter(meterId)
    onSelectMeter?.(meterId)
  }

  async function loadHistoricalForBlock(block: BlockRecord) {
    if (!meter) return
    setLoadingHistorical(true)
    try {
      const startISO = new Date(block.block_start).toISOString()
      const endISO = new Date(block.block_end).toISOString()
      const { readings: rangeReadings } = await getMeterReadingsByRange(meter.id, startISO, endISO)
      setHistoricalReadings(rangeReadings)
    } catch (error) {
      console.error('Failed to load historical readings for block:', error)
      setHistoricalReadings([])
    } finally {
      setLoadingHistorical(false)
    }
  }

  // Load readings when the selected historical block changes
  useEffect(() => {
    if (selectedBlockForHistory) {
      loadHistoricalForBlock(selectedBlockForHistory)
    } else {
      setHistoricalReadings([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlockForHistory, meter?.id])

  const handleWipeSimulatorData = async () => {
    if (isWiping) return
    if (!confirm('Are you sure you want to delete ALL simulator data? This cannot be undone!')) {
      return
    }

    try {
      setIsWiping(true)
      const result = await wipeSimulatorData()
      alert(`Successfully deleted ${result.deleted} simulator meters and their data`)
      await refresh({ silent: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to wipe simulator data'
      alert(message)
    } finally {
      setIsWiping(false)
    }
  }

  // Removed unused hasReadings; chartData length is shown contextually

  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Stored Energy Insights</h2>
            <p className="text-gray-600">View historical signals immediately, even when simulators are offline.</p>
          </div>
          <div className="mt-1">
            <span
              title={`Frontend version and mode`}
              className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 border border-gray-200"
            >
              Build v{pkg.version} • {import.meta.env.MODE}
            </span>
          </div>
        </header>

        {/* Initial loading state to ensure Dashboard is in a loading mode while backend warms up */}
        {loading && !snapshot && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md">
            Preparing backend services… This first load may take a few seconds.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Data status */}
        <section className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="lg"
              color={hasDashboardsReady ? 'available' : 'offline'}
              text={`${dashboardsOnline} Dashboard${dashboardsOnline === 1 ? '' : 's'} Online`}
            />

            {meter && (
              <>
                <Chip variant="tint" color="brand">
                  Meter: {meterDisplayName}
                </Chip>
                <Chip variant="tint" color="brand">
                  Device Name: {meterDisplayName}
                </Chip>
              </>
            )}

            {currentInterval && (
              <Chip variant="tint" color="brand">
                Reading Interval: {currentInterval}s
              </Chip>
            )}

            {meter && (
              <>
                {targetKwhRaw != null && (
                  <Chip variant="tint" color="brand">
                    Target: {targetKwh} kWh
                  </Chip>
                )}
                {meter.whatsapp_number && (
                  <Chip variant="tint" color="brand">
                    WhatsApp: {meter.whatsapp_number}
                  </Chip>
                )}
              </>
            )}

            <Chip variant="tint" color="brand">
              Snapshot refreshed: {lastUpdatedLabel}
            </Chip>

            {/* Realtime connection enabled: chart refreshes automatically on new readings */}
            <Chip variant={isConnected ? 'filled' : 'outline'} color={isConnected ? 'success' : 'warning'}>
              {isConnected ? `WS: connected${activeEndpoint ? ` @ ${new URL(activeEndpoint).host}` : ''}` : 'WS: not connected (polling fallback)'}
            </Chip>
            {!isConnected && connectionError && (
              <span className="text-xs text-gray-500" title={connectionError}>!</span>
            )}
          </div>
          {/* Connected simulators list retained for visibility, but does not affect charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Connected Simulators</h3>
              {connectedSimulators.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {connectedSimulators.map((simulator) => (
                    <Chip key={`${simulator.deviceId}-${simulator.simulatorName}`} variant="filled" color="success">
                      {simulator.simulatorName}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No simulators currently connected. Historical data remains available.</p>
              )}
            </div>
          </div>
        </section>

        {/* Meter selection & controls */}
        <section className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap gap-6 items-end justify-between">
            <div className="min-w-64">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Meter</label>
              <select
                value={internalSelectedMeterId || ''}
                onChange={(event) => handleMeterChange(Number(event.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={meters.length === 0}
              >
                {meters.map((m) => {
                  const displayName = m.client_name?.trim() ? m.client_name : m.device_id
                  const badge = m.is_simulator ? ' (Simulator)' : ''
                  return (
                    <option key={m.id} value={m.id}>
                      {displayName}
                      {badge}
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="flex-1">
              <p className="text-sm text-gray-500">
                Charts refresh from stored readings. When WebSocket is connected, snapshots are triggered automatically on new readings; otherwise a 60s polling fallback is used.
              </p>
              {latestReading && (
                <p className="text-sm text-gray-600 mt-1">
                  Latest stored reading at {new Date(latestReading.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}{' '}
                  — {latestReading.total_power_kw.toFixed(2)} kW
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleWipeSimulatorData}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors disabled:opacity-50"
              disabled={isWiping}
            >
              🗑️ Wipe All Simulator Data
            </button>
            <p className="text-xs text-gray-500 mt-2">
              This clears stored simulator readings without affecting live dashboards.
            </p>
          </div>
        </section>

        {/* BUILD MARKER: TEST NEW CHART */}
        <section className="bg-white shadow rounded-lg p-6 space-y-4">
          <h3 className="text-xl font-bold text-red-600">TEST NEW CHART</h3>
          <p className="text-sm text-gray-600">
            If you can see this section, the new frontend build is LIVE. Below chart uses current snapshot readings (no websocket).
          </p>

          {readings.length > 0 ? (
            <div className="bg-[#0b1220] text-white rounded-xl p-4">
              <EnergyUsageChart
                readings={readings}
                dark={true}
                defaultAccumulationOn={false}
                fixedWidthPerMinute={false}
                barPixelWidth={10}
              />
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center border-2 border-dashed rounded-lg">
              <div className="text-center">
                <p className="text-gray-700 font-medium">No snapshot readings available.</p>
                <p className="text-xs text-gray-500 mt-1">Checks: ensure /api/dashboard/snapshot returns readings[]. Select a meter with data or run simulator.</p>
              </div>
            </div>
          )}
        </section>

        {/* Latest completed 30-min block summary (historical-only) */}
        <section className="bg-white shadow rounded-lg p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {selectedBlockForHistory
                  ? `${formatTime(selectedBlockForHistory.block_start)} - ${formatTime(selectedBlockForHistory.block_end)}`
                  : 'No block data yet'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">Latest completed 30-minute block (stored readings only)</p>
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              {selectedBlockForHistory && (
                <Badge variant="lg" color={selectedBlockForHistory.is_peak_hour ? 'available' : 'offline'} text={selectedBlockForHistory.is_peak_hour ? 'PEAK HOUR' : 'OFF-PEAK'} />
              )}
              {loading && (
                <Chip variant="tint" color="warning">
                  Refreshing snapshot…
                </Chip>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center flex-wrap gap-6">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Block Usage</h4>
              <p className="text-sm text-gray-600">{selectedBlockForHistory?.reading_count || 0} readings contributing</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-blue-600">{selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh).toFixed(3) : '0.000'} kWh</p>
              <p className="text-sm text-gray-600">of {targetKwh} kWh target</p>
            </div>
          </div>

          <div className="relative h-24 bg-gray-100 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center">
              <div
                className={`h-full transition-all duration-500 flex items-center justify-center text-white font-bold ${
                  (() => {
                    const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                    const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                    return pct < 70 ? 'bg-green-500' : pct < 90 ? 'bg-yellow-500' : pct < 100 ? 'bg-orange-500' : 'bg-red-500'
                  })()
                }`}
                style={{
                  width: `${(() => {
                    const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                    const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                    return Math.min(pct, 100)
                  })()}%`
                }}
              >
                {selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh).toFixed(2) : '0.00'} kWh
              </div>
              {(() => {
                const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                return pct < 100
              })() && (
                <div className="flex-1 h-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm">
                  {(targetKwh - (selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0)).toFixed(2)} kWh remaining
                </div>
              )}
            </div>
            <div className="absolute top-0 bottom-0 border-r-4 border-gray-900 z-10" style={{ left: '100%' }}>
              <span className="absolute -top-6 -right-8 text-xs font-bold text-gray-900">TARGET</span>
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-2">
              {(() => {
                const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                return pct < 70
              })() && (
                <Chip variant="tint" color="success">
                  ✅ {(100 - (() => {
                    const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                    const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                    return pct
                  })()).toFixed(0)}% buffer remaining
                </Chip>
              )}
              {(() => {
                const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                return pct >= 70 && pct < 90
              })() && (
                <Chip variant="tint" color="warning">
                  ⚠️ {(100 - (() => {
                    const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                    const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                    return pct
                  })()).toFixed(0)}% to target
                </Chip>
              )}
              {(() => {
                const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                return pct >= 90 && pct < 100
              })() && (
                <Chip variant="filled" color="warning">
                  🔔 {(100 - (() => {
                    const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                    const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                    return pct
                  })()).toFixed(0)}% left!
                </Chip>
              )}
              {(() => {
                const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                return pct >= 100
              })() && (
                <Chip variant="filled" color="danger">
                  🚨 {(() => {
                    const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                    const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                    return (pct - 100).toFixed(0)
                  })()}% OVER!
                </Chip>
              )}
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{(() => {
                const blockKwh = selectedBlockForHistory ? parseFloat(selectedBlockForHistory.total_kwh) : 0
                const pct = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                return pct.toFixed(1)
              })()}%</span> of target used
            </div>
          </div>
        </section>

        {/* Latest 30-min historical chart (stored readings only) */}
        {selectedBlockForHistory && (
          <section className="bg-[#0b1220] text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Latest 30-Min Historical Usage — {formatTime(selectedBlockForHistory.block_start)} to {formatTime(selectedBlockForHistory.block_end)}</h3>
              {loadingHistorical && (
                <Chip variant="tint" color="warning">Loading…</Chip>
              )}
              {!loadingHistorical && (
                <Chip variant="tint" color="brand">{historicalReadings.length} readings</Chip>
              )}
            </div>
            {historicalReadings.length > 0 ? (
              <EnergyUsageChart
                readings={historicalReadings}
                blockInfo={{
                  start: new Date(selectedBlockForHistory.block_start).toISOString(),
                  end: new Date(selectedBlockForHistory.block_end).toISOString(),
                  isPeakHour: !!selectedBlockForHistory.is_peak_hour
                }}
                currentBlock={selectedBlockForHistory}
                dark={true}
                defaultAccumulationOn={true}
                fixedWidthPerMinute={true}
                barPixelWidth={8}
              />
            ) : (
              <div className="h-64 flex items-center justify-center bg-[#0b1220] rounded-lg border-2 border-dashed border-[#1f2937] text-center">
                <div>
                  <p className="text-gray-300 font-medium">No readings found for latest block.</p>
                  <p className="text-sm text-gray-400 mt-1">If data exist in DB, this chart will always render.</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Last ten blocks */}
        {lastTenBlocks.length > 0 && (
          <section className="bg-white shadow rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold">Last 10 × 30-Minute Blocks</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {lastTenBlocks.map((block) => {
                const blockKwh = parseFloat(block.total_kwh)
                const blockPercentage = targetKwh > 0 ? (blockKwh / targetKwh) * 100 : 0
                const isOver = blockPercentage > 100
                const isWarning = blockPercentage > 90 && blockPercentage <= 100

                return (
                  <button
                    key={block.block_start}
                    className="text-left border rounded-lg p-3 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={() => setSelectedBlockForHistory(block)}
                    title="Load historical chart for this 30-min block"
                  >
                    <p className="text-xs text-gray-600 mb-2 font-medium">
                      {formatTime(block.block_start)} - {formatTime(block.block_end)}
                    </p>
                    <p className="text-lg font-bold mb-2 text-gray-900">{blockKwh.toFixed(3)} kWh</p>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full transition-all ${
                          isOver ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(blockPercentage, 100)}%` }}
                      />
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        isOver ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-green-600'
                      }`}
                    >
                      {isOver
                        ? `${(blockPercentage - 100).toFixed(0)}% OVER`
                        : `${Math.max(0, 100 - blockPercentage).toFixed(0)}% buffer`}
                    </p>
                    {block.is_peak_hour && (
                      <div className="mt-2">
                        <Chip variant="tint" color="warning">
                          Peak
                        </Chip>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Block statistics */}
        {currentBlock && (
          <section className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Block Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Average Power</p>
                <p className="text-xl font-bold text-gray-900">
                  {parseFloat(currentBlock.avg_power_kw).toFixed(2)} kW
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Max Power</p>
                <p className="text-xl font-bold text-red-600">
                  {parseFloat(currentBlock.max_power_kw).toFixed(2)} kW
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Min Power</p>
                <p className="text-xl font-bold text-green-600">
                  {parseFloat(currentBlock.min_power_kw).toFixed(2)} kW
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Energy</p>
                <p className="text-xl font-bold text-blue-600">
                  {parseFloat(currentBlock.total_kwh).toFixed(4)} kWh
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
              <strong>Calculation:</strong> Stored total kWh is derived from all saved readings in the block.
            </div>
          </section>
        )}

        {/* Optional: block selection retained below via lastTenBlocks cards */}

        {!currentBlock && !loading && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-900 mb-2">Need data?</h4>
            <p className="text-sm text-yellow-800">
              Run the simulator to push new readings. They will be stored automatically and appear here after the next snapshot.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
