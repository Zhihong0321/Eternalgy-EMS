import { useEffect, useRef, useState, useCallback } from 'react'

interface UseWebSocketReturn {
  ws: WebSocket | null
  isConnected: boolean
  send: (data: any) => boolean
  lastMessage: any
  connectionError: string | null
}

const readyStateMap: Record<number, string> = {
  0: 'CONNECTING',
  1: 'OPEN',
  2: 'CLOSING',
  3: 'CLOSED',
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number>()

  const connect = useCallback(() => {
    try {
      const websocket = new WebSocket(url)

      websocket.onopen = () => {
        console.log(`✅ WebSocket connected to ${url}`)
        setIsConnected(true)
        setConnectionError(null)
      }

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      websocket.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        setConnectionError('WebSocket encountered an error. Check console for details.')
      }

      websocket.onclose = (event) => {
        const reason = event.reason || readyStateMap[websocket.readyState] || 'unknown'
        const message = `WebSocket disconnected (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`
        console.log(message)
        setIsConnected(false)
        wsRef.current = null

        if (!event.wasClean) {
          setConnectionError(`Connection closed unexpectedly (${reason}). Retrying...`)
        }

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log('Attempting to reconnect...')
          connect()
        }, 3000)
      }

      wsRef.current = websocket
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setConnectionError('Failed to create WebSocket connection.')
    }
  }, [url])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
      console.debug(`📤 Sent WebSocket message: ${data.type || 'unknown-type'}`)
      setConnectionError(null)
      return true
    } else {
      const readyState = wsRef.current?.readyState ?? WebSocket.CLOSED
      const stateLabel = readyStateMap[readyState] || 'UNKNOWN'
      const message = `WebSocket is not connected (state: ${stateLabel}). Dropped message ${data.type || 'unknown-type'}`
      console.warn(message)
      setConnectionError(message)
      return false
    }
  }, [])

  return {
    ws: wsRef.current,
    isConnected,
    send,
    lastMessage,
    connectionError,
  }
}
