import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Chip from '../components/Chip'
import { generateSimulatorName } from '../utils/nameGenerator'
import { resolveWebSocketConfig } from '../config'

const DEFAULT_WS_URL = 'ws://localhost:3000'

type HandshakeState = 'idle' | 'pending' | 'success' | 'warning' | 'error'
type AckStatus = 'accepted' | 'error'

const HANDSHAKE_COLORS: Record<Exclude<HandshakeState, 'idle'>, 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'brand',
  success: 'success',
  warning: 'warning',
  error: 'danger',
}

const HANDSHAKE_MESSAGES: Record<Exclude<HandshakeState, 'idle'>, string> = {
  pending: 'Awaiting confirmation from dashboard...',
  success: 'Dashboard confirmed and ready to receive data',
  warning: 'No dashboard connected yet',
  error: 'Handshake failed. Check dashboard status.',
}

const HANDSHAKE_REASON_LABELS: Record<string, string> = {
  auto: 'automatic check',
  manual: 'manual check',
  register: 'registration',
  'dashboard-joined': 'dashboard joined',
  'dashboard-left': 'dashboard left',
  'simulator-registered': 'registration broadcast',
  initial: 'not yet run'
}

export default function Simulator() {
  const { primaryUrl, fallbackUrls } = useMemo(() => {
    const config = resolveWebSocketConfig()
    const baseUrl = config.primaryUrl || DEFAULT_WS_URL
    const fallbacks = config.fallbackUrls.filter((url) => url && url !== baseUrl)
    return { primaryUrl: baseUrl, fallbackUrls: fallbacks }
  }, [])

  const { isConnected, send, lastMessage, connectionError, activeUrl } = useWebSocket(primaryUrl, {
    fallbackUrls
  })

  const [simulatorName, setSimulatorName] = useState(() => generateSimulatorName())
  const [isEditingName, setIsEditingName] = useState(false)
  // const [deviceId, setDeviceId] = useState('SIMULATOR-001')
  const defaultDeviceName = `SIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`
  const [deviceId, setDeviceId] = useState(defaultDeviceName)
  const [power, setPower] = useState(75)
  const [manualPower, setManualPower] = useState(75)
  const [frequency, setFrequency] = useState(60)
  const [isRunning, setIsRunning] = useState(false)
  const [volatility, setVolatility] = useState(10) // % variation
  const [interval, setInterval] = useState(60) // seconds - actual interval being used
  const [tempInterval, setTempInterval] = useState(60) // temporary interval while dragging slider
  const [sentCount, setSentCount] = useState(0)
  const [simulationMode, setSimulationMode] = useState<'auto' | 'manual'>('auto')
  const [fastForwardSpeed, setFastForwardSpeed] = useState(30) // 1x to 60x (default 30x)
  // Simulated clock (history date)
  const [simStartDate, setSimStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [nextSimTimestamp, setNextSimTimestamp] = useState<number>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })
  const [handshakeStatus, setHandshakeStatus] = useState<HandshakeState>('idle')
  const [handshakeDetails, setHandshakeDetails] = useState('')
  const [eventLog, setEventLog] = useState<string[]>([])
  const [isRegistered, setIsRegistered] = useState(false)
  const [attemptedCount, setAttemptedCount] = useState(0)
  const [dashboardsOnline, setDashboardsOnline] = useState(0)
  const [lastHandshakeAt, setLastHandshakeAt] = useState<number | null>(null)
  const [lastHandshakeReason, setLastHandshakeReason] = useState<string>('initial')
  const [lastAckAt, setLastAckAt] = useState<number | null>(null)
  const [lastAckStatus, setLastAckStatus] = useState<AckStatus | null>(null)
  const [lastAckMessage, setLastAckMessage] = useState<string | null>(null)
  const [lastAckSequence, setLastAckSequence] = useState(0)

  const pushLog = useCallback((entry: string) => {
    setEventLog((prev) => {
      const timestamp = new Date().toLocaleTimeString()
      const next = [`[${timestamp}] ${entry}`, ...prev]
      return next.slice(0, 50)
    })
  }, [])

  const formatHandshakeReason = useCallback((reason?: string | null) => {
    if (!reason || reason === 'initial') {
      return HANDSHAKE_REASON_LABELS.initial
    }

    return HANDSHAKE_REASON_LABELS[reason] || reason.replace(/-/g, ' ')
  }, [])

  const formatTimestamp = useCallback((value: number | null) => {
    if (!value) {
      return '—'
    }
    return new Date(value).toLocaleTimeString()
  }, [])

  const pendingReadings = Math.max(attemptedCount - sentCount, 0)

  const handshakeChipColor: 'brand' | 'success' | 'warning' | 'danger' =
    handshakeStatus === 'idle'
      ? 'brand'
      : HANDSHAKE_COLORS[handshakeStatus as Exclude<HandshakeState, 'idle'>]

  const handshakeSummary = handshakeStatus === 'idle'
    ? 'Handshake not requested yet'
    : handshakeDetails || HANDSHAKE_MESSAGES[handshakeStatus as Exclude<HandshakeState, 'idle'>]

  const handshakeTimestampLabel = handshakeStatus === 'pending'
    ? 'Awaiting handshake response'
    : lastHandshakeAt
      ? `${formatTimestamp(lastHandshakeAt)} • ${formatHandshakeReason(lastHandshakeReason)}`
      : 'No handshake recorded yet'

  const dashboardsChipColor: 'brand' | 'success' | 'warning' | 'danger' =
    dashboardsOnline > 0 ? 'success' : 'warning'

  const attemptChipColor: 'brand' | 'success' | 'warning' | 'danger' =
    attemptedCount === 0 ? 'brand' : pendingReadings > 0 ? 'warning' : 'success'

  const ackChipColor: 'brand' | 'success' | 'warning' | 'danger' =
    lastAckStatus === 'error'
      ? 'danger'
      : lastAckStatus === 'accepted'
        ? 'success'
        : pendingReadings > 0
          ? 'warning'
          : 'brand'

  const ackSummary = lastAckStatus
    ? lastAckStatus === 'accepted'
      ? `Last ack ${formatTimestamp(lastAckAt)}${lastAckSequence ? ` • reading #${lastAckSequence}` : ''}`
      : `Ack failed${lastAckMessage ? ` • ${lastAckMessage}` : ''}`
    : 'Awaiting first acknowledgement'

  const ackPreview = lastAckStatus
    ? lastAckStatus === 'accepted'
      ? `${formatTimestamp(lastAckAt)}${lastAckSequence ? ` (#${lastAckSequence})` : ''}`
      : `Failed${lastAckMessage ? ` - ${lastAckMessage}` : ''}`
    : '—'

  const handshakePreview = lastHandshakeAt
    ? `${formatTimestamp(lastHandshakeAt)} (${formatHandshakeReason(lastHandshakeReason)})`
    : '—'

  const previousConnectionRef = useRef(isConnected)
  const previousRunningRef = useRef(isRunning)

  const activeEndpoint = activeUrl || primaryUrl
  const previousEndpointRef = useRef<string | null>(null)

  useEffect(() => {
    if (isConnected && !previousConnectionRef.current) {
      pushLog(`Connected to ${activeEndpoint}`)
    } else if (!isConnected && previousConnectionRef.current) {
      pushLog('Connection lost. Waiting to reconnect...')
      setHandshakeStatus('idle')
      setHandshakeDetails('')
      setIsRegistered(false)
      setDashboardsOnline(0)
      setLastHandshakeAt(null)
      setLastHandshakeReason('initial')
      setAttemptedCount(0)
      setSentCount(0)
      setLastAckAt(null)
      setLastAckStatus(null)
      setLastAckMessage(null)
      setLastAckSequence(0)
    }

    previousConnectionRef.current = isConnected
  }, [isConnected, pushLog, activeEndpoint])

  useEffect(() => {
    if (isConnected && activeEndpoint !== previousEndpointRef.current) {
      if (previousEndpointRef.current) {
        pushLog(`Switched WebSocket endpoint to ${activeEndpoint}`)
      }
      previousEndpointRef.current = activeEndpoint
    }

    if (!isConnected) {
      previousEndpointRef.current = null
    }
  }, [isConnected, activeEndpoint, pushLog])

  useEffect(() => {
    if (connectionError) {
      pushLog(connectionError)
    }
  }, [connectionError, pushLog])

  useEffect(() => {
    if (previousRunningRef.current === isRunning) {
      previousRunningRef.current = isRunning
      return
    }

    previousRunningRef.current = isRunning

    if (isRunning) {
      const speedLabel = fastForwardSpeed > 1 ? ` • ${fastForwardSpeed}x speed` : ''
      pushLog(`Auto-send started (interval ${interval}s • ${simulationMode} mode${speedLabel})`)
    } else {
      pushLog('Auto-send paused')
    }
  }, [isRunning, interval, simulationMode, fastForwardSpeed, pushLog])

  // Reset simulated clock whenever the start date changes
  useEffect(() => {
    try {
      const d = new Date(`${simStartDate}T00:00:00`)
      setNextSimTimestamp(d.getTime())
      pushLog(`Simulated date set to ${d.toDateString()} • clock reset to 00:00`)
    } catch (e) {
      // Fallback: keep previous timestamp
    }
  }, [simStartDate, pushLog])

  const requestHandshake = useCallback((source: 'auto' | 'manual' = 'manual') => {
    const didSend = send({
      type: 'simulator:handshake',
      deviceId,
      simulatorName,
      source
    })

    if (didSend) {
      setHandshakeStatus('pending')
      setHandshakeDetails('Waiting for dashboard confirmation...')
      setLastHandshakeReason(source)
      setLastHandshakeAt(Date.now())
      pushLog(`${source === 'manual' ? 'Manual' : 'Automatic'} handshake requested`)
    } else {
      setHandshakeStatus('error')
      setHandshakeDetails('Unable to send handshake. Check connection logs.')
      pushLog('Failed to send handshake request - WebSocket not connected')
    }
  }, [deviceId, simulatorName, send, pushLog])

  // Register as simulator when connected
  useEffect(() => {
    if (isConnected) {
      const didRegister = send({
        type: 'simulator:register',
        deviceId,
        deviceName: deviceId,
        simulatorName,
      })

      if (!didRegister) {
        pushLog('Registration message could not be sent. Waiting for reconnection...')
      }
    }
  }, [isConnected, deviceId, simulatorName, send, pushLog])

  // Handle acknowledgments and handshake lifecycle
  useEffect(() => {
    if (!lastMessage) return

    if (lastMessage.type === 'simulator:registered') {
      pushLog(`Simulator registered as ${lastMessage.simulatorName} (${lastMessage.deviceName || lastMessage.deviceId})`)
      setIsRegistered(true)
      setSentCount(0)
      setAttemptedCount(0)
      setDashboardsOnline(0)
      setLastAckAt(null)
      setLastAckStatus(null)
      setLastAckMessage(null)
      setLastAckSequence(0)
      setLastHandshakeAt(typeof lastMessage.timestamp === 'number' ? lastMessage.timestamp : Date.now())
      setLastHandshakeReason('register')
      requestHandshake('auto')
      return
    }

    if (lastMessage.type === 'simulator:handshake-ack') {
      const status: Exclude<HandshakeState, 'idle'> =
        lastMessage.status === 'ok'
          ? 'success'
          : lastMessage.status === 'warning'
            ? 'warning'
            : 'error'

      setHandshakeStatus(status)

      const message = typeof lastMessage.message === 'string'
        ? lastMessage.message
        : HANDSHAKE_MESSAGES[status]

      setHandshakeDetails(message)
      if (status === 'error') {
        setIsRegistered(false)
        if (isConnected) {
          pushLog('Server reports simulator is not registered. Attempting to re-register...')
          const didRegister = send({
            type: 'simulator:register',
            deviceId,
            deviceName: deviceId,
            simulatorName
          })
          if (!didRegister) {
            pushLog('Re-registration attempt failed: WebSocket not ready.')
          }
        }
      } else {
        setIsRegistered(true)
      }
      if (typeof lastMessage.dashboardsOnline === 'number') {
        setDashboardsOnline(lastMessage.dashboardsOnline)
      }
      setLastHandshakeAt(typeof lastMessage.timestamp === 'number' ? lastMessage.timestamp : Date.now())
      if (typeof lastMessage.reason === 'string') {
        setLastHandshakeReason(lastMessage.reason)
      }
      const reasonText = formatHandshakeReason(lastMessage.reason)
      pushLog(`Handshake (${reasonText}): ${message}`)

      return
    }

    if (lastMessage.type === 'simulator:acknowledged') {
      const ackStatus: AckStatus = lastMessage.status === 'error' ? 'error' : 'accepted'
      if (typeof lastMessage.dashboardsOnline === 'number') {
        setDashboardsOnline(lastMessage.dashboardsOnline)
      }

      const ackTimestamp = typeof lastMessage.timestamp === 'number' ? lastMessage.timestamp : Date.now()
      setLastAckAt(ackTimestamp)
      setLastAckStatus(ackStatus)
      setLastAckMessage(typeof lastMessage.message === 'string' ? lastMessage.message : null)

      if (ackStatus === 'accepted') {
        setSentCount((prev) => prev + 1)
        const sequence = typeof lastMessage.sequence === 'number'
          ? lastMessage.sequence
          : lastAckSequence + 1
        setLastAckSequence(sequence)

        const powerLabel = lastMessage.reading?.totalPowerKw !== undefined
          ? `${lastMessage.reading.totalPowerKw} kW`
          : 'power unknown'
        pushLog(`Backend acknowledged reading #${sequence} (${powerLabel})`)
      } else {
        if (typeof lastMessage.sequence === 'number') {
          setLastAckSequence(lastMessage.sequence)
        }
        const errorDetail = typeof lastMessage.message === 'string' ? lastMessage.message : 'Unknown error'
        pushLog(`Backend rejected reading${lastMessage.sequence ? ` #${lastMessage.sequence}` : ''}: ${errorDetail}`)
      }

      return
    }

    if (lastMessage.type === 'error') {
      setHandshakeStatus('error')
      const message = typeof lastMessage.message === 'string'
        ? lastMessage.message
        : 'Server reported an unexpected error.'
      setHandshakeDetails(message)
      pushLog(`Server error: ${message}`)
    }
  }, [lastMessage, pushLog, requestHandshake, formatHandshakeReason, lastAckSequence, send, deviceId, simulatorName, isConnected])

  // Handle interval update with data wipe
  const handleUpdateInterval = async () => {
    if (tempInterval === interval) {
      alert('Interval is already set to this value')
      return
    }

    const confirmed = window.confirm(
      `Interval will change from ${interval}s to ${tempInterval}s.\n\n` +
      `To prevent data conflicts, all previous data for this simulator will be wiped.\n\n` +
      `Continue?`
    )

    if (confirmed) {
      try {
        // Use relative URL in production (same origin), absolute URL in dev
        const API_URL = window.location.hostname === 'localhost'
          ? 'http://localhost:3000'
          : window.location.origin

        const response = await fetch(`${API_URL}/api/simulators/data`, {
          method: 'DELETE'
        })

        if (response.ok) {
          const result = await response.json()
          console.log(`Wiped data for ${result.deleted} simulator meters`)
          setInterval(tempInterval)
          setSentCount(0)
          alert(`Interval updated to ${tempInterval}s. ${result.deleted} simulator meters wiped.`)
        } else {
          throw new Error('Failed to wipe data')
        }
      } catch (error) {
        console.error('Error wiping simulator data:', error)
        alert('Failed to update interval. Please try using the wipe button in the Dashboard.')
      }
    } else {
      // Revert temp interval
      setTempInterval(interval)
    }
  }

  // Auto-send readings when running
  useEffect(() => {
    if (!isRunning || !isConnected) return

    const effectiveInterval = (interval * 1000) / Math.max(1, fastForwardSpeed)

    const timer = window.setInterval(() => {
      const currentPower = simulationMode === 'manual' ? manualPower : power

      // Calculate power with volatility (only in auto mode)
      const variation = simulationMode === 'auto' ? (Math.random() - 0.5) * 2 * (volatility / 100) : 0
      const finalPower = currentPower * (1 + variation)

      // Send exactly ONE reading per effective tick, using the simulated clock.
      const didSend = send({
        type: 'simulator:reading',
        deviceId,
        deviceName: deviceId,
        simulatorName,
        totalPowerKw: parseFloat(finalPower.toFixed(2)),
        timestamp: nextSimTimestamp,
        frequency: parseFloat(frequency.toFixed(2)),
        readingInterval: interval,
      })

      if (didSend) {
        setAttemptedCount((prev) => prev + 1)
        setNextSimTimestamp((prev) => prev + interval * 1000)
      } else {
        pushLog('Reading dispatch skipped: WebSocket not connected. Simulator will retry automatically.')
      }
    }, effectiveInterval)

    return () => window.clearInterval(timer)
  }, [isRunning, isConnected, power, manualPower, volatility, interval, deviceId, simulatorName, frequency, send, simulationMode, fastForwardSpeed, pushLog, nextSimTimestamp])

  const handleSendOnce = () => {
    const variation = (Math.random() - 0.5) * 2 * (volatility / 100)
    const currentPower = power * (1 + variation)

    const didSend = send({
      type: 'simulator:reading',
      deviceId,
      deviceName: deviceId,
      simulatorName,
      totalPowerKw: parseFloat(currentPower.toFixed(2)),
      timestamp: nextSimTimestamp,
      frequency: parseFloat(frequency.toFixed(2)),
      readingInterval: interval,
    })

    if (didSend) {
      let queuedSequence: string | null = null
      setAttemptedCount((prev) => {
        const next = prev + 1
        queuedSequence = `#${next}`
        return next
      })
      setNextSimTimestamp((prev) => prev + interval * 1000)
      if (queuedSequence) {
        pushLog(`Manual reading dispatched (${queuedSequence}) awaiting acknowledgement`)
      }
    } else {
      pushLog('Manual reading could not be sent. Check WebSocket connection.')
    }
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
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Badge
            variant="lg"
            color={isConnected ? 'available' : 'offline'}
            text={isConnected ? 'Connected' : 'Disconnected'}
          />

          <Chip variant="tint" color={handshakeChipColor}>
            {`Handshake: ${handshakeSummary}`}
          </Chip>

          <Chip variant="tint" color={dashboardsChipColor}>
            {dashboardsOnline === 1 ? '1 dashboard online' : `${dashboardsOnline} dashboards online`}
          </Chip>

          <Chip variant="tint" color="brand">
            {`Endpoint: ${activeEndpoint}`}
          </Chip>

          <Chip variant="tint" color="brand">
            {`Last handshake: ${handshakeTimestampLabel}`}
          </Chip>

          <Chip variant="tint" color={attemptChipColor}>
            {`Dispatched ${attemptedCount} • Acked ${sentCount}${pendingReadings > 0 ? ` • ${pendingReadings} pending` : ''}`}
          </Chip>

          <Chip variant="tint" color={ackChipColor}>
            {ackSummary}
          </Chip>

          <Button
            variant="border"
            color="primary"
            onClick={() => requestHandshake('manual')}
            disabled={!isConnected || handshakeStatus === 'pending'}
          >
            {handshakeStatus === 'pending' ? 'Checking...' : 'Run handshake'}
          </Button>

          {isRunning && (
            <Chip variant="filled" color="success">
              {`Running (acked ${sentCount}/${attemptedCount})`}
            </Chip>
          )}
        </div>

        {/* Configuration Panel */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Configuration</h3>

          {/* Simulator Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Simulator Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={simulatorName}
                onChange={(e) => setSimulatorName(e.target.value.toUpperCase().slice(0, 6))}
                disabled={isRunning || !isEditingName}
                maxLength={6}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono font-bold text-lg"
                placeholder="ABCDEF"
              />
              {!isRunning && (
                <button
                  onClick={() => {
                    if (isEditingName) {
                      setIsEditingName(false)
                    } else {
                      setIsEditingName(true)
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                >
                  {isEditingName ? 'Save' : 'Edit'}
                </button>
              )}
              {!isRunning && !isEditingName && (
                <button
                  onClick={() => setSimulatorName(generateSimulatorName())}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                  title="Generate new random name"
                >
                  🔄
                </button>
              )}
            </div>
          </div>

          {/* Device Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Device Name
            </label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={isRunning}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="SIM-XXXXXX"
            />
          </div>

          {/* Simulation Mode Toggle */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Simulation Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSimulationMode('auto')}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                  simulationMode === 'auto'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🤖 Auto Mode
              </button>
              <button
                onClick={() => setSimulationMode('manual')}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                  simulationMode === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                👆 Manual Mode
              </button>
            </div>
          </div>

          {/* Power Control - Auto Mode */}
          {simulationMode === 'auto' && (
            <>
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
            </>
          )}

          {/* Power Control - Manual Mode */}
          {simulationMode === 'manual' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                Energy Usage: <span className="font-bold text-blue-600">{manualPower} kW</span>
              </label>
              <div className="flex justify-center items-center py-4">
                <div className="relative">
                  {/* Vertical Slider */}
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="1"
                    value={manualPower}
                    onChange={(e) => setManualPower(Number(e.target.value))}
                    className="h-64 slider-vertical"
                    style={{
                      WebkitAppearance: 'slider-vertical',
                      width: '8px',
                      padding: '0 5px',
                      transform: 'rotate(-90deg)',
                      transformOrigin: 'center'
                    } as React.CSSProperties}
                  />
                  <div className="absolute -left-12 top-0 text-xs text-gray-500">200 kW</div>
                  <div className="absolute -left-12 bottom-0 text-xs text-gray-500">10 kW</div>
                  <div className="absolute -right-16 text-sm font-bold text-blue-600" style={{ top: `${100 - ((manualPower - 10) / 190) * 100}%` }}>
                    ← {manualPower} kW
                  </div>
                </div>
              </div>
              <p className="text-xs text-center text-gray-500 mt-2">
                👆 Drag the slider up/down to adjust energy usage
              </p>
            </div>
          )}

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
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Send Interval: <span className="font-bold text-blue-600">{tempInterval}s</span>
                {tempInterval !== interval && (
                  <span className="ml-2 text-xs text-orange-600">(Current: {interval}s)</span>
                )}
              </label>
              {tempInterval !== interval && (
                <button
                  onClick={handleUpdateInterval}
                  disabled={isRunning}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded-md font-medium transition-colors"
                >
                  Update Interval
                </button>
              )}
            </div>
            <input
              type="range"
              min="1"
              max="120"
              step="1"
              value={tempInterval}
              onChange={(e) => setTempInterval(Number(e.target.value))}
              disabled={isRunning}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1s (testing)</span>
              <span>60s (realistic)</span>
              <span>120s</span>
            </div>
            {tempInterval !== interval && (
              <p className="text-xs text-orange-600 mt-2">
                ⚠️ Click "Update Interval" to apply changes (will wipe simulator data)
              </p>
            )}
          </div>

          {/* Simulation Start Date (History) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Simulation Start Date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={simStartDate}
                onChange={(e) => setSimStartDate(e.target.value)}
                disabled={isRunning}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <button
                onClick={() => {
                  const d = new Date(`${simStartDate}T00:00:00`)
                  setNextSimTimestamp(d.getTime())
                  pushLog('Simulated clock reset to start of selected date')
                }}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
              >
                Reset Clock
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Readings are time-stamped using the simulated clock starting at 00:00 on the selected date.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Next simulated timestamp: {new Date(nextSimTimestamp).toLocaleString()}
            </p>
          </div>

          {/* Fast Forward Speed */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fast Forward: <span className="font-bold text-purple-600">{fastForwardSpeed}x Speed</span>
            </label>
            <input
              type="range"
              min="1"
              max="60"
              step="1"
              value={fastForwardSpeed}
              onChange={(e) => setFastForwardSpeed(Number(e.target.value))}
              className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1x (Real-time)</span>
              <span>30x (Default)</span>
              <span>60x (Max)</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              ⚡ Fast forward runs the simulated clock at {fastForwardSpeed}x. For a {interval}s interval, one reading is sent every {(interval / Math.max(1, fastForwardSpeed)).toFixed(2)}s, stamped with the simulated time.
            </p>
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
              onClick={() => {
                setSentCount(0)
                setAttemptedCount(0)
                setLastAckSequence(0)
                setLastAckAt(null)
                setLastAckStatus(null)
                setLastAckMessage(null)
                pushLog('Counters reset manually')
              }}
            >
              Reset Counter
            </Button>
          </div>
        </div>

        {/* Current Reading Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Current Reading Preview</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Device Name:</p>
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
              <p className="text-gray-600">Dispatch Attempts:</p>
              <p className="font-semibold">{attemptedCount}</p>
            </div>
            <div>
              <p className="text-gray-600">Acknowledged:</p>
              <p className="font-semibold">{sentCount}</p>
            </div>
            <div>
              <p className="text-gray-600">Pending Ack:</p>
              <p className="font-semibold">{pendingReadings}</p>
            </div>
            <div>
              <p className="text-gray-600">Last Ack:</p>
              <p className="font-semibold">{ackPreview}</p>
            </div>
            <div>
              <p className="text-gray-600">Last Handshake:</p>
              <p className="font-semibold">{handshakePreview}</p>
            </div>
            <div>
              <p className="text-gray-600">Dashboards Online:</p>
              <p className="font-semibold">{dashboardsOnline}</p>
            </div>
          </div>
        </div>

        {/* Connection Log */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Connection Log</h3>
          <div className="h-48 overflow-y-auto bg-gray-50 border border-gray-200 rounded-md p-3 font-mono text-xs text-gray-700 space-y-1">
            {eventLog.length > 0 ? (
              eventLog.map((entry, index) => (
                <div key={`${index}-${entry}`}>{entry}</div>
              ))
            ) : (
              <p className="text-gray-500">Connection events will appear here.</p>
            )}
          </div>
          {connectionError && (
            <p className="text-sm text-red-600 mt-3">{connectionError}</p>
          )}
          {!isRegistered && isConnected && (
            <p className="text-sm text-blue-600 mt-3">Awaiting simulator registration acknowledgement...</p>
          )}
          {pendingReadings > 0 && (
            <p className="text-sm text-amber-600 mt-3">
              {pendingReadings} reading{pendingReadings === 1 ? '' : 's'} awaiting acknowledgement.
            </p>
          )}
          {lastAckStatus === 'error' && lastAckMessage && (
            <p className="text-sm text-red-600 mt-1">Last acknowledgement error: {lastAckMessage}</p>
          )}
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
