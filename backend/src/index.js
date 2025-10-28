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
const wss = new WebSocket.Server({ noServer: true });

const ALLOWED_WS_PATHS = new Set(['/', '/ws', '/socket', '/websocket']);

server.on('upgrade', (request, socket, head) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const path = requestUrl.pathname.replace(/\/+/g, '/');

    if (!ALLOWED_WS_PATHS.has(path)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.upgradePath = path;
      wss.emit('connection', ws, request);
    });
  } catch (error) {
    console.error('Failed to process WebSocket upgrade request:', error);
    try {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch (_) {
      // ignore errors writing to socket
    }
    socket.destroy();
  }
});

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
  simulators: new Map(), // Map of ws -> {deviceId, simulatorName, meter, sequence}
  dashboards: new Set()
};

function getDashboardStats() {
  const dashboardsOnline = Array.from(clients.dashboards).filter(client => client.readyState === WebSocket.OPEN).length;
  return {
    dashboardsOnline,
    dashboardsReady: dashboardsOnline > 0
  };
}

function buildHandshakePayload(ws, { reason = 'manual', note } = {}) {
  const registration = clients.simulators.get(ws);
  const { dashboardsOnline, dashboardsReady } = getDashboardStats();

  let status = 'error';
  let message = 'Simulator is not registered yet. Please reconnect or refresh the page.';

  if (registration) {
    if (dashboardsReady) {
      status = 'ok';
      message = `Dashboard ready. ${dashboardsOnline} dashboard${dashboardsOnline === 1 ? '' : 's'} connected.`;
    } else {
      status = 'warning';
      message = 'No dashboards are connected. Data will queue once a dashboard joins.';
    }
  }

  if (note) {
    message = note;
  }

  return {
    type: 'simulator:handshake-ack',
    status,
    dashboardsOnline,
    dashboardsReady,
    message,
    reason,
    deviceId: registration?.deviceId,
    simulatorName: registration?.simulatorName,
    timestamp: Date.now()
  };
}

function sendHandshake(ws, options = {}) {
  if (ws.readyState !== WebSocket.OPEN) {
    return null;
  }

  const payload = buildHandshakePayload(ws, options);

  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to send handshake payload:', error);
    return null;
  }

  return payload;
}

function broadcastHandshakeToSimulators(reason) {
  clients.simulators.forEach((_, simulatorWs) => {
    if (simulatorWs.readyState === WebSocket.OPEN) {
      sendHandshake(simulatorWs, { reason });
    }
  });
}

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
  const upgradePath = ws.upgradePath || req?.url || '/';
  console.log(`🔌 New WebSocket connection (${upgradePath})`);

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
            meter,
            sequence: 0
          });

          console.log(`📱 Simulator registered: ${simulatorName} (${deviceId})`);

          ws.send(JSON.stringify({
            type: 'simulator:registered',
            deviceId,
            simulatorName,
            timestamp: Date.now()
          }));

          sendHandshake(ws, { reason: 'register' });

          // Notify all dashboards about the new simulator
          broadcastToDashboards({
            type: 'dashboard:simulators-updated',
            simulators: getConnectedSimulators()
          });
          if (clients.dashboards.size > 0) {
            broadcastHandshakeToSimulators('simulator-registered');
          }
          break;

        case 'simulator:handshake': {
          const payload = sendHandshake(ws, { reason: data.source === 'auto' ? 'auto' : 'manual' });
          const registration = clients.simulators.get(ws);
          console.log(`🤝 Handshake request from ${registration?.simulatorName || 'unknown simulator'} -> dashboards online: ${payload?.dashboardsOnline ?? 0}`);
          break;
        }

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

          broadcastHandshakeToSimulators('dashboard-joined');
          break;

        case 'simulator:reading':
          // Receive meter reading from simulator
          validateSimulatorReading(data);
          await handleMeterReading(data, ws);
          break;

        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      if (!error.silent && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    }
  });

  ws.on('close', () => {
    // Remove from client lists
    const wasSimulator = clients.simulators.has(ws);
    const wasDashboard = clients.dashboards.has(ws);
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

    if (wasDashboard) {
      broadcastHandshakeToSimulators('dashboard-left');
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
  const ackBase = {
    type: 'simulator:acknowledged',
    deviceId,
    timestamp: Date.now(),
    reading: {
      totalPowerKw,
      timestamp
    }
  };

  try {
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

    const registration = clients.simulators.get(ws);
    if (registration) {
      registration.sequence = (registration.sequence || 0) + 1;
    }

    ws.send(JSON.stringify({
      ...ackBase,
      status: 'accepted',
      dashboardsOnline: getDashboardStats().dashboardsOnline,
      sequence: registration?.sequence || null
    }));
  } catch (error) {
    console.error('Error handling simulator reading:', error);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...ackBase,
        status: 'error',
        message: error.message
      }));
    }

    error.silent = true;
    throw error;
  }
}

function validateSimulatorReading(data) {
  if (!data.deviceId || typeof data.deviceId !== 'string') {
    throw new Error('Invalid simulator payload: "deviceId" is required');
  }

  if (typeof data.totalPowerKw !== 'number' || Number.isNaN(data.totalPowerKw)) {
    throw new Error('Invalid simulator payload: "totalPowerKw" must be a number');
  }

  if (typeof data.timestamp !== 'number' || Number.isNaN(data.timestamp)) {
    throw new Error('Invalid simulator payload: "timestamp" must be a number');
  }

  if (data.frequency !== undefined && (typeof data.frequency !== 'number' || Number.isNaN(data.frequency))) {
    throw new Error('Invalid simulator payload: "frequency" must be a number when provided');
  }

  if (data.readingInterval !== undefined && (typeof data.readingInterval !== 'number' || Number.isNaN(data.readingInterval))) {
    throw new Error('Invalid simulator payload: "readingInterval" must be a number when provided');
  }
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
