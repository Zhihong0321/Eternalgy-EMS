import { useMemo, useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea
} from 'recharts'
import type { EnergyReading, BlockRecord } from '../types/dashboard'

type EnergyUsageChartProps = {
  readings: EnergyReading[]
  blockInfo?: { start: string; end: string; isPeakHour: boolean } | null
  currentBlock?: BlockRecord | null
  dark?: boolean
  defaultAccumulationOn?: boolean
  // When true and a block window is provided, render fixed-width bars by preallocating
  // minute slots across the block (e.g., a 30-minute window). This reserves space for
  // future minutes so bar width stays consistent.
  fixedWidthPerMinute?: boolean
  // Pixel width for each bar when fixed width mode is enabled.
  barPixelWidth?: number
}

type ChartPoint = {
  timestamp: number
  timeLabel: string
  total_power_kw: number
  kwh_increment: number
  cumulative_kwh: number
}

function toNumberTimestamp(ts: number | string): number {
  return typeof ts === 'string' ? Number(ts) : ts
}

export default function EnergyUsageChart({
  readings,
  blockInfo,
  currentBlock,
  dark = true,
  defaultAccumulationOn = true,
  fixedWidthPerMinute = true,
  barPixelWidth = 10
}: EnergyUsageChartProps) {
  const [showAccumulation, setShowAccumulation] = useState<boolean>(defaultAccumulationOn)

  const windowStart = blockInfo ? new Date(blockInfo.start).getTime() : null
  const windowEnd = blockInfo ? new Date(blockInfo.end).getTime() : null

  const data = useMemo<ChartPoint[]>(() => {
    if (!readings || readings.length === 0) return []

    // Sort by timestamp ascending to ensure correct accumulation
    const sorted = [...readings].sort((a, b) => toNumberTimestamp(a.timestamp) - toNumberTimestamp(b.timestamp))

    let cumulative = 0
    const points: ChartPoint[] = []

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      const ts = toNumberTimestamp(r.timestamp)

      // Optional clamp to block time window
      if (windowStart !== null && windowEnd !== null) {
        if (ts < windowStart || ts > windowEnd) continue
      }

      const kW = parseFloat(r.total_power_kw)
      const intervalSec = r.reading_interval ?? null

      // Fallback: infer interval from next reading if not provided
      let intervalHours = 0
      if (typeof intervalSec === 'number' && Number.isFinite(intervalSec) && intervalSec > 0) {
        intervalHours = intervalSec / 3600
      } else {
        const nextTs = i < sorted.length - 1 ? toNumberTimestamp(sorted[i + 1].timestamp) : ts
        const diffMs = Math.max(0, nextTs - ts)
        intervalHours = diffMs / 3600000
      }

      const kwhInc = Number.isFinite(kW) && intervalHours > 0 ? kW * intervalHours : 0
      cumulative += kwhInc

      points.push({
        timestamp: ts,
        timeLabel: new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        total_power_kw: Number.isFinite(kW) ? kW : 0,
        kwh_increment: kwhInc,
        cumulative_kwh: cumulative
      })
    }

    // If a block window is provided and fixed width mode is enabled, preallocate minute slots
    // across the window to keep bar width constant (reserve space for future minutes).
    if (
      fixedWidthPerMinute &&
      windowStart !== null &&
      windowEnd !== null &&
      Number.isFinite(windowStart) &&
      Number.isFinite(windowEnd) &&
      windowEnd > windowStart
    ) {
      const slotMs = 60_000 // 1 minute slots
      const slots: ChartPoint[] = []
      let j = 0
      let lastCumulative = 0
      const n = points.length

      for (let t = windowStart; t <= windowEnd; t += slotMs) {
        // Advance through points up to current slot time
        let kwForThisMinute: number | null = null
        while (j < n && points[j].timestamp <= t) {
          lastCumulative = points[j].cumulative_kwh
          // Use the latest reading that falls within this minute
          const minuteTs = Math.floor(points[j].timestamp / slotMs) * slotMs
          if (minuteTs === Math.floor(t / slotMs) * slotMs) {
            kwForThisMinute = points[j].total_power_kw
          }
          j++
        }

        const label = new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        slots.push({
          timestamp: t,
          timeLabel: label,
          total_power_kw: kwForThisMinute ?? 0,
          kwh_increment: 0, // show per-minute increment as 0 to avoid misleading spikes
          cumulative_kwh: lastCumulative
        })
      }

      return slots
    }

    return points
  }, [readings, windowStart, windowEnd, fixedWidthPerMinute])

  const isPeak = blockInfo?.isPeakHour || false

  const colors = {
    bg: dark ? '#0b1220' : '#ffffff',
    grid: dark ? '#1f2937' : '#e5e7eb',
    axis: dark ? '#374151' : '#6b7280',
    tick: dark ? '#9CA3AF' : '#374151',
    bar: '#60A5FA',
    line: '#9BD0FF',
    peakFill: dark ? 'rgba(253, 230, 138, 0.12)' : 'rgba(253, 230, 138, 0.25)'
  }

  return (
    <div className={dark ? 'bg-[#0b1220] rounded-lg p-2' : ''}>
      <div className="flex items-center justify-end mb-2">
        <label className="flex items-center gap-2 text-sm">
          <span className={dark ? 'text-gray-300' : 'text-gray-700'}>Accumulation</span>
          <input
            type="checkbox"
            checked={showAccumulation}
            onChange={(e) => setShowAccumulation(e.target.checked)}
          />
        </label>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" />
          {/* Category axis by minute label; interval reduces clutter. */}
          <XAxis
            dataKey="timeLabel"
            tick={{ fontSize: 12, fill: colors.tick }}
            stroke={colors.axis}
            interval={4}
          />
          {/* Left axis: kW */}
          <YAxis yAxisId="left" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.axis} />
          {/* Right axis: kWh */}
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: colors.tick }} stroke={colors.axis} />
          <Tooltip
            contentStyle={{ backgroundColor: dark ? '#111827' : '#ffffff', border: `1px solid ${colors.axis}`, borderRadius: '8px', color: dark ? '#fff' : '#111' }}
            labelStyle={{ color: colors.tick }}
            itemStyle={{ color: dark ? '#fff' : '#111' }}
          />
          <Legend />

          {/* Peak hour highlight */}
          {isPeak && blockInfo && (
            <ReferenceArea
              x1={new Date(blockInfo.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              x2={new Date(blockInfo.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              y1={0}
              y2={Math.max(
                currentBlock ? parseFloat(currentBlock.max_power_kw || '0') : 0,
                data.length > 0 ? Math.max(...data.map((d) => d.cumulative_kwh)) : 0
              )}
              fill={colors.peakFill}
              ifOverflow="extendDomain"
            />
          )}

          {/* Bars: instantaneous power (kW). Use fixed pixel width to avoid "fat" bars when fewer points. */}
          <Bar
            yAxisId="left"
            dataKey="total_power_kw"
            name="Power (kW)"
            fill={colors.bar}
            radius={[6, 6, 0, 0]}
            barSize={barPixelWidth}
            maxBarSize={barPixelWidth}
          />

          {/* Line: accumulated energy (kWh) on right axis */}
          {showAccumulation && (
            <Line yAxisId="right" type="monotone" dataKey="cumulative_kwh" name="Accumulation (kWh)" stroke={colors.line} dot={false} strokeWidth={2} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}