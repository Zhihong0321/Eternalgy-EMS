/**
 * Eternalgy EMS - Backend Server
 * WebSocket server for simulator and real-time dashboard
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const {
  getOrCreateMeter,
  insertReading,
  getCurrentBlock,
  getBlocksForToday,
  getAllMeters,
  getMeterById,
  getMeterByDeviceId,
  getRecentReadings,
  getReadingsByTimeRange,
  getLastNBlocks,
  getMetersWithStats,
  updateMeterName,
  updateMeterSettings
} = require('./db/queries');
const { calculateCurrentBlock, calculateBlockForTimestamp } = require('./services/blockAggregator');
const { pool } = require('./db/connection');

// Import debug API routes
const debugRouter = require('./api/debug');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const ALLOWED_WS_PATHS = new Set(['/', '/ws', '/socket', '/websocket']);
const WS_HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '25000', 10);

function isValidHeartbeatInterval(value) {
  return Number.isFinite(value) && value > 0;
}

if (!Number.isFinite(WS_HEARTBEAT_INTERVAL_MS) || WS_HEARTBEAT_INTERVAL_MS <= 0) {
  console.warn(
    `Invalid WS_HEARTBEAT_INTERVAL_MS value (${process.env.WS_HEARTBEAT_INTERVAL_MS}). Falling back to 25000ms.`
  );
}

const heartbeatIntervalMs = isValidHeartbeatInterval(WS_HEARTBEAT_INTERVAL_MS)
  ? WS_HEARTBEAT_INTERVAL_MS
  : 25000;

const HEARTBEAT_STATE_KEY = Symbol('wsHeartbeatState');

// Track alerts sent per meter per block to avoid duplicates
const sentBlockAlerts = new Set();

// WhatsApp alert sender
async function sendWhatsAppAlert(to, message) {
  try {
    const url = process.env.WHATSAPP_API_URL;
    if (!url) {
      console.warn('WHATSAPP_API_URL not configured. Skipping WhatsApp alert:', { to, message });
      return { skipped: true, reason: 'no_url' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.WHATSAPP_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.WHATSAPP_API_TOKEN}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, message })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('WhatsApp API responded with error:', res.status, text);
      return { ok: false, status: res.status, body: text };
    }

    const json = await res.json().catch(() => ({}));
    console.log('📣 WhatsApp alert sent to', to);
    return { ok: true, status: res.status, body: json };
  } catch (error) {
    console.error('Failed to send WhatsApp alert:', error);
    return { ok: false, error: error.message };
  }
}

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

function ensureHeartbeatState(ws) {
  if (!ws[HEARTBEAT_STATE_KEY]) {
    ws[HEARTBEAT_STATE_KEY] = { isAlive: true };
  }
  return ws[HEARTBEAT_STATE_KEY];
}

function markSocketAlive(ws) {
  const state = ensureHeartbeatState(ws);
  state.isAlive = true;
}

if (heartbeatIntervalMs > 0) {
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) {
        return;
      }

      const state = ensureHeartbeatState(client);

      if (!state.isAlive) {
        console.warn('Terminating stale WebSocket connection after missed heartbeat');
        try {
          client.terminate();
        } catch (error) {
          console.error('Failed to terminate stale WebSocket connection:', error);
        }
        return;
      }

      state.isAlive = false;

      try {
        client.ping();
      } catch (error) {
        console.error('Failed to send heartbeat ping:', error);
      }
    });
  }, heartbeatIntervalMs);

  wss.on('close', () => clearInterval(heartbeatTimer));
}

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
    deviceName: registration?.deviceId,
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
        deviceName: simData.deviceId,
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

  markSocketAlive(ws);
  ws.on('pong', () => markSocketAlive(ws));
  ws.on('ping', () => markSocketAlive(ws));

  ws.on('message', async (message) => {
    try {
      markSocketAlive(ws);
      const data = JSON.parse(message);

      switch (data.type) {
        case 'simulator:register':
          // Register as simulator
          ws.clientType = 'simulator';
          const deviceId = (data.deviceName && typeof data.deviceName === 'string' ? data.deviceName : data.deviceId) || 'EMS-SIMULATOR-001';
          const simulatorName = data.simulatorName || 'NONAME';
          const trimmedSimulatorName =
            typeof simulatorName === 'string' && simulatorName.trim().length > 0
              ? simulatorName.trim()
              : null;

          // Get or create meter for this simulator
          const meter = await getOrCreateMeter(deviceId, true, trimmedSimulatorName);

          // Apply optional settings from registration
          let targetPeakKwh;
          if (typeof data.targetPeakKwh === 'number') {
            targetPeakKwh = data.targetPeakKwh;
          } else if (typeof data.targetPeakKwh === 'string') {
            const parsed = parseFloat(data.targetPeakKwh);
            if (Number.isFinite(parsed)) targetPeakKwh = parsed;
          }
          const whatsappNumber = typeof data.whatsappNumber === 'string' ? (data.whatsappNumber.trim() || null) : undefined;

          if (typeof targetPeakKwh !== 'undefined' || typeof whatsappNumber !== 'undefined') {
            const updated = await updateMeterSettings(meter.id, {
              target_peak_kwh: typeof targetPeakKwh !== 'undefined' ? targetPeakKwh : undefined,
              whatsapp_number: whatsappNumber
            });
            if (updated) {
              Object.assign(meter, updated); // Reflect latest settings for this connection
            }
          }

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
            deviceName: deviceId,
            simulatorName: trimmedSimulatorName || simulatorName,
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
  const originId = (data.deviceName && typeof data.deviceName === 'string' ? data.deviceName : data.deviceId);
  const { totalPowerKw, timestamp, frequency, readingInterval } = data;
  const ackBase = {
    type: 'simulator:acknowledged',
    deviceId: originId,
    timestamp: Date.now(),
    reading: {
      totalPowerKw,
      timestamp
    }
  };

  try {
    const meter = await getOrCreateMeter(originId, true);

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

    console.log(`📈 Reading received: ${originId} - ${totalPowerKw} kW`);

    // Calculate block using the reading timestamp to avoid clock skew issues
    const {
      block: currentBlock,
      blockStart,
      blockEnd,
      isPeakHour: isPeak
    } = await calculateBlockForTimestamp(meter.id, timestamp);

    const blockStartIso = blockStart instanceof Date ? blockStart.toISOString() : new Date(blockStart).toISOString();
    const blockEndIso = blockEnd instanceof Date ? blockEnd.toISOString() : new Date(blockEnd).toISOString();

    // Broadcast to all dashboards
    const updateMessage = JSON.stringify({
      type: 'dashboard:update',
      meter,
      reading,
      currentBlock,
      blockInfo: {
        start: blockStartIso,
        end: blockEndIso,
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

    // WhatsApp alert: when current block exceeds target_peak_kwh
    const targetVal = meter?.target_peak_kwh != null ? parseFloat(meter.target_peak_kwh) : null;
    const whatsappTo = meter?.whatsapp_number ? String(meter.whatsapp_number).trim() : '';
    const currentKwh = currentBlock?.total_kwh != null ? parseFloat(currentBlock.total_kwh) : null;

    if (targetVal && targetVal > 0 && whatsappTo && currentKwh != null && currentKwh >= targetVal) {
      const alertKey = `${meter.id}:${blockStartIso}`;
      if (!sentBlockAlerts.has(alertKey)) {
        const msg = `Alert: ${meter.client_name || meter.device_id} reached ${currentKwh.toFixed(3)} kWh in current 30-min block (target ${targetVal} kWh). Block ${blockStartIso} - ${blockEndIso}.`;
        sendWhatsAppAlert(whatsappTo, msg).then(() => {
          sentBlockAlerts.add(alertKey);
        });
      }
    }
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
  const id = (data.deviceName && typeof data.deviceName === 'string' ? data.deviceName : data.deviceId);
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid simulator payload: "deviceId/deviceName" is required');
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

// Get meters with stored data statistics
app.get('/api/meters/summary', async (req, res) => {
  try {
    // Simple in-memory cache to mitigate repeated heavy queries and cold starts
    const now = Date.now();
    if (!app.locals.summaryCache) {
      app.locals.summaryCache = { data: null, expiresAt: 0, pending: null };
    }

    const cache = app.locals.summaryCache;

    // Serve cached data if still fresh (5s TTL)
    if (cache.data && cache.expiresAt > now) {
      return res.json(cache.data);
    }

    // If a fetch is already in-flight, await it to avoid thundering herd
    if (cache.pending) {
      const data = await cache.pending;
      return res.json(data);
    }

    // Fetch fresh data and populate cache
    cache.pending = getMetersWithStats()
      .then((meters) => {
        cache.data = meters;
        cache.expiresAt = Date.now() + 5000; // 5 seconds TTL
        cache.pending = null;
        return meters;
      })
      .catch((err) => {
        cache.pending = null;
        throw err;
      });

    const meters = await cache.pending;
    res.json(meters);
  } catch (error) {
    console.error('Failed to fetch meter summaries:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update meter display name
app.patch('/api/meters/:meterId', async (req, res) => {
  try {
    const meterId = Number(req.params.meterId);
    if (Number.isNaN(meterId)) {
      return res.status(400).json({ error: 'Invalid meter ID' });
    }

    const clientNameRaw = typeof req.body.clientName === 'string' ? req.body.clientName : null;
    const clientName = clientNameRaw && clientNameRaw.trim().length > 0 ? clientNameRaw.trim() : null;

    const updated = await updateMeterName(meterId, clientName);
    if (!updated) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Failed to update meter name:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recent readings for a meter
app.get('/api/meters/:meterId/readings', async (req, res) => {
  try {
    const meterId = Number(req.params.meterId);
    if (Number.isNaN(meterId)) {
      return res.status(400).json({ error: 'Invalid meter ID' });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const readingLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 50;

    const meter = await getMeterById(meterId);
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const readings = await getRecentReadings(meterId, readingLimit);
    res.json({ meter, readings });
  } catch (error) {
    console.error('Failed to fetch meter readings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Readings for a meter within a specific time range (historical chart)
app.get('/api/meters/:meterId/readings/range', async (req, res) => {
  try {
    const meterId = Number(req.params.meterId);
    if (Number.isNaN(meterId)) {
      return res.status(400).json({ error: 'Invalid meter ID' });
    }

    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Missing start or end query parameters' });
    }

    const startTime = new Date(String(start));
    const endTime = new Date(String(end));
    if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) {
      return res.status(400).json({ error: 'Invalid start time' });
    }
    if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) {
      return res.status(400).json({ error: 'Invalid end time' });
    }

    const meter = await getMeterById(meterId);
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const readings = await getReadingsByTimeRange(meterId, startTime.toISOString(), endTime.toISOString());
    res.json({ meter, readings });
  } catch (error) {
    console.error('Failed to fetch meter readings by range:', error);
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

// Dashboard snapshot endpoint - returns stored signals and summary data
app.get('/api/dashboard/snapshot', async (req, res) => {
  try {
    const { meterId: meterIdParam, deviceId, limit } = req.query;

    let targetMeter = null;

    if (meterIdParam) {
      const parsedId = Number(meterIdParam);
      if (!Number.isNaN(parsedId)) {
        targetMeter = await getMeterById(parsedId);
      }
    }

    if (!targetMeter && deviceId) {
      targetMeter = await getMeterByDeviceId(deviceId);
    }

    const meters = await getAllMeters();

    if (!targetMeter) {
      targetMeter = meters.find(m => m.is_simulator) || meters[0] || null;
    }

    if (!targetMeter) {
      return res.status(404).json({ error: 'No meters available' });
    }

    const readingLimit = limit ? Math.max(1, Math.min(500, Number(limit))) : 60;

    const snapshotTimestamp = Date.now();
    const { block: currentBlock, blockStart, blockEnd, isPeakHour } = await calculateBlockForTimestamp(
      targetMeter.id,
      snapshotTimestamp
    );

    const [blocksToday, lastTenBlocks, recentReadings] = await Promise.all([
      getBlocksForToday(targetMeter.id),
      getLastNBlocks(targetMeter.id, 10),
      getRecentReadings(targetMeter.id, readingLimit)
    ]);

    const blockInfo = {
      start: blockStart instanceof Date ? blockStart.toISOString() : new Date(blockStart).toISOString(),
      end: blockEnd instanceof Date ? blockEnd.toISOString() : new Date(blockEnd).toISOString(),
      isPeakHour
    };

    const dashboardStats = getDashboardStats();
    const simulatorsOnline = getConnectedSimulators();

    res.json({
      timestamp: snapshotTimestamp,
      meter: targetMeter,
      allMeters: meters,
      currentBlock,
      blockInfo,
      blocksToday,
      lastTenBlocks,
      readings: recentReadings,
      connectedSimulators: simulatorsOnline,
      dashboardStats
    });
  } catch (error) {
    console.error('Failed to build dashboard snapshot:', error);
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
async function startServer() {
  try {
    // Migrations are handled by one-time script: npm run db:migrate
    // Removing runtime migrations reduces cold-start time and avoids startup blocking.
  } catch (err) {
    console.error('Startup initialization error:', err);
  }
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
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
