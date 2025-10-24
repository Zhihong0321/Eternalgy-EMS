import { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Button, Badge, Chip } from '@peppermint-design/devreadykit'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'

export default function Simulator() {
  const { isConnected, send, lastMessage } = useWebSocket(WS_URL)

  const [deviceId, setDeviceId] = useState('SIMULATOR-001')
  const [power, setPower] = useState(75)
  const [frequency, setFrequency] = useState(60)
  const [isRunning, setIsRunning] = useState(false)
  const [volatility, setVolatility] = useState(10) // % variation
  const [interval, setInterval] = useState(60) // seconds
  const [sentCount, setSentCount] = useState(0)

  // Register as simulator when connected
  useEffect(() => {
    if (isConnected) {
      send({
        type: 'simulator:register',
        deviceId,
      })
    }
  }, [isConnected, deviceId, send])

  // Handle acknowledgments
  useEffect(() => {
    if (lastMessage?.type === 'simulator:acknowledged') {
      setSentCount((prev) => prev + 1)
    }
  }, [lastMessage])

  // Auto-send readings when running
  useEffect(() => {
    if (!isRunning || !isConnected) return

    const timer = window.setInterval(() => {
      // Calculate power with volatility
      const variation = (Math.random() - 0.5) * 2 * (volatility / 100)
      const currentPower = power * (1 + variation)

      send({
        type: 'simulator:reading',
        deviceId,
        totalPowerKw: parseFloat(currentPower.toFixed(2)),
        timestamp: Date.now(),
        frequency: parseFloat(frequency.toFixed(2)),
      })
    }, interval * 1000)

    return () => window.clearInterval(timer)
  }, [isRunning, isConnected, power, volatility, interval, deviceId, frequency, send])

  const handleSendOnce = () => {
    const variation = (Math.random() - 0.5) * 2 * (volatility / 100)
    const currentPower = power * (1 + variation)

    send({
      type: 'simulator:reading',
      deviceId,
      totalPowerKw: parseFloat(currentPower.toFixed(2)),
      timestamp: Date.now(),
      frequency: parseFloat(frequency.toFixed(2)),
    })
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Energy Meter Simulator
          </h2>
          <p className="text-gray-600">
            Simulate real-time meter readings to test the EMS backend
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6 flex items-center gap-4">
          <Badge
            variant="lg"
            color={isConnected ? 'available' : 'offline'}
            text={isConnected ? 'Connected' : 'Disconnected'}
          />

          {isRunning && (
            <Chip variant="filled" color="success">
              Running ({sentCount} readings sent)
            </Chip>
          )}
        </div>

        {/* Configuration Panel */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Configuration</h3>

          {/* Device ID */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Device ID
            </label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="SIMULATOR-001"
            />
          </div>

          {/* Power Slider */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base Power: <span className="font-bold text-blue-600">{power} kW</span>
            </label>
            <input
              type="range"
              min="10"
              max="200"
              step="5"
              value={power}
              onChange={(e) => setPower(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>10 kW</span>
              <span>200 kW</span>
            </div>
          </div>

          {/* Volatility Slider */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Volatility: <span className="font-bold text-blue-600">{volatility}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={volatility}
              onChange={(e) => setVolatility(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>No variation</span>
              <span>High variation</span>
            </div>
          </div>

          {/* Frequency */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Frequency: <span className="font-bold text-blue-600">{frequency} Hz</span>
            </label>
            <input
              type="range"
              min="59"
              max="61"
              step="0.1"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>59 Hz</span>
              <span>60 Hz</span>
              <span>61 Hz</span>
            </div>
          </div>

          {/* Interval */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Send Interval: <span className="font-bold text-blue-600">{interval}s</span>
            </label>
            <input
              type="range"
              min="1"
              max="120"
              step="1"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              disabled={isRunning}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1s (testing)</span>
              <span>60s (realistic)</span>
              <span>120s</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-3">
            <Button
              variant="filled"
              color="primary"
              onClick={() => setIsRunning(!isRunning)}
              disabled={!isConnected}
            >
              {isRunning ? '⏸️ Stop Auto-Send' : '▶️ Start Auto-Send'}
            </Button>

            <Button
              variant="border"
              color="secondary"
              onClick={handleSendOnce}
              disabled={!isConnected || isRunning}
            >
              Send Once
            </Button>

            <Button
              variant="plain"
              color="warning"
              onClick={() => setSentCount(0)}
            >
              Reset Counter
            </Button>
          </div>
        </div>

        {/* Current Reading Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Current Reading Preview</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Device ID:</p>
              <p className="font-mono font-semibold">{deviceId}</p>
            </div>
            <div>
              <p className="text-gray-600">Power Range:</p>
              <p className="font-semibold">
                {(power * (1 - volatility / 100)).toFixed(1)} - {(power * (1 + volatility / 100)).toFixed(1)} kW
              </p>
            </div>
            <div>
              <p className="text-gray-600">Frequency:</p>
              <p className="font-semibold">{frequency} Hz</p>
            </div>
            <div>
              <p className="text-gray-600">Readings Sent:</p>
              <p className="font-semibold">{sentCount}</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">📱 How to Use:</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Adjust the power, volatility, and frequency settings</li>
            <li>Click "Start Auto-Send" to begin transmitting readings</li>
            <li>Open the Dashboard tab to see real-time updates</li>
            <li>Use "Send Once" to manually send a single reading</li>
            <li>For realistic testing, use 60s interval (matches real meters)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
