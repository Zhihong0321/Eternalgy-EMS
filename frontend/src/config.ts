export function resolveWebSocketUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL?.trim()
  if (envUrl) {
    return envUrl
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1'
    const isWildcardHost = hostname === '0.0.0.0'
    const isPrivateNetworkHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)

    if (isLoopbackHost || isWildcardHost || isPrivateNetworkHost) {
      // Local and private-network development backend defaults to port 3000
      const targetHost = isWildcardHost ? 'localhost' : hostname
      return `ws://${targetHost}:3000`
    }

    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
    const portSegment = port ? `:${port}` : ''
    return `${wsProtocol}//${hostname}${portSegment}`
  }

  // Fallback for non-browser environments
  return 'ws://localhost:3000'
}
