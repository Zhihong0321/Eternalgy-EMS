/**
 * WebSocket Test Script
 * Tests connection to live Railway backend
 */

import WebSocket from 'ws';

const WS_URL = 'wss://eternalgy-ems-production.up.railway.app';

console.log('🧪 Testing WebSocket connection to:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');

  // Test 1: Register as simulator
  console.log('\n📱 Test 1: Registering as simulator...');
  ws.send(JSON.stringify({
    type: 'simulator:register',
    deviceId: 'TEST-SIMULATOR-001'
  }));

  // Test 2: Send a reading after 2 seconds
  setTimeout(() => {
    console.log('\n📊 Test 2: Sending meter reading...');
    ws.send(JSON.stringify({
      type: 'simulator:reading',
      deviceId: 'TEST-SIMULATOR-001',
      totalPowerKw: 75.5,
      timestamp: Date.now(),
      frequency: 60.0
    }));
  }, 2000);

  // Close after 5 seconds
  setTimeout(() => {
    console.log('\n👋 Closing connection...');
    ws.close();
    process.exit(0);
  }, 5000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📩 Received:', JSON.stringify(message, null, 2));
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 WebSocket disconnected');
});
