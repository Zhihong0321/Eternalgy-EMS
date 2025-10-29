import { useMemo, useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea
} from 'recharts'
import type { EnergyReading } from '../types/dashboard'

type ChartPoint = {
  time: string
  kW: number
  cumulative_kWh: number
}

function toTimeLabel(ts: number | string) {
  const n = typeof ts === 'string' ? Number(ts) : ts
  return new Date(n).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

interface EnergyUsageChartProps {
  readings: EnergyReading[]
  readingIntervalSeconds?: number | null
  isPeakHour?: boolean
  defaultShowAccumulation?: boolean
}

/**
 * Builds chart points for instantaneous kW (bar) and cumulative kWh (line).
 * If readingIntervalSeconds is not provided, we derive per-point dt from adjacent timestamps.
 */
function buildChartPoints(
  readings: EnergyReading[],
  readingIntervalSeconds?: number | null
): ChartPoint[] {
  if (!readings || readings.length === 0) return []
  const sorted = readings
    .slice()
    .sort((a, b) => {
      const ta = typeof a.timestamp === 'string' ? Number(a.timestamp) : a.timestamp
      const tb = typeof b.timestamp === 'string' ? Number(b.timestamp) : b.timestamp
      return ta - tb
    })

  let cumulative = 0
  const points: ChartPoint[] = []

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    const t = typeof r.timestamp === 'string' ? Number(r.timestamp) : r.timestamp
    const kW = Number.parseFloat(r.total_power_kw)

    // Derive dt seconds: prefer provided interval, else difference from previous
    let dtSec: number = Number.isFinite(readingIntervalSeconds || NaN)
      ? (readingIntervalSeconds as number)
      : 0
    if (!dtSec && i > 0) {
      const prev = sorted[i - 1]
      const tp = typeof prev.timestamp === 'string' ? Number(prev.timestamp) : prev.timestamp
      dtSec = Math.max(0, Math.round((t - tp) / 1000))
    }
    // Fallback to a sensible default if we still don't have dt
    if (!dtSec || !Number.isFinite(dtSec)) dtSec = 30

    const kWh = Number.isFinite(kW) ? (kW * dtSec) / 3600 : 0
    cumulative += kWh

    points.push({ time: toTimeLabel(t), kW: Number.isFinite(kW) ? kW : 0, cumulative_kWh: cumulative })
  }
  return points
}

export default function EnergyUsageChart({
  readings,
  readingIntervalSeconds,
  isPeakHour = false,
  defaultShowAccumulation = true
}: EnergyUsageChartProps) {
  const [showAccumulation, setShowAccumulation] = useState<boolean>(defaultShowAccumulation)

  const data = useMemo(
    () => buildChartPoints(readings, readingIntervalSeconds),
    [readings, readingIntervalSeconds]
  )

  const hasData = data.length > 0

  return (
    <div className="bg-slate-900 text-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Energy Usage (30 min)</h4>
        <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
          <span>Accumulation</span>
          <input
            type="checkbox"
            className="accent-cyan-400"
            checked={showAccumulation}
            onChange={(e) => setShowAccumulation(e.target.checked)}
          />
        </label>
      </div>

      {hasData ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: '#cbd5e1', fontSize: 12 }} label={{ value: 'kW', position: 'insideLeft', fill: '#cbd5e1', fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: 12 }} label={{ value: 'kWh', position: 'insideRight', fill: '#cbd5e1', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                labelStyle={{ color: '#e2e8f0' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />

              {isPeakHour && (
                <ReferenceArea yAxisId="left" x1={data[0].time} x2={data[data.length - 1].time} fill="#f59e0b" fillOpacity={0.08} />
              )}

              <Bar yAxisId="left" dataKey="kW" name="Usage (kW)" fill="#4F46E5" radius={[2, 2, 0, 0]} />
              {showAccumulation && (
                <Line yAxisId="right" type="monotone" dataKey="cumulative_kWh" name="Accumulation (kWh)" stroke="#06B6D4" strokeWidth={2} dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-72 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700 text-center">
          <div>
            <p className="text-slate-200 font-medium">No readings in current block.</p>
            <p className="text-xs text-slate-400 mt-1">Run the simulator and refresh to see energy usage.</p>
          </div>
        </div>
      )}
    </div>
  )
}