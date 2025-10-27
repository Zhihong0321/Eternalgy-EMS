/**
 * Dashboard Test Script
 * Tests complete simulator → backend → dashboard flow
 */

import WebSocket from 'ws';

const WS_URL = 'wss://eternalgy-ems-production.up.railway.app';

console.log('🧪 Testing complete dashboard flow...');

// Create dashboard connection
const dashboard = new WebSocket(WS_URL);

dashboard.on('open', () => {
  console.log('✅ Dashboard connected!');

  // Register as dashboard
  dashboard.send(JSON.stringify({
    type: 'dashboard:register'
  }));
});

dashboard.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📊 Dashboard received:', {
    type: message.type,
    timestamp: new Date(message.timestamp).toLocaleTimeString(),
    device: message.meter?.device_id,
    currentBlock: message.currentBlock ? {
      total_kwh: message.currentBlock.total_kwh,
      reading_count: message.currentBlock.reading_count,
      is_peak_hour: message.blockInfo?.isPeakHour
    } : null,
    reading: message.reading ? {
      power: message.reading.total_power_kw,
      time: new Date(parseInt(message.reading.timestamp)).toLocaleTimeString()
    } : null
  });
});

// Create simulator connection after 1 second
setTimeout(() => {
  console.log('\n📱 Creating simulator...');
  const simulator = new WebSocket(WS_URL);

  simulator.on('open', () => {
    console.log('✅ Simulator connected!');

    // Register as simulator
    simulator.send(JSON.stringify({
      type: 'simulator:register',
      deviceId: 'DASHBOARD-TEST-METER'
    }));

    // Send multiple readings
    let readingCount = 0;
    const interval = setInterval(() => {
      const power = 75 + Math.random() * 50; // 75-125 kW
      simulator.send(JSON.stringify({
        type: 'simulator:reading',
        deviceId: 'DASHBOARD-TEST-METER',
        totalPowerKw: parseFloat(power.toFixed(2)),
        timestamp: Date.now(),
        frequency: 60.0
      }));

      readingCount++;
      if (readingCount >= 5) {
        clearInterval(interval);
        setTimeout(() => {
          console.log('\n✅ Test complete! Dashboard should have received 5 readings.');
          simulator.close();
          dashboard.close();
          process.exit(0);
        }, 1000);
      }
    }, 1500);
  });

  simulator.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📱 Simulator acknowledged:', message.type);
  });

}, 1000);

// Error handling
dashboard.on('error', (error) => {
  console.error('❌ Dashboard error:', error.message);
});

setTimeout(() => {
  console.log('\n❌ Test timeout');
  process.exit(1);
}, 15000);