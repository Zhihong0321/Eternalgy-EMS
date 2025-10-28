import type {
  DashboardSnapshot,
  Meter
} from '../types/dashboard'

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/g, '')
}

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && envUrl.trim()) {
    return normalizeBaseUrl(envUrl.trim())
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
    const isWildcard = hostname === '0.0.0.0'
    const isPrivate = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)

    if (isLocal || isWildcard || isPrivate) {
      const targetHost = isWildcard ? 'localhost' : hostname
      return `http://${targetHost}:3000`
    }

    return `${protocol}//${hostname}${port ? `:${port}` : ''}`
  }

  return 'http://localhost:3000'
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const response = await fetch(`${baseUrl}${normalizedPath}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json() as Promise<T>
}

export async function getMeters(): Promise<Meter[]> {
  return fetchJson('/api/meters')
}

interface SnapshotParams {
  meterId?: number
  deviceId?: string
  limit?: number
}

export async function getDashboardSnapshot(params: SnapshotParams = {}): Promise<DashboardSnapshot> {
  const searchParams = new URLSearchParams()
  if (params.meterId !== undefined) {
    searchParams.set('meterId', String(params.meterId))
  }
  if (params.deviceId) {
    searchParams.set('deviceId', params.deviceId)
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()
  const path = query ? `/api/dashboard/snapshot?${query}` : '/api/dashboard/snapshot'
  return fetchJson(path)
}

export async function wipeSimulatorData() {
  return fetchJson<{ success: boolean; deleted: number; message: string }>('/api/simulators/data', {
    method: 'DELETE'
  })
}
