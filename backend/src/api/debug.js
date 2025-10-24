/**
 * DEBUG & TESTING API ENDPOINTS
 *
 * This module provides comprehensive testing and debugging endpoints
 * for validating backend functionality without requiring frontend or simulator.
 *
 * ⚠️ IMPORTANT: These endpoints should be disabled or protected in production!
 */

const express = require('express');
const router = express.Router();

const { query, pool } = require('../db/connection');
const {
  getOrCreateMeter,
  getAllMeters,
  insertReading,
  getReadingsByTimeRange,
  getLatestReading,
  upsertBlock,
  getCurrentBlock,
  getBlocksForToday,
  getBlocksByTimeRange
} = require('../db/queries');

const {
  getCurrentBlockStart,
  getBlockEnd,
  isPeakHour,
  calculateBlock,
  calculateCurrentBlock,
  calculateBlocksForDay
} = require('../services/blockAggregator');

/**
 * ========================================
 * DATABASE CONNECTION TESTS
 * ========================================
 */

// Test database connection
router.get('/db/test-connection', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as current_time, version() as db_version');
    res.json({
      status: 'success',
      connected: true,
      serverTime: result.rows[0].current_time,
      dbVersion: result.rows[0].db_version
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      connected: false,
      error: error.message
    });
  }
});

