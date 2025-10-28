/**
 * 30-Minute Block Aggregator
 * Calculates energy consumption (kWh) from power readings (kW)
 *
 * Formula: Total kWh = Σ(Power_kW) × (1/60)
 * Peak Hours: 2:00 PM - 10:00 PM (14:00-22:00)
 */

const { getReadingsByTimeRange, upsertBlock } = require('../db/queries');

/**
 * Get the start of the current 30-minute block
 * Blocks start at :00 and :30 of every hour
 */
function getCurrentBlockStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const minutes = date.getMinutes();
  const blockMinutes = minutes < 30 ? 0 : 30;

  date.setMinutes(blockMinutes, 0, 0); // Set to :00 or :30, zero seconds/ms
  return date;
}

/**
 * Get the end of a 30-minute block (30 minutes after start)
 */
function getBlockEnd(blockStart) {
  const end = new Date(blockStart);
  end.setMinutes(end.getMinutes() + 30);
  return end;
}

/**
 * Check if a given hour is peak hour (14:00-22:00)
 */
function isPeakHour(timestamp) {
  const hour = new Date(timestamp).getHours();
  return hour >= 14 && hour < 22;
}

/**
 * Calculate 30-minute block energy consumption
 *
 * @param {number} meterId - Meter ID
 * @param {Date} blockStart - Start of 30-min block
 * @param {Date} blockEnd - End of 30-min block
 * @returns {Object} Block calculation result
 */
async function calculateBlock(meterId, blockStart, blockEnd) {
  // Get all readings in this block
  const readings = await getReadingsByTimeRange(
    meterId,
    blockStart.getTime(),
    blockEnd.getTime()
  );

  if (readings.length === 0) {
    return null; // No data for this block
  }

  // Extract power values
  const powerValues = readings.map(r => parseFloat(r.total_power_kw));

  // Calculate metrics
  const sumPower = powerValues.reduce((sum, power) => sum + power, 0);
  const avgPower = sumPower / readings.length;
  const maxPower = Math.max(...powerValues);
  const minPower = Math.min(...powerValues);

  // Calculate total kWh using formula: Σ(kW) × (1/60)
  const totalKwh = sumPower * (1 / 60);

  const isPeak = isPeakHour(blockStart);

  // Save to database
  const block = await upsertBlock(
    meterId,
    blockStart,
    blockEnd,
    totalKwh,
    avgPower,
    maxPower,
    minPower,
    readings.length,
    isPeak
  );

  return {
    ...block,
    readings: readings.length
  };
}

/**
 * Calculate the current (possibly incomplete) 30-minute block
 * This is used for real-time dashboard updates
 */
async function calculateBlockForTimestamp(meterId, timestamp = Date.now()) {
  const blockStart = getCurrentBlockStart(timestamp);
  const blockEnd = getBlockEnd(blockStart);

  const block = await calculateBlock(meterId, blockStart, blockEnd);

  return {
    block,
    blockStart,
    blockEnd,
    isPeakHour: isPeakHour(timestamp)
  };
}

async function calculateCurrentBlock(meterId) {
  const { block } = await calculateBlockForTimestamp(meterId, Date.now());
  return block;
}

/**
 * Calculate all blocks for a given day
 * Useful for backfilling historical data
 */
async function calculateBlocksForDay(meterId, date = new Date()) {
  const blocks = [];

  // Set to start of day
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  // Set to end of day
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Generate all 48 blocks for the day (24 hours × 2 blocks/hour)
  let currentBlockStart = new Date(dayStart);

  while (currentBlockStart < dayEnd) {
    const blockEnd = getBlockEnd(currentBlockStart);

    try {
      const block = await calculateBlock(meterId, currentBlockStart, blockEnd);
      if (block) {
        blocks.push(block);
      }
    } catch (error) {
      console.error(`Error calculating block at ${currentBlockStart}:`, error);
    }

    // Move to next 30-minute block
    currentBlockStart = new Date(blockEnd);
  }

  return blocks;
}

module.exports = {
  getCurrentBlockStart,
  getBlockEnd,
  isPeakHour,
  calculateBlock,
  calculateBlockForTimestamp,
  calculateCurrentBlock,
  calculateBlocksForDay
};
