export interface Meter {
  id: number
  device_id: string
  client_name?: string | null
  is_simulator: boolean
  reading_interval?: number | null
  target_peak_kwh?: number | string | null
  whatsapp_number?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface MeterSummary extends Meter {
  reading_count: number
  first_reading_timestamp?: number | string | null
  last_reading_timestamp?: number | string | null
  last_total_power_kw?: string | null
}

export interface SimulatorInfo {
  deviceId: string
  simulatorName: string
  meterId?: number
}

export interface BlockRecord {
  block_start: string
  block_end: string
  total_kwh: string
  avg_power_kw: string
  max_power_kw: string
  min_power_kw: string
  reading_count: number
  is_peak_hour: boolean
  [key: string]: unknown
}

export interface EnergyReading {
  id?: number
  meter_id: number
  timestamp: number | string
  total_power_kw: string
  frequency?: string | null
  reading_interval?: number | null
  [key: string]: unknown
}

export interface DashboardStats {
  dashboardsOnline: number
  dashboardsReady: boolean
}

export interface DashboardSnapshot {
  timestamp: number
  meter: Meter
  allMeters: Meter[]
  currentBlock: BlockRecord | null
  blockInfo: {
    start: string
    end: string
    isPeakHour: boolean
  }
  blocksToday: BlockRecord[]
  lastTenBlocks: BlockRecord[]
  readings: EnergyReading[]
  connectedSimulators: SimulatorInfo[]
  dashboardStats: DashboardStats
}
