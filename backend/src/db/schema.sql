-- Eternalgy EMS Database Schema
-- PostgreSQL

-- Table: meters
-- Stores registered energy meters
CREATE TABLE IF NOT EXISTS meters (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  client_name VARCHAR(255),
  is_simulator BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: energy_readings
-- Stores raw 1-minute power readings from meters
CREATE TABLE IF NOT EXISTS energy_readings (
  id SERIAL PRIMARY KEY,
  meter_id INTEGER REFERENCES meters(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,
  total_power_kw DECIMAL(10,2) NOT NULL,
  frequency DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster time-based queries
CREATE INDEX IF NOT EXISTS idx_energy_readings_meter_timestamp
  ON energy_readings(meter_id, timestamp DESC);

-- Table: thirty_min_blocks
-- Stores aggregated 30-minute energy consumption blocks
CREATE TABLE IF NOT EXISTS thirty_min_blocks (
  id SERIAL PRIMARY KEY,
  meter_id INTEGER REFERENCES meters(id) ON DELETE CASCADE,
  block_start TIMESTAMP NOT NULL,
  block_end TIMESTAMP NOT NULL,
  total_kwh DECIMAL(10,4) NOT NULL,
  avg_power_kw DECIMAL(10,2),
  max_power_kw DECIMAL(10,2),
  min_power_kw DECIMAL(10,2),
  reading_count INTEGER NOT NULL,
  is_peak_hour BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster block queries
CREATE INDEX IF NOT EXISTS idx_thirty_min_blocks_meter_start
  ON thirty_min_blocks(meter_id, block_start DESC);

-- Unique constraint: one block per meter per time period
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_meter_block
  ON thirty_min_blocks(meter_id, block_start);

-- Function: Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on meters table
DROP TRIGGER IF EXISTS update_meters_updated_at ON meters;
CREATE TRIGGER update_meters_updated_at
  BEFORE UPDATE ON meters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at on thirty_min_blocks table
DROP TRIGGER IF EXISTS update_blocks_updated_at ON thirty_min_blocks;
CREATE TRIGGER update_blocks_updated_at
  BEFORE UPDATE ON thirty_min_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data: Create default simulator meter
INSERT INTO meters (device_id, client_name, is_simulator)
VALUES ('EMS-SIMULATOR-001', 'Web Simulator', TRUE)
ON CONFLICT (device_id) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE meters IS 'Registered energy meters and simulators';
COMMENT ON TABLE energy_readings IS 'Raw 1-minute power readings (kW)';
COMMENT ON TABLE thirty_min_blocks IS 'Aggregated 30-minute energy consumption (kWh)';
COMMENT ON COLUMN thirty_min_blocks.total_kwh IS 'Calculated as: Σ(power_kw) × (1/60)';
COMMENT ON COLUMN thirty_min_blocks.is_peak_hour IS 'Peak hours: 2:00 PM - 10:00 PM (14:00-22:00)';
