export interface WebSocketConfig {
  primaryUrl: string
  fallbackUrls: string[]
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/g, '')
}

function pushUnique(target: string[], candidate: string | null) {
  if (!candidate) return
  if (!target.includes(candidate)) {
    target.push(candidate)
  }
}

function addOriginWithFallbacks(target: string[], origin: string) {
  pushUnique(target, origin)
  pushUnique(target, `${origin}/ws`)
  pushUnique(target, `${origin}/socket`)
  pushUnique(target, `${origin}/websocket`)
}

function addUrlWithFallbacks(target: string[], rawUrl: string) {
  const normalized = normalizeUrl(rawUrl)
  if (!normalized) return

  try {
    const parsed = new URL(normalized)
    const origin = `${parsed.protocol}//${parsed.host}`
    const pathname = parsed.pathname.replace(/\/+$/g, '')

    if (pathname && pathname !== '/') {
      pushUnique(target, `${origin}${pathname.startsWith('/') ? pathname : `/${pathname}`}`)
      addOriginWithFallbacks(target, origin)
    } else {
      addOriginWithFallbacks(target, origin)
    }
  } catch (error) {
    // Fallback: assume the value is already a usable WebSocket URL
    pushUnique(target, normalized)
    addOriginWithFallbacks(target, normalized)
  }
}

export function resolveWebSocketConfig(): WebSocketConfig {
  const candidates: string[] = []
  const envUrl = normalizeUrl(import.meta.env.VITE_WS_URL)

  if (envUrl) {
    addUrlWithFallbacks(candidates, envUrl)
  } else if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1'
    const isWildcardHost = hostname === '0.0.0.0'
    const isPrivateNetworkHost = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)

    if (isLoopbackHost || isWildcardHost || isPrivateNetworkHost) {
      const targetHost = isWildcardHost ? 'localhost' : hostname
      addUrlWithFallbacks(candidates, `ws://${targetHost}:3000`)
    } else {
      const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
      const portSegment = port ? `:${port}` : ''
      addUrlWithFallbacks(candidates, `${wsProtocol}//${hostname}${portSegment}`)
    }
  }

  if (candidates.length === 0) {
    addUrlWithFallbacks(candidates, 'ws://localhost:3000')
  }

  const [primaryUrl, ...fallbackUrls] = candidates
  return { primaryUrl, fallbackUrls }
}

export function resolveWebSocketUrl(): string {
  return resolveWebSocketConfig().primaryUrl
}
