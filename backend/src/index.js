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
app.use(express.static('public')); // Serve static files for simulator/dashboard

// Mount debug API routes
// ⚠️ WARNING: These should be protected or disabled in production!
app.use('/api/debug', debugRouter);

// Store connected clients by type
const clients = {
  simulators: new Set(),
  dashboards: new Set()
};

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
          clients.simulators.add(ws);
          ws.clientType = 'simulator';
          ws.deviceId = data.deviceId || 'EMS-SIMULATOR-001';
          console.log(`📱 Simulator registered: ${ws.deviceId}`);

          ws.send(JSON.stringify({
            type: 'simulator:registered',
            deviceId: ws.deviceId,
            timestamp: Date.now()
          }));
          break;

        case 'dashboard:register':
          // Register as dashboard
          clients.dashboards.add(ws);
          ws.clientType = 'dashboard';
          console.log('📊 Dashboard registered');

          // Send initial data
          const meters = await require('./db/queries').getAllMeters();
          const defaultMeter = meters.find(m => m.is_simulator) || meters[0];

          if (defaultMeter) {
            const currentBlock = await calculateCurrentBlock(defaultMeter.id);
            const blocksToday = await getBlocksForToday(defaultMeter.id);

            ws.send(JSON.stringify({
              type: 'dashboard:initial',
              meter: defaultMeter,
              currentBlock,
              blocksToday,
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
    clients.simulators.delete(ws);
    clients.dashboards.delete(ws);
    console.log(`❌ Client disconnected (${ws.clientType || 'unknown'})`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

/**
 * Handle meter reading from simulator
 */
async function handleMeterReading(data, ws) {
  const { deviceId, totalPowerKw, timestamp, frequency } = data;

  // Get or create meter
  const meter = await getOrCreateMeter(deviceId, true);

  // Insert reading
  const reading = await insertReading(
    meter.id,
    timestamp,
    totalPowerKw,
    frequency
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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connectedSimulators: clients.simulators.size,
    connectedDashboards: clients.dashboards.size
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
