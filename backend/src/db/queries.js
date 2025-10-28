/**
 * Database Query Functions
 * Centralized data access layer
 */

const { query } = require('./connection');

/**
 * Meters
 */

// Get or create meter by device ID
async function getOrCreateMeter(deviceId, isSimulator = false) {
  const result = await query(
    `INSERT INTO meters (device_id, is_simulator)
     VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [deviceId, isSimulator]
  );
  return result.rows[0];
}

// Get all meters
async function getAllMeters() {
  const result = await query('SELECT * FROM meters ORDER BY created_at DESC');
  return result.rows;
}

/**
 * Energy Readings
 */

// Insert a new energy reading
async function insertReading(meterId, timestamp, totalPowerKw, frequency = null) {
  const result = await query(
    `INSERT INTO energy_readings (meter_id, timestamp, total_power_kw, frequency)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [meterId, timestamp, totalPowerKw, frequency]
  );
  return result.rows[0];
}

// Get readings for a specific time range
async function getReadingsByTimeRange(meterId, startTime, endTime) {
  const result = await query(
    `SELECT * FROM energy_readings
     WHERE meter_id = $1 AND timestamp >= $2 AND timestamp <= $3
     ORDER BY timestamp ASC`,
    [meterId, startTime, endTime]
  );
  return result.rows;
}

// Get latest reading for a meter
async function getLatestReading(meterId) {
  const result = await query(
    `SELECT * FROM energy_readings
     WHERE meter_id = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [meterId]
  );
  return result.rows[0];
}

/**
 * 30-Minute Blocks
 */

// Insert or update a 30-minute block
async function upsertBlock(meterId, blockStart, blockEnd, totalKwh, avgPowerKw, maxPowerKw, minPowerKw, readingCount, isPeakHour) {
  const result = await query(
    `INSERT INTO thirty_min_blocks
       (meter_id, block_start, block_end, total_kwh, avg_power_kw, max_power_kw, min_power_kw, reading_count, is_peak_hour)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (meter_id, block_start)
     DO UPDATE SET
       total_kwh = $4,
       avg_power_kw = $5,
       max_power_kw = $6,
       min_power_kw = $7,
       reading_count = $8,
       updated_at = NOW()
     RETURNING *`,
    [meterId, blockStart, blockEnd, totalKwh, avgPowerKw, maxPowerKw, minPowerKw, readingCount, isPeakHour]
  );
  return result.rows[0];
}

// Get current (incomplete) 30-minute block
async function getCurrentBlock(meterId) {
  const result = await query(
    `SELECT * FROM thirty_min_blocks
     WHERE meter_id = $1 AND block_end > NOW()
     ORDER BY block_start DESC
     LIMIT 1`,
    [meterId]
  );
  return result.rows[0];
}

// Get blocks for today
async function getBlocksForToday(meterId) {
  const result = await query(
    `SELECT * FROM thirty_min_blocks
     WHERE meter_id = $1
       AND block_start >= CURRENT_DATE
       AND block_start < CURRENT_DATE + INTERVAL '1 day'
     ORDER BY block_start ASC`,
    [meterId]
  );
  return result.rows;
}

// Get blocks in time range
async function getBlocksByTimeRange(meterId, startTime, endTime) {
  const result = await query(
    `SELECT * FROM thirty_min_blocks
     WHERE meter_id = $1
       AND block_start >= $2
       AND block_end <= $3
     ORDER BY block_start ASC`,
    [meterId, startTime, endTime]
  );
  return result.rows;
}

// Delete all data for simulator meters
async function deleteSimulatorData() {
  // Delete readings for simulator meters
  await query(
    `DELETE FROM energy_readings
     WHERE meter_id IN (SELECT id FROM meters WHERE is_simulator = true)`
  );

  // Delete blocks for simulator meters
  await query(
    `DELETE FROM thirty_min_blocks
     WHERE meter_id IN (SELECT id FROM meters WHERE is_simulator = true)`
  );

  // Delete simulator meters
  const result = await query(
    `DELETE FROM meters WHERE is_simulator = true RETURNING *`
  );

  return {
    deleted: result.rowCount,
    meters: result.rows
  };
}

module.exports = {
  // Meters
  getOrCreateMeter,
  getAllMeters,

  // Readings
  insertReading,
  getReadingsByTimeRange,
  getLatestReading,

  // Blocks
  upsertBlock,
  getCurrentBlock,
  getBlocksForToday,
  getBlocksByTimeRange,

  // Admin
  deleteSimulatorData
};
