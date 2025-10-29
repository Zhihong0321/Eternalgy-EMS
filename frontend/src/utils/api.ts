import type {
  DashboardSnapshot,
  Meter,
  MeterSummary,
  EnergyReading
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

const DEFAULT_TIMEOUT_MS = 10000

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  const url = `${baseUrl}${normalizedPath}`

  // Simple retry once for transient failures
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController()
    const timeoutMs = DEFAULT_TIMEOUT_MS
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // If caller provided a signal, abort our controller when theirs aborts
    if (init?.signal) {
      const externalSignal = init.signal as AbortSignal
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        const onAbort = () => controller.abort()
        externalSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers,
        },
        ...init,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const text = await response.text()
        const errorMessage = text || `Request failed with status ${response.status}`

        // Retry only on server errors (5xx) in first attempt
        if (attempt === 1 && response.status >= 500) {
          await new Promise((r) => setTimeout(r, 300))
          continue
        }
        throw new Error(errorMessage)
      }

      if (response.status === 204) {
        return undefined as unknown as T
      }

      return response.json() as Promise<T>
    } catch (error) {
      clearTimeout(timeoutId)
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      const isNetworkError = error instanceof TypeError
      if (attempt === 1 && (isAbort || isNetworkError)) {
        // Wait briefly and retry once
        await new Promise((r) => setTimeout(r, 300))
        continue
      }
      throw error
    }
  }

  // Should never reach here
  throw new Error('Failed to fetch')
}

export async function getMeters(): Promise<Meter[]> {
  return fetchJson('/api/meters')
}

export async function getMeterSummaries(): Promise<MeterSummary[]> {
  return fetchJson('/api/meters/summary')
}

export async function getHealth(): Promise<{ status: string; timestamp: string } | undefined> {
  return fetchJson('/api/health')
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

export async function updateMeterClientName(meterId: number, clientName: string | null) {
  return fetchJson<Meter>(`/api/meters/${meterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ clientName })
  })
}

export async function getMeterReadings(meterId: number, limit = 50) {
  const searchParams = new URLSearchParams()
  if (limit) {
    searchParams.set('limit', String(limit))
  }

  const query = searchParams.toString()
  return fetchJson<{ meter: Meter; readings: EnergyReading[] }>(
    query ? `/api/meters/${meterId}/readings?${query}` : `/api/meters/${meterId}/readings`
  )
}
