import { useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Chip from '../components/Chip'
// Chart is now rendered via EnergyUsageChart component
import { resolveWebSocketConfig } from '../config'
import { useDashboardData } from '../hooks/useDashboardData'
import { useDashboardRealtime } from '../hooks/useDashboardRealtime'
import type { BlockRecord, EnergyReading } from '../types/dashboard'
import { wipeSimulatorData } from '../utils/api'
import EnergyUsageChart from '../components/EnergyUsageChart'

const DEFAULT_WS_URL = 'ws://localhost:3000'

type DashboardProps = {
  selectedMeterId?: number | null
  onSelectMeter?: (meterId: number) => void
}

type ChartReading = {
  timestamp: number
  total_power_kw: number
  time: string
}

function normalizeReading(reading: EnergyReading): ChartReading {
  const timestamp = typeof reading.timestamp === 'string' ? Number(reading.timestamp) : reading.timestamp
  const totalPowerKw = parseFloat(reading.total_power_kw)

  return {
    timestamp,
    total_power_kw: Number.isFinite(totalPowerKw) ? totalPowerKw : 0,
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

function calculateMinutesRemaining(blockInfo?: { end: string } | null) {
  if (!blockInfo) return 0
  const blockEnd = new Date(blockInfo.end).getTime()
  const diff = blockEnd - Date.now()
  return diff > 0 ? Math.floor(diff / 60000) : 0
}

function deriveTargetProgress(block: BlockRecord | null, targetKwh: number) {
  if (!block) {
    return { currentKwh: 0, percentage: 0 }
  }

  const currentKwh = parseFloat(block.total_kwh)
  const percentage = targetKwh > 0 ? (currentKwh / targetKwh) * 100 : 0
  return { currentKwh, percentage }
}

export default function Dashboard({ selectedMeterId: externalSelectedMeterId = null, onSelectMeter }: DashboardProps) {
  const { primaryUrl, fallbackUrls } = useMemo(() => {
    const config = resolveWebSocketConfig()
    const baseUrl = config.primaryUrl || DEFAULT_WS_URL
    const fallbacks = config.fallbackUrls.filter((url) => url && url !== baseUrl)
    return { primaryUrl: baseUrl, fallbackUrls: fallbacks }
  }, [])

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

  const { isConnected, activeEndpoint, connectionError, logs, lastEvent } = useDashboardRealtime(primaryUrl, {
    fallbackUrls,
    requestSnapshot: (options) => refresh({ silent: options?.silent, meterId: options?.meterId }),
    onSimulatorsUpdate: updateConnectedSimulators
  })

  const [isWiping, setIsWiping] = useState(false)

  const meter = snapshot?.meter ?? null
  const meterDisplayName = meter?.client_name?.trim() ? meter.client_name : meter?.device_id ?? 'Unknown meter'
  const blockInfo = snapshot?.blockInfo ?? null
  const currentBlock = snapshot?.currentBlock ?? null
  const lastTenBlocks = snapshot?.lastTenBlocks ?? []
  const dashboardsOnline = snapshot?.dashboardStats?.dashboardsOnline ?? 0
  const hasDashboardsReady = snapshot?.dashboardStats?.dashboardsReady ?? false

  const chartData = useMemo<ChartReading[]>(() => readings.map(normalizeReading), [readings])
  const latestReading = chartData.length > 0 ? chartData[chartData.length - 1] : null

  const targetKwh = 200
  const { currentKwh, percentage } = useMemo(
    () => deriveTargetProgress(currentBlock, targetKwh),
    [currentBlock]
  )

  const minutesRemaining = useMemo(() => calculateMinutesRemaining(blockInfo), [blockInfo])
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never'

  const isPeakHour = blockInfo?.isPeakHour || false
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

  // Chart component handles empty-state rendering

  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Stored Energy Insights</h2>
          <p className="text-gray-600">View historical signals immediately, even when simulators are offline.</p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Connection & data status */}
        <section className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="lg"
              color={isConnected ? 'available' : 'offline'}
              text={isConnected ? 'Realtime Connected' : 'Realtime Offline'}
            />

            <Badge
              variant="lg"
              color={hasDashboardsReady ? 'available' : 'offline'}
              text={`${dashboardsOnline} Dashboard${dashboardsOnline === 1 ? '' : 's'} Online`}
            />

            <Chip variant="tint" color="brand">
              Endpoint: {activeEndpoint || primaryUrl}
            </Chip>

            {meter && (
              <>
                <Chip variant="tint" color="brand">
                  Meter: {meterDisplayName}
                </Chip>
                <Chip variant="tint" color="brand">
                  Device ID: {meter.device_id}
                </Chip>
              </>
            )}

            {currentInterval && (
              <Chip variant="tint" color="brand">
                Reading Interval: {currentInterval}s
              </Chip>
            )}

            <Chip variant="tint" color="brand">
              Snapshot refreshed: {lastUpdatedLabel}
            </Chip>

            {connectionError && (
              <Chip variant="filled" color="warning">
                {connectionError}
              </Chip>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Connected Simulators</h3>
              {connectedSimulators.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {connectedSimulators.map((simulator) => (
                    <Chip key={`${simulator.deviceId}-${simulator.simulatorName}`} variant="filled" color="success">
                      {simulator.simulatorName} ({simulator.deviceId})
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No simulators currently connected. Historical data remains available.</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Realtime Activity</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-md max-h-32 overflow-y-auto text-sm text-gray-700 p-3 space-y-1">
                {logs.length === 0 ? (
                  <p className="text-gray-500">Waiting for realtime events…</p>
                ) : (
                  logs
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div key={entry.id} className="flex justify-between gap-4">
                        <span
                          className={
                            entry.tone === 'error'
                              ? 'text-red-600'
                              : entry.tone === 'warning'
                              ? 'text-yellow-600'
                              : 'text-gray-800'
                          }
                        >
                          {entry.message}
                        </span>
                        <span className="text-gray-400">
                          {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                    ))
                )}
              </div>
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
                Charts refresh from stored readings on every snapshot. Use realtime events to track when new data is saved.
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

        {/* Current block summary */}
        <section className="bg-white shadow rounded-lg p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {blockInfo ? `${formatTime(blockInfo.start)} - ${formatTime(blockInfo.end)}` : 'No block data yet'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">Current 30-minute block (calculated from stored readings)</p>
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              <Badge variant="lg" color={isPeakHour ? 'available' : 'offline'} text={isPeakHour ? 'PEAK HOUR' : 'OFF-PEAK'} />
              {minutesRemaining > 0 && (
                <Chip variant="filled" color="brand">
                  {minutesRemaining} min left
                </Chip>
              )}
              {loading && (
                <Chip variant="tint" color="warning">
                  Refreshing snapshot…
                </Chip>
              )}
              {lastEvent && (
                <Chip variant="tint" color={lastEvent.tone === 'error' ? 'danger' : 'brand'}>
                  Last event: {lastEvent.message}
                </Chip>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center flex-wrap gap-6">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Current Usage</h4>
              <p className="text-sm text-gray-600">{currentBlock?.reading_count || 0} readings contributing</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-blue-600">{currentKwh.toFixed(3)} kWh</p>
              <p className="text-sm text-gray-600">of {targetKwh} kWh target</p>
            </div>
          </div>

          <div className="relative h-24 bg-gray-100 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center">
              <div
                className={`h-full transition-all duration-500 flex items-center justify-center text-white font-bold ${
                  percentage < 70 ? 'bg-green-500' : percentage < 90 ? 'bg-yellow-500' : percentage < 100 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              >
                {currentKwh.toFixed(2)} kWh
              </div>
              {percentage < 100 && (
                <div className="flex-1 h-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm">
                  {(targetKwh - currentKwh).toFixed(2)} kWh remaining
                </div>
              )}
            </div>
            <div className="absolute top-0 bottom-0 border-r-4 border-gray-900 z-10" style={{ left: '100%' }}>
              <span className="absolute -top-6 -right-8 text-xs font-bold text-gray-900">TARGET</span>
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-2">
              {percentage < 70 && (
                <Chip variant="tint" color="success">
                  ✅ {(100 - percentage).toFixed(0)}% buffer remaining
                </Chip>
              )}
              {percentage >= 70 && percentage < 90 && (
                <Chip variant="tint" color="warning">
                  ⚠️ {(100 - percentage).toFixed(0)}% to target
                </Chip>
              )}
              {percentage >= 90 && percentage < 100 && (
                <Chip variant="filled" color="warning">
                  🔔 {(100 - percentage).toFixed(0)}% left!
                </Chip>
              )}
              {percentage >= 100 && (
                <Chip variant="filled" color="danger">
                  🚨 {(percentage - 100).toFixed(0)}% OVER!
                </Chip>
              )}
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{percentage.toFixed(1)}%</span> of target used
            </div>
          </div>
        </section>

        {/* Energy usage chart (dark theme, accumulation line, peak highlight) */}
        <section className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Energy Usage</h3>
          <EnergyUsageChart
            readings={readings}
            readingIntervalSeconds={currentInterval ?? undefined}
            isPeakHour={isPeakHour}
            defaultShowAccumulation={true}
          />
        </section>

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
                  <div key={block.block_start} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
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
                  </div>
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
