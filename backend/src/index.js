/**
 * Eternalgy EMS - Backend Server
 * WebSocket server for simulator and real-time dashboard
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const { getOrCreateMeter, insertReading, getCurrentBlock, getBlocksForToday } = require('./db/queries');
const { calculateCurrentBlock, isPeakHour, getCurrentBlockStart, getBlockEnd } = require('./services/blockAggregator');

// Import debug API routes
const debugRouter = require('./api/debug');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '../public'))); // Serve static files for simulator/dashboard

// Mount debug API routes
// ⚠️ WARNING: These should be protected or disabled in production!
app.use('/api/debug', debugRouter);

// Store connected clients by type
const clients = {
  simulators: new Map(), // Map of ws -> {deviceId, simulatorName, meter}
  dashboards: new Set()
};

// Helper to get list of connected simulators
function getConnectedSimulators() {
  const simulators = [];
  clients.simulators.forEach((simData, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      simulators.push({
        deviceId: simData.deviceId,
        simulatorName: simData.simulatorName,
        meterId: simData.meter?.id
      });
    }
  });
  return simulators;
}

// Helper to broadcast to all dashboards
function broadcastToDashboards(message) {
  const messageStr = JSON.stringify(message);
  clients.dashboards.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

/**
 * WebSocket Connection Handler
 */
wss.on('connection', (ws, req) => {
  console.log('🔌 New WebSocket connection');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'simulator:register':
          // Register as simulator
          ws.clientType = 'simulator';
          const deviceId = data.deviceId || 'EMS-SIMULATOR-001';
          const simulatorName = data.simulatorName || 'NONAME';

          // Get or create meter for this simulator
          const meter = await getOrCreateMeter(deviceId, true);

          clients.simulators.set(ws, {
            deviceId,
            simulatorName,
            meter
          });

          console.log(`📱 Simulator registered: ${simulatorName} (${deviceId})`);

          ws.send(JSON.stringify({
            type: 'simulator:registered',
            deviceId,
            simulatorName,
            timestamp: Date.now()
          }));

          // Notify all dashboards about the new simulator
          broadcastToDashboards({
            type: 'dashboard:simulators-updated',
            simulators: getConnectedSimulators()
          });
          break;

        case 'dashboard:register':
          // Register as dashboard
          clients.dashboards.add(ws);
          ws.clientType = 'dashboard';
          console.log('📊 Dashboard registered');

          // Send initial data
          const { getAllMeters, getLastNBlocks } = require('./db/queries');
          const meters = await getAllMeters();
          const defaultMeter = meters.find(m => m.is_simulator) || meters[0];

          if (defaultMeter) {
            const currentBlock = await calculateCurrentBlock(defaultMeter.id);
            const blocksToday = await getBlocksForToday(defaultMeter.id);
            const lastTenBlocks = await getLastNBlocks(defaultMeter.id, 10);

            ws.send(JSON.stringify({
              type: 'dashboard:initial',
              meter: defaultMeter,
              currentBlock,
              blocksToday,
              lastTenBlocks,
              simulators: getConnectedSimulators(),
              allMeters: meters,
              timestamp: Date.now()
            }));
          }
          break;

        case 'simulator:reading':
          // Receive meter reading from simulator
          await handleMeterReading(data, ws);
          break;

        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    // Remove from client lists
    const wasSimulator = clients.simulators.has(ws);
    clients.simulators.delete(ws);
    clients.dashboards.delete(ws);
    console.log(`❌ Client disconnected (${ws.clientType || 'unknown'})`);

    // If a simulator disconnected, notify dashboards
    if (wasSimulator) {
      broadcastToDashboards({
        type: 'dashboard:simulators-updated',
        simulators: getConnectedSimulators()
      });
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

/**
 * Handle meter reading from simulator
 */
async function handleMeterReading(data, ws) {
  const { deviceId, totalPowerKw, timestamp, frequency, readingInterval } = data;

  // Get or create meter
  const meter = await getOrCreateMeter(deviceId, true);

  // Update meter's reading interval if provided
  if (readingInterval && meter.reading_interval !== readingInterval) {
    const { updateMeterReadingInterval } = require('./db/queries');
    await updateMeterReadingInterval(meter.id, readingInterval);
    console.log(`📝 Updated meter ${deviceId} interval to ${readingInterval}s`);
  }

  // Insert reading with interval
  const reading = await insertReading(
    meter.id,
    timestamp,
    totalPowerKw,
    frequency,
    readingInterval || 60
  );

  console.log(`📈 Reading received: ${deviceId} - ${totalPowerKw} kW`);

  // Calculate current block
  const currentBlock = await calculateCurrentBlock(meter.id);

  // Get block info
  const blockStart = getCurrentBlockStart(timestamp);
  const blockEnd = getBlockEnd(blockStart);
  const isPeak = isPeakHour(timestamp);

  // Broadcast to all dashboards
  const updateMessage = JSON.stringify({
    type: 'dashboard:update',
    meter,
    reading,
    currentBlock,
    blockInfo: {
      start: blockStart,
      end: blockEnd,
      isPeakHour: isPeak
    },
    timestamp: Date.now()
  });

  clients.dashboards.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(updateMessage);
    }
  });

  // Confirm to simulator
  ws.send(JSON.stringify({
    type: 'simulator:acknowledged',
    reading: {
      totalPowerKw,
      timestamp
    }
  }));
}

/**
 * REST API Endpoints
 */

// Health check
app.get('/api/health', (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const publicDir = path.join(__dirname, '../public');

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connectedSimulators: clients.simulators.size,
    connectedDashboards: clients.dashboards.size,
    publicDir: publicDir,
    publicDirExists: fs.existsSync(publicDir),
    publicFiles: fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : []
  });
});

// Get all meters
app.get('/api/meters', async (req, res) => {
  try {
    const meters = await require('./db/queries').getAllMeters();
    res.json(meters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current block for a meter
app.get('/api/meters/:deviceId/current-block', async (req, res) => {
  try {
    const meter = await getOrCreateMeter(req.params.deviceId);
    const currentBlock = await calculateCurrentBlock(meter.id);
    res.json(currentBlock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get today's blocks for a meter
app.get('/api/meters/:deviceId/blocks/today', async (req, res) => {
  try {
    const meter = await getOrCreateMeter(req.params.deviceId);
    const blocks = await getBlocksForToday(meter.id);
    res.json(blocks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all simulator data
app.delete('/api/simulators/data', async (req, res) => {
  try {
    const { deleteSimulatorData } = require('./db/queries');
    const result = await deleteSimulatorData();

    console.log(`🗑️  Deleted ${result.deleted} simulator meters and their data`);

    res.json({
      success: true,
      deleted: result.deleted,
      message: `Deleted ${result.deleted} simulator meters and all associated data`
    });
  } catch (error) {
    console.error('Error deleting simulator data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start Server
 */
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Eternalgy EMS Backend Server           ║
╠══════════════════════════════════════════╣
║   🚀 Server:    http://localhost:${PORT}   ║
║   🔌 WebSocket: ws://localhost:${PORT}     ║
║   📊 Dashboard: http://localhost:${PORT}/  ║
╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
