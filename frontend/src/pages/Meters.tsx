import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Chip from '../components/Chip'
import type { EnergyReading, MeterSummary } from '../types/dashboard'
import {
  getMeterReadings,
  getMeterSummaries,
  updateMeterClientName
} from '../utils/api'

interface MetersPageProps {
  selectedMeterId?: number | null
  onSelectMeter?: (meterId: number) => void
}

function formatDisplayName(meter: MeterSummary) {
  return meter.client_name?.trim() ? meter.client_name.trim() : meter.device_id
}

function formatTimestamp(value?: number | string | null) {
  if (value === null || value === undefined) {
    return '—'
  }

  const numericValue = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numericValue)) {
    return '—'
  }

  const date = new Date(numericValue)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: '2-digit'
  })
}

function formatPower(value?: string | null) {
  if (!value) {
    return '—'
  }
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return value
  }
  return `${numericValue.toFixed(2)} kW`
}

const RECENT_READING_LIMIT = 50

export default function Meters({ selectedMeterId: externalSelectedMeterId = null, onSelectMeter }: MetersPageProps) {
  const [summaries, setSummaries] = useState<MeterSummary[]>([])
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false)
  const [summariesError, setSummariesError] = useState<string | null>(null)

  const [previewMeterId, setPreviewMeterId] = useState<number | null>(
    externalSelectedMeterId !== null && externalSelectedMeterId !== undefined
      ? externalSelectedMeterId
      : null
  )
  const [readings, setReadings] = useState<EnergyReading[]>([])
  const [loadingReadings, setLoadingReadings] = useState<boolean>(false)
  const [readingsError, setReadingsError] = useState<string | null>(null)

  const [editingMeterId, setEditingMeterId] = useState<number | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [isSavingName, setIsSavingName] = useState<boolean>(false)

  const fetchSummaries = useCallback(async () => {
    try {
      setLoadingSummaries(true)
      setSummariesError(null)
      const result = await getMeterSummaries()
      setSummaries(result)

      setPreviewMeterId((current) => {
        if (current !== null && result.some((meter) => meter.id === current)) {
          return current
        }

        if (
          externalSelectedMeterId !== null &&
          externalSelectedMeterId !== undefined &&
          result.some((meter) => meter.id === externalSelectedMeterId)
        ) {
          return externalSelectedMeterId
        }

        const firstWithReadings = result.find((meter) => Number(meter.reading_count) > 0)
        return (firstWithReadings ?? result[0])?.id ?? null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load meters'
      setSummariesError(message)
    } finally {
      setLoadingSummaries(false)
    }
  }, [externalSelectedMeterId])

  const fetchReadings = useCallback(async (meterId: number) => {
    try {
      setLoadingReadings(true)
      setReadingsError(null)
      const { readings: responseReadings } = await getMeterReadings(meterId, RECENT_READING_LIMIT)
      setReadings(responseReadings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load readings'
      setReadingsError(message)
      setReadings([])
    } finally {
      setLoadingReadings(false)
    }
  }, [])

  useEffect(() => {
    fetchSummaries()
  }, [fetchSummaries])

  useEffect(() => {
    if (previewMeterId !== null) {
      fetchReadings(previewMeterId)
    } else {
      setReadings([])
    }
  }, [previewMeterId, fetchReadings])

  useEffect(() => {
    if (
      externalSelectedMeterId !== null &&
      externalSelectedMeterId !== undefined &&
      externalSelectedMeterId !== previewMeterId
    ) {
      setPreviewMeterId(externalSelectedMeterId)
    }
  }, [externalSelectedMeterId, previewMeterId])

  const handleStartEditing = (meter: MeterSummary) => {
    setEditingMeterId(meter.id)
    setEditName(meter.client_name?.trim() || '')
  }

  const handleCancelEditing = () => {
    setEditingMeterId(null)
    setEditName('')
  }

  const handleSaveName = async (meterId: number) => {
    try {
      setIsSavingName(true)
      const trimmed = editName.trim()
      await updateMeterClientName(meterId, trimmed.length > 0 ? trimmed : null)
      setSummaries((prev) =>
        prev.map((meter) => (meter.id === meterId ? { ...meter, client_name: trimmed || null } : meter))
      )
      setEditingMeterId(null)
      setEditName('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update meter name'
      alert(message)
    } finally {
      setIsSavingName(false)
    }
  }

  const previewMeter = useMemo(
    () => summaries.find((meter) => meter.id === previewMeterId) ?? null,
    [previewMeterId, summaries]
  )

  const previewDisplayName = previewMeter ? formatDisplayName(previewMeter) : 'Select a meter'

  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Stored Signal Directory</h2>
          <p className="text-gray-600">
            Every device with persisted readings appears here. Rename meters, inspect stored records, and jump straight to the
            dashboard presentation.
          </p>
        </header>

        <section className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Badge
                variant="lg"
                color={loadingSummaries ? 'offline' : summaries.length > 0 ? 'available' : 'offline'}
                text={loadingSummaries ? 'Loading meters…' : `${summaries.length} meter${summaries.length === 1 ? '' : 's'} detected`}
              />
              <Chip variant="tint" color="brand">
                Preview limit: {RECENT_READING_LIMIT} readings
              </Chip>
            </div>
            <Button onClick={fetchSummaries} disabled={loadingSummaries}>
              🔄 Refresh list
            </Button>
          </div>

          {summariesError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">{summariesError}</div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {summaries.map((meter) => {
              const readingCount = Number(meter.reading_count) || 0
              const hasReadings = readingCount > 0
              const lastReadingLabel = hasReadings
                ? `Last reading ${formatTimestamp(meter.last_reading_timestamp)}`
                : 'No readings stored yet'
              const isEditing = editingMeterId === meter.id

              return (
                <div key={meter.id} className="border border-gray-200 rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => onSelectMeter?.(meter.id)}
                        className="text-lg font-semibold text-blue-600 hover:underline"
                      >
                        {formatDisplayName(meter)}
                      </button>
                      <p className="text-sm text-gray-500">Device ID: {meter.device_id}</p>
                    </div>
                    <Badge
                      variant="lg"
                      color={hasReadings ? 'available' : 'offline'}
                      text={`${readingCount} reading${readingCount === 1 ? '' : 's'}`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <Chip variant="tint" color={hasReadings ? 'brand' : 'warning'}>
                      {lastReadingLabel}
                    </Chip>
                    {hasReadings && (
                      <Chip variant="tint" color="brand">
                        Peak stored power: {formatPower(meter.last_total_power_kw)}
                      </Chip>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        placeholder="Enter display name"
                        className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <Button
                        onClick={() => handleSaveName(meter.id)}
                        disabled={isSavingName}
                        className="whitespace-nowrap"
                      >
                        💾 Save
                      </Button>
                      <Button variant="plain" color="secondary" onClick={handleCancelEditing} disabled={isSavingName}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="plain" color="secondary" onClick={() => handleStartEditing(meter)}>
                        ✏️ Rename
                      </Button>
                      <Button
                        variant="plain"
                        color="primary"
                        onClick={() => {
                          setPreviewMeterId(meter.id)
                          if (meter.id !== previewMeterId) {
                            fetchReadings(meter.id)
                          }
                        }}
                      >
                        🔍 Inspect stored records
                      </Button>
                      <Button
                        variant="plain"
                        color="warning"
                        onClick={() => onSelectMeter?.(meter.id)}
                      >
                        📊 Open dashboard view
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}

            {summaries.length === 0 && !loadingSummaries && (
              <div className="col-span-full text-center text-gray-600 py-10 border border-dashed border-gray-300 rounded-lg">
                <p className="font-semibold">No meters detected yet.</p>
                <p className="text-sm">Run the simulator to register a device and send readings.</p>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Stored readings preview</h3>
              <p className="text-sm text-gray-600">Latest {RECENT_READING_LIMIT} readings saved for {previewDisplayName}.</p>
            </div>
            {previewMeter && (
              <Chip variant="tint" color="brand">
                First stored: {formatTimestamp(previewMeter.first_reading_timestamp)}
              </Chip>
            )}
          </div>

          {readingsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">{readingsError}</div>
          )}

          {loadingReadings ? (
            <div className="h-40 flex items-center justify-center text-gray-600">Loading readings…</div>
          ) : readings.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-gray-600">
              <p className="font-medium">No readings stored for this meter yet.</p>
              <p className="text-sm">Once the simulator sends data, it will appear here immediately.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Power (kW)
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Frequency (Hz)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {readings.map((reading) => {
                    const readingTimestamp =
                      typeof reading.timestamp === 'string' ? Number(reading.timestamp) : reading.timestamp
                    return (
                      <tr key={`${reading.meter_id}-${reading.timestamp}`}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                          {formatTimestamp(readingTimestamp)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                          {formatPower(reading.total_power_kw)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                          {reading.frequency !== null && reading.frequency !== undefined
                            ? `${Number(reading.frequency).toFixed(2)} Hz`
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
