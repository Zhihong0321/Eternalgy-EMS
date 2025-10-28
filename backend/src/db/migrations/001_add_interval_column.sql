-- Migration 001: Add interval column to energy_readings table
-- Add column to track the reading interval (in seconds) for each meter

-- Add interval column to meters table to store the current interval for each meter
ALTER TABLE meters ADD COLUMN reading_interval INTEGER DEFAULT 60;

-- Add interval column to energy_readings table to store the interval used for each reading
ALTER TABLE energy_readings ADD COLUMN reading_interval INTEGER DEFAULT 60;

-- Update existing records to have default 60s interval
UPDATE meters SET reading_interval = 60 WHERE reading_interval IS NULL;
UPDATE energy_readings SET reading_interval = 60 WHERE reading_interval IS NULL;

-- Add comments
COMMENT ON COLUMN meters.reading_interval IS 'Current reading interval in seconds for this meter (e.g., 60 = 1 minute)';
COMMENT ON COLUMN energy_readings.reading_interval IS 'Reading interval in seconds used for this reading';