// Get database pool status
router.get('/db/pool-status', (req, res) => {
  res.json({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

// Check if all tables exist
router.get('/db/check-tables', async (req, res) => {
  try {
    const result = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = result.rows.map(r => r.table_name);
    const expectedTables = ['meters', 'energy_readings', 'thirty_min_blocks'];
    const missingTables = expectedTables.filter(t => !tables.includes(t));

    res.json({
      status: missingTables.length === 0 ? 'success' : 'warning',
      tables,
      expectedTables,
      missingTables,
      allTablesExist: missingTables.length === 0
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get table row counts
router.get('/db/table-counts', async (req, res) => {
  try {
    const meters = await query('SELECT COUNT(*) as count FROM meters');
    const readings = await query('SELECT COUNT(*) as count FROM energy_readings');
    const blocks = await query('SELECT COUNT(*) as count FROM thirty_min_blocks');

    res.json({
      meters: parseInt(meters.rows[0].count),
      energy_readings: parseInt(readings.rows[0].count),
      thirty_min_blocks: parseInt(blocks.rows[0].count),
      totalRecords: parseInt(meters.rows[0].count) +
                    parseInt(readings.rows[0].count) +
                    parseInt(blocks.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * ========================================
 * METER TESTS
 * ========================================
 */

// List all meters with details
router.get('/meters/list', async (req, res) => {
  try {
    const meters = await getAllMeters();

    // Get additional stats for each meter
    const metersWithStats = await Promise.all(meters.map(async (meter) => {
      const readingCount = await query(
        'SELECT COUNT(*) as count FROM energy_readings WHERE meter_id = $1',
        [meter.id]
      );
      const blockCount = await query(
        'SELECT COUNT(*) as count FROM thirty_min_blocks WHERE meter_id = $1',
        [meter.id]
      );
      const latestReading = await getLatestReading(meter.id);

      return {
        ...meter,
        stats: {
          totalReadings: parseInt(readingCount.rows[0].count),
          totalBlocks: parseInt(blockCount.rows[0].count),
          latestReading: latestReading || null
        }
      };
    }));

    res.json({
      count: meters.length,
      meters: metersWithStats
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Create test meter
router.post('/meters/create-test', async (req, res) => {
  try {
    const deviceId = req.body.deviceId || `TEST-METER-${Date.now()}`;
    const isSimulator = req.body.isSimulator !== false; // default true

    const meter = await getOrCreateMeter(deviceId, isSimulator);

    res.json({
      status: 'success',
      meter,
      message: `Meter created/updated: ${deviceId}`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * ========================================
 * READING TESTS
 * ========================================
 */

// Insert test reading
router.post('/readings/insert-test', async (req, res) => {
  try {
    const {
      deviceId = 'TEST-METER-001',
      totalPowerKw = 50.5,
      timestamp = Date.now(),
      frequency = 60.0
    } = req.body;

    // Get or create meter
    const meter = await getOrCreateMeter(deviceId, true);

    // Insert reading
    const reading = await insertReading(
      meter.id,
      timestamp,
      totalPowerKw,
      frequency
    );

    res.json({
      status: 'success',
      meter,
      reading,
      message: `Reading inserted: ${totalPowerKw} kW`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Insert multiple test readings (for populating current block)
router.post('/readings/insert-batch', async (req, res) => {
  try {
    const {
      deviceId = 'TEST-METER-001',
      count = 10,
      minPower = 30,
      maxPower = 150,
      startTime // Optional: start from specific time
    } = req.body;

    const meter = await getOrCreateMeter(deviceId, true);
    const readings = [];

    // Calculate starting timestamp (default to start of current block)
    const baseTime = startTime ? new Date(startTime) : getCurrentBlockStart();

    for (let i = 0; i < count; i++) {
      // Random power between min and max
      const power = minPower + Math.random() * (maxPower - minPower);

      // Timestamp: 1 minute apart
      const timestamp = new Date(baseTime.getTime() + (i * 60 * 1000));

      const reading = await insertReading(
        meter.id,
        timestamp.getTime(),
        parseFloat(power.toFixed(2)),
        60.0
      );

      readings.push(reading);
    }

    res.json({
      status: 'success',
      meter,
      insertedCount: readings.length,
      readings,
      message: `Inserted ${count} test readings for ${deviceId}`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get readings for current block
router.get('/readings/current-block/:deviceId?', async (req, res) => {
  try {
    const deviceId = req.params.deviceId || 'TEST-METER-001';
    const meter = await getOrCreateMeter(deviceId, true);

    const blockStart = getCurrentBlockStart();
    const blockEnd = getBlockEnd(blockStart);

    const readings = await getReadingsByTimeRange(
      meter.id,
      blockStart.getTime(),
      blockEnd.getTime()
    );

    res.json({
      status: 'success',
      meter,
      blockStart,
      blockEnd,
      readingCount: readings.length,
      readings
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * ========================================
 * BLOCK CALCULATION TESTS
 * ========================================
 */

// Test block calculation for current block
router.get('/blocks/calculate-current/:deviceId?', async (req, res) => {
  try {
    const deviceId = req.params.deviceId || 'TEST-METER-001';
    const meter = await getOrCreateMeter(deviceId, true);

    const blockStart = getCurrentBlockStart();
    const blockEnd = getBlockEnd(blockStart);
    const isPeak = isPeakHour(Date.now());

    const block = await calculateCurrentBlock(meter.id);

    res.json({
      status: 'success',
      meter,
      blockInfo: {
        start: blockStart,
        end: blockEnd,
        isPeakHour: isPeak,
        minutesElapsed: Math.floor((Date.now() - blockStart.getTime()) / 60000)
      },
      block: block || { message: 'No readings in current block' }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Calculate all blocks for today
router.get('/blocks/calculate-today/:deviceId?', async (req, res) => {
  try {
    const deviceId = req.params.deviceId || 'TEST-METER-001';
    const meter = await getOrCreateMeter(deviceId, true);

    const blocks = await calculateBlocksForDay(meter.id);

    res.json({
      status: 'success',
      meter,
      date: new Date().toISOString().split('T')[0],
      blockCount: blocks.length,
      blocks
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get today's blocks from database
router.get('/blocks/today/:deviceId?', async (req, res) => {
  try {
    const deviceId = req.params.deviceId || 'TEST-METER-001';
    const meter = await getOrCreateMeter(deviceId, true);

    const blocks = await getBlocksForToday(meter.id);

    // Calculate peak vs off-peak stats
    const peakBlocks = blocks.filter(b => b.is_peak_hour);
    const offPeakBlocks = blocks.filter(b => !b.is_peak_hour);

    const totalPeakKwh = peakBlocks.reduce((sum, b) => sum + parseFloat(b.total_kwh || 0), 0);
    const totalOffPeakKwh = offPeakBlocks.reduce((sum, b) => sum + parseFloat(b.total_kwh || 0), 0);

    res.json({
      status: 'success',
      meter,
      date: new Date().toISOString().split('T')[0],
      summary: {
        totalBlocks: blocks.length,
        peakBlocks: peakBlocks.length,
        offPeakBlocks: offPeakBlocks.length,
        totalPeakKwh: totalPeakKwh.toFixed(4),
        totalOffPeakKwh: totalOffPeakKwh.toFixed(4),
        totalKwh: (totalPeakKwh + totalOffPeakKwh).toFixed(4)
      },
      blocks
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * ========================================
 * UTILITY FUNCTIONS TESTS
 * ========================================
 */

// Test time calculations
router.get('/utils/time-info', (req, res) => {
  const now = Date.now();
  const timestamp = req.query.timestamp ? parseInt(req.query.timestamp) : now;

  const blockStart = getCurrentBlockStart(timestamp);
  const blockEnd = getBlockEnd(blockStart);
  const isPeak = isPeakHour(timestamp);

  const currentTime = new Date(timestamp);
  const minutesIntoBlock = Math.floor((timestamp - blockStart.getTime()) / 60000);
  const minutesRemaining = 30 - minutesIntoBlock;

  res.json({
    currentTime: currentTime.toISOString(),
    timestamp,
    blockStart: blockStart.toISOString(),
    blockEnd: blockEnd.toISOString(),
    isPeakHour: isPeak,
    blockProgress: {
      minutesElapsed: minutesIntoBlock,
      minutesRemaining,
      percentComplete: ((minutesIntoBlock / 30) * 100).toFixed(1)
    }
  });
});

// Test peak hour detection for a range
router.get('/utils/peak-hours-today', (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hours = [];
  for (let h = 0; h < 24; h++) {
    const time = new Date(today);
    time.setHours(h);

    hours.push({
      hour: h,
      time: time.toTimeString().substring(0, 5),
      isPeak: isPeakHour(time.getTime()),
      period: isPeakHour(time.getTime()) ? 'PEAK' : 'OFF-PEAK'
    });
  }

  const peakHours = hours.filter(h => h.isPeak);

  res.json({
    date: today.toISOString().split('T')[0],
    peakHourDefinition: '14:00 - 22:00 (2 PM - 10 PM)',
    peakHourCount: peakHours.length,
    offPeakHourCount: 24 - peakHours.length,
    hourBreakdown: hours
  });
});

/**
 * ========================================
 * DATABASE MIGRATION
 * ========================================
 */

// Run database migration remotely
router.post('/db/migrate', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const confirm = req.query.confirm === 'yes';

    if (!confirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Please add ?confirm=yes to run migration',
        warning: 'This will create/modify database tables'
      });
    }

    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    await query(schema);

    res.json({
      status: 'success',
      message: 'Migration completed successfully',
      tables: ['meters', 'energy_readings', 'thirty_min_blocks'],
      note: 'Database schema created/updated'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * ========================================
 * DATA CLEANUP & MANAGEMENT
 * ========================================
 */

// Clear all test data
router.delete('/data/clear-test-data', async (req, res) => {
  try {
    const confirm = req.query.confirm === 'yes';

    if (!confirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Please add ?confirm=yes to clear test data',
        warning: 'This will delete all data from test/simulator meters!'
      });
    }

    // Delete readings and blocks for simulator meters
    const result = await query(`
      WITH simulator_meters AS (
        SELECT id FROM meters WHERE is_simulator = true
      )
      DELETE FROM energy_readings WHERE meter_id IN (SELECT id FROM simulator_meters);

      WITH simulator_meters AS (
        SELECT id FROM meters WHERE is_simulator = true
      )
      DELETE FROM thirty_min_blocks WHERE meter_id IN (SELECT id FROM simulator_meters);
    `);

    res.json({
      status: 'success',
      message: 'Test data cleared successfully',
      note: 'Meters retained, only readings and blocks deleted'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Clear ALL data (use with extreme caution!)
router.delete('/data/clear-all', async (req, res) => {
  try {
    const confirm = req.query.confirm === 'DESTROY_ALL';

    if (!confirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Please add ?confirm=DESTROY_ALL to clear ALL data',
        warning: '⚠️ THIS WILL DELETE EVERYTHING! USE WITH CAUTION!'
      });
    }

    await query('TRUNCATE TABLE energy_readings CASCADE');
    await query('TRUNCATE TABLE thirty_min_blocks CASCADE');
    await query('TRUNCATE TABLE meters CASCADE');

    res.json({
      status: 'success',
      message: '⚠️ All data cleared from all tables',
      warning: 'Database is now empty'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * ========================================
 * COMPREHENSIVE SYSTEM TEST
 * ========================================
 */

// Run complete system test
router.post('/system/full-test', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  try {
    // Test 1: Database connection
    try {
      await query('SELECT 1');
      results.tests.database = { status: 'pass', message: 'Database connected' };
    } catch (error) {
      results.tests.database = { status: 'fail', error: error.message };
    }

    // Test 2: Create meter
    let testMeter;
    try {
      testMeter = await getOrCreateMeter(`SYSTEM-TEST-${Date.now()}`, true);
      results.tests.createMeter = { status: 'pass', meter: testMeter };
    } catch (error) {
      results.tests.createMeter = { status: 'fail', error: error.message };
      return res.status(500).json(results);
    }

    // Test 3: Insert readings
    try {
      const readings = [];
      const blockStart = getCurrentBlockStart();

      for (let i = 0; i < 5; i++) {
        const reading = await insertReading(
          testMeter.id,
          blockStart.getTime() + (i * 60 * 1000),
          50 + Math.random() * 10,
          60.0
        );
        readings.push(reading);
      }

      results.tests.insertReadings = {
        status: 'pass',
        count: readings.length
      };
    } catch (error) {
      results.tests.insertReadings = { status: 'fail', error: error.message };
    }

    // Test 4: Calculate block
    try {
      const block = await calculateCurrentBlock(testMeter.id);
      results.tests.calculateBlock = {
        status: block ? 'pass' : 'warn',
        block: block || 'No block calculated'
      };
    } catch (error) {
      results.tests.calculateBlock = { status: 'fail', error: error.message };
    }

    // Test 5: Time calculations
    try {
      const blockStart = getCurrentBlockStart();
      const blockEnd = getBlockEnd(blockStart);
      const isPeak = isPeakHour(Date.now());

      results.tests.timeCalculations = {
        status: 'pass',
        blockStart: blockStart.toISOString(),
        blockEnd: blockEnd.toISOString(),
        isPeakHour: isPeak
      };
    } catch (error) {
      results.tests.timeCalculations = { status: 'fail', error: error.message };
    }

    // Overall status
    const allTests = Object.values(results.tests);
    const passedTests = allTests.filter(t => t.status === 'pass').length;
    const failedTests = allTests.filter(t => t.status === 'fail').length;

    results.summary = {
      total: allTests.length,
      passed: passedTests,
      failed: failedTests,
      overallStatus: failedTests === 0 ? 'ALL_PASS' : 'SOME_FAILED'
    };

    res.json(results);

  } catch (error) {
    results.error = error.message;
    res.status(500).json(results);
  }
});

module.exports = router;
