/**
 * Database Query Functions
 * Centralized data access layer
 */

const { query } = require('./connection');

/**
 * Meters
 */

// Get or create meter by device ID
async function getOrCreateMeter(deviceId, isSimulator = false, clientName = null) {
  const result = await query(
    `INSERT INTO meters (device_id, is_simulator, client_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE SET
       updated_at = NOW(),
       is_simulator = EXCLUDED.is_simulator,
       client_name = COALESCE(EXCLUDED.client_name, meters.client_name)
     RETURNING *`,
    [deviceId, isSimulator, clientName]
  );
  return result.rows[0];
}

// Get all meters
async function getAllMeters() {
  const result = await query('SELECT * FROM meters ORDER BY created_at DESC');
  return result.rows;
}

async function getMetersWithStats() {
  const result = await query(
    `SELECT
       m.*, 
       COALESCE(stats.reading_count, 0) AS reading_count,
       stats.first_reading_timestamp,
       stats.last_reading_timestamp,
       stats.last_total_power_kw
     FROM meters m
     LEFT JOIN (
       SELECT
         r.meter_id,
         COUNT(*)::BIGINT AS reading_count,
         MIN(r.timestamp) AS first_reading_timestamp,
         MAX(r.timestamp) AS last_reading_timestamp,
         (ARRAY_AGG(r.total_power_kw ORDER BY r.timestamp DESC))[1] AS last_total_power_kw
       FROM energy_readings r
       GROUP BY r.meter_id
     ) stats ON stats.meter_id = m.id
     ORDER BY m.created_at DESC`
  );
  return result.rows;
}

// Get meter by ID
async function getMeterById(meterId) {
  const result = await query(
    'SELECT * FROM meters WHERE id = $1 LIMIT 1',
    [meterId]
  );
  return result.rows[0] || null;
}

// Get meter by device ID
async function getMeterByDeviceId(deviceId) {
  const result = await query(
    'SELECT * FROM meters WHERE device_id = $1 LIMIT 1',
    [deviceId]
  );
  return result.rows[0] || null;
}

async function updateMeterName(meterId, clientName) {
  const result = await query(
    `UPDATE meters
     SET client_name = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [clientName, meterId]
  );

  return result.rows[0] || null;
}

// Update meter reading interval
async function updateMeterReadingInterval(meterId, readingInterval) {
  const result = await query(
    `UPDATE meters
     SET reading_interval = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [readingInterval, meterId]
  );
  return result.rows[0];
}

/**
 * Energy Readings
 */

// Insert a new energy reading
async function insertReading(meterId, timestamp, totalPowerKw, frequency = null, readingInterval = 60) {
  const result = await query(
    `INSERT INTO energy_readings (meter_id, timestamp, total_power_kw, frequency, reading_interval)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [meterId, timestamp, totalPowerKw, frequency, readingInterval]
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

// Get most recent readings for a meter
async function getRecentReadings(meterId, limit = 30) {
  const result = await query(
    `SELECT * FROM energy_readings
     WHERE meter_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [meterId, limit]
  );

  // Return in chronological order for charting
  return result.rows.reverse();
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

// Get last N completed blocks
async function getLastNBlocks(meterId, limit = 10) {
  const result = await query(
    `SELECT * FROM thirty_min_blocks
     WHERE meter_id = $1
       AND block_end <= NOW()
     ORDER BY block_start DESC
     LIMIT $2`,
    [meterId, limit]
  );
  return result.rows.reverse(); // Return in chronological order
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
  getMeterById,
  getMeterByDeviceId,
  getMetersWithStats,
  updateMeterName,
  updateMeterReadingInterval,

  // Readings
  insertReading,
  getReadingsByTimeRange,
  getLatestReading,
  getRecentReadings,

  // Blocks
  upsertBlock,
  getCurrentBlock,
  getBlocksForToday,
  getBlocksByTimeRange,
  getLastNBlocks,

  // Admin
  deleteSimulatorData
};
