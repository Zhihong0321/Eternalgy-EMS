export function resolveWebSocketUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL?.trim()
  if (envUrl) {
    return envUrl
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

    if (isLocalhost) {
      // Local development backend defaults to port 3000
      return `ws://${hostname}:3000`
    }

    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
    const portSegment = port ? `:${port}` : ''
    return `${wsProtocol}//${hostname}${portSegment}`
  }

  // Fallback for non-browser environments
  return 'ws://localhost:3000'
}
