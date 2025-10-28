import { useState, useEffect, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import Badge from '../components/Badge'
import Chip from '../components/Chip'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { resolveWebSocketUrl } from '../config'

const DEFAULT_WS_URL = 'ws://localhost:3000'

interface Reading {
  timestamp: number
  total_power_kw: string
  time: string
}

interface Block {
  block_start: string
  block_end: string
  total_kwh: string
  avg_power_kw: string
  max_power_kw: string
  min_power_kw: string
  reading_count: number
  is_peak_hour: boolean
}

interface Simulator {
  deviceId: string
  simulatorName: string
  meterId?: number
}

export default function Dashboard() {
  const wsUrl = useMemo(() => {
    const resolved = resolveWebSocketUrl()
    return resolved || DEFAULT_WS_URL
  }, [])

  const { isConnected, send, lastMessage } = useWebSocket(wsUrl)

  const [readings, setReadings] = useState<Reading[]>([])
  const [currentBlock, setCurrentBlock] = useState<Block | null>(null)
  const [blockInfo, setBlockInfo] = useState<any>(null)
  const [meter, setMeter] = useState<any>(null)
  const [connectedSimulators, setConnectedSimulators] = useState<Simulator[]>([])
  const [allMeters, setAllMeters] = useState<any[]>([])
  const [selectedMeterId, setSelectedMeterId] = useState<number | null>(null)
  const [lastTenBlocks, setLastTenBlocks] = useState<Block[]>([])
  const [currentInterval, setCurrentInterval] = useState<number>(60) // Current meter reading interval

  // Register as dashboard when connected
  useEffect(() => {
    if (isConnected) {
      send({
        type: 'dashboard:register',
      })
    }
  }, [isConnected, send])

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return

    switch (lastMessage.type) {
      case 'dashboard:initial':
        // Initial data load
        setMeter(lastMessage.meter)
        if (lastMessage.meter?.reading_interval) {
          setCurrentInterval(lastMessage.meter.reading_interval)
        }
        if (lastMessage.currentBlock) {
          setCurrentBlock(lastMessage.currentBlock)
        }
        if (lastMessage.simulators) {
          setConnectedSimulators(lastMessage.simulators)
        }
        if (lastMessage.allMeters) {
          setAllMeters(lastMessage.allMeters)
        }
        if (lastMessage.lastTenBlocks) {
          setLastTenBlocks(lastMessage.lastTenBlocks)
        }
        break

      case 'dashboard:simulators-updated':
        // Update simulators list
        setConnectedSimulators(lastMessage.simulators || [])
        break

      case 'dashboard:update':
        // Real-time update
        setMeter(lastMessage.meter)
        if (lastMessage.meter?.reading_interval) {
          setCurrentInterval(lastMessage.meter.reading_interval)
        }
        setCurrentBlock(lastMessage.currentBlock)
        setBlockInfo(lastMessage.blockInfo)

        // Add new reading to chart
        if (lastMessage.reading) {
          const time = new Date(parseInt(lastMessage.reading.timestamp))
          const timeStr = time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })

          const newReading: Reading = {
            ...lastMessage.reading,
            time: timeStr,
          }

          setReadings((prev) => {
            // Sort readings by timestamp and keep last 30 for the chart
            const updated = [...prev, newReading].sort((a, b) =>
              parseInt(a.timestamp.toString()) - parseInt(b.timestamp.toString())
            ).slice(-30)
            return updated
          })
        }
        break
    }
  }, [lastMessage])

  // Calculate progress percentage
  const targetKwh = 200 // This would come from settings in real app
  const currentKwh = currentBlock ? parseFloat(currentBlock.total_kwh) : 0
  const percentage = (currentKwh / targetKwh) * 100

  // Status color helper (for future use)
  // const getStatusColor = () => {
  //   if (percentage < 70) return 'success'
  //   if (percentage < 90) return 'warning'
  //   return 'danger'
  // }

  // Calculate time remaining in block
  const getMinutesRemaining = () => {
    if (!blockInfo) return 0
    const blockEnd = new Date(blockInfo.end)
    const now = new Date()
    const diff = blockEnd.getTime() - now.getTime()
    return Math.max(0, Math.floor(diff / 60000))
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isPeakHour = blockInfo?.isPeakHour || false
  const minutesRemaining = getMinutesRemaining()

  // Handle wipe simulator data
  const handleWipeSimulatorData = async () => {
    if (!confirm('Are you sure you want to delete ALL simulator data? This cannot be undone!')) {
      return
    }

    try {
      // Use relative URL in production (same origin), absolute URL in dev
      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : window.location.origin

      const response = await fetch(`${API_URL}/api/simulators/data`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      alert(`Successfully deleted ${result.deleted} simulator meters and their data`)

      // Refresh the page or clear local state
      window.location.reload()
    } catch (error) {
      console.error('Error wiping simulator data:', error)
      alert(`Failed to wipe simulator data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Handle meter selection change
  const handleMeterChange = async (meterId: number) => {
    setSelectedMeterId(meterId)
    // In a real implementation, we'd fetch data for this meter
    // For now, just update the selection
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Real-time Energy Dashboard
          </h2>
          <p className="text-gray-600">
            Monitor 30-minute block usage and peak hour status
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <Badge
            variant="lg"
            color={isConnected ? 'available' : 'offline'}
            text={isConnected ? 'Connected' : 'Disconnected'}
          />

          {meter && (
            <Chip variant="tint" color="brand">
              {meter.device_id}
            </Chip>
          )}

          {meter && (
            <Chip variant="tint" color="brand">
              Reading Interval: {currentInterval}s
            </Chip>
          )}
        </div>

        {/* Connected Simulators & Controls */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-3">Connected Simulators</h3>
              {connectedSimulators.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {connectedSimulators.map((sim) => (
                    <Chip key={sim.deviceId} variant="filled" color="success">
                      {sim.simulatorName} ({sim.deviceId})
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No simulators connected</p>
              )}
            </div>

            {/* Meter Selection */}
            <div className="min-w-64">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Meter
              </label>
              <select
                value={selectedMeterId || meter?.id || ''}
                onChange={(e) => handleMeterChange(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allMeters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.device_id} {m.is_simulator ? '(Simulator)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Wipe Simulator Data Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleWipeSimulatorData}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors"
            >
              🗑️ Wipe All Simulator Data
            </button>
            <p className="text-xs text-gray-500 mt-2">
              This will delete all simulator meters and their readings from the database
            </p>
          </div>
        </div>

        {/* Current Block Status */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                {blockInfo ? `${formatTime(blockInfo.start)} - ${formatTime(blockInfo.end)}` : 'Waiting for data...'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">Current 30-minute block</p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Badge
                variant="lg"
                color={isPeakHour ? 'available' : 'offline'}
                text={isPeakHour ? 'PEAK HOUR' : 'OFF-PEAK'}
              />

              {minutesRemaining > 0 && (
                <Chip variant="filled" color="brand">
                  {minutesRemaining} min left
                </Chip>
              )}
            </div>
          </div>

          {/* Improved Visual Usage Display */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">Current Usage</h4>
                <p className="text-sm text-gray-600">{currentBlock?.reading_count || 0} readings collected</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold text-blue-600">{currentKwh.toFixed(3)} kWh</p>
                <p className="text-sm text-gray-600">of {targetKwh} kWh target</p>
              </div>
            </div>

            {/* Visual Bar Comparison */}
            <div className="relative h-24 bg-gray-100 rounded-lg overflow-hidden">
              {/* Target line */}
              <div className="absolute top-0 left-0 right-0 h-full flex items-end">
                {/* Current usage bar */}
                <div
                  className={`h-full transition-all duration-500 flex items-center justify-center text-white font-bold ${
                    percentage < 70 ? 'bg-green-500' :
                    percentage < 90 ? 'bg-yellow-500' :
                    percentage < 100 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                >
                  {currentKwh.toFixed(2)} kWh
                </div>
                {/* Remaining to target */}
                {percentage < 100 && (
                  <div className="flex-1 h-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm">
                    {(targetKwh - currentKwh).toFixed(2)} kWh remaining
                  </div>
                )}
              </div>
              {/* Target marker */}
              <div className="absolute top-0 bottom-0 border-r-4 border-gray-900 z-10" style={{ left: '100%' }}>
                <span className="absolute -top-6 -right-8 text-xs font-bold text-gray-900">TARGET</span>
              </div>
            </div>

            {/* Status and Stats */}
            <div className="mt-4 flex justify-between items-center">
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
          </div>
        </div>

        {/* Power Chart */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">
            Real-time Power Readings (kW) - Current 30-Minute Block
          </h3>

          {readings.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={readings}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                />
                {currentBlock && (
                  <>
                    <ReferenceLine
                      y={parseFloat(currentBlock.avg_power_kw)}
                      stroke="#6366f1"
                      strokeDasharray="3 3"
                      label={{ value: 'Avg', position: 'right', fontSize: 12 }}
                    />
                    <ReferenceLine
                      y={parseFloat(currentBlock.max_power_kw)}
                      stroke="#ef4444"
                      strokeDasharray="3 3"
                      label={{ value: 'Max', position: 'right', fontSize: 12 }}
                    />
                  </>
                )}
                <Bar dataKey="total_power_kw" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <div className="text-center">
                <p className="text-gray-500 mb-2">No data yet</p>
                <p className="text-sm text-gray-400">
                  Start the simulator to see real-time readings
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Last 10 Blocks History */}
        {lastTenBlocks.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Last 10 × 30-Minute Blocks</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {lastTenBlocks.map((block) => {
                const blockKwh = parseFloat(block.total_kwh);
                const blockPercentage = (blockKwh / targetKwh) * 100;
                const isOver = blockPercentage > 100;
                const isWarning = blockPercentage > 90;

                return (
                  <div key={block.block_start} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
                    <p className="text-xs text-gray-600 mb-2 font-medium">
                      {formatTime(block.block_start)} - {formatTime(block.block_end)}
                    </p>
                    <p className="text-lg font-bold mb-2 text-gray-900">
                      {blockKwh.toFixed(3)} kWh
                    </p>

                    {/* Visual bar */}
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full transition-all ${
                          isOver ? 'bg-red-500' :
                          isWarning ? 'bg-orange-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(blockPercentage, 100)}%` }}
                      />
                    </div>

                    {/* Status text */}
                    <p className={`text-xs font-semibold ${
                      isOver ? 'text-red-600' :
                      isWarning ? 'text-orange-600' :
                      'text-green-600'
                    }`}>
                      {isOver
                        ? `${(blockPercentage - 100).toFixed(0)}% OVER`
                        : `${(100 - blockPercentage).toFixed(0)}% buffer`
                      }
                    </p>

                    {block.is_peak_hour && (
                      <div className="mt-2">
                        <Chip variant="tint" color="warning">
                          Peak
                        </Chip>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Block Statistics */}
        {currentBlock && (
          <div className="bg-white shadow rounded-lg p-6">
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

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>Calculation:</strong> Total kWh = Σ(Power readings) × (1/60) = {' '}
                {(parseFloat(currentBlock.avg_power_kw) * currentBlock.reading_count).toFixed(2)} × 0.01667 ≈ {' '}
                {parseFloat(currentBlock.total_kwh).toFixed(4)} kWh
              </p>
            </div>
          </div>
        )}

        {/* Help Text */}
        {!currentBlock && isConnected && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-900 mb-2">👋 Getting Started:</h4>
            <p className="text-sm text-yellow-800">
              Switch to the <strong>Simulator</strong> tab and start sending readings to see real-time data here!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
