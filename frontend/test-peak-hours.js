/**
 * Peak Hour Detection Test
 * Tests 2PM-10PM peak hour detection
 */

function isPeakHour(timestamp) {
  const hour = new Date(timestamp).getHours();
  return hour >= 14 && hour < 22; // 2:00 PM (14:00) to 10:00 PM (22:00)
}

console.log('🧪 Testing Peak Hour Detection Logic');
console.log('=====================================');

// Test different times of day
const testTimes = [
  { hour: 13, time: '1:00 PM', expected: false, desc: 'Before peak' },
  { hour: 14, time: '2:00 PM', expected: true,  desc: 'Peak starts' },
  { hour: 15, time: '3:00 PM', expected: true,  desc: 'Peak mid' },
  { hour: 17, time: '5:00 PM', expected: true,  desc: 'Peak evening' },
  { hour: 21, time: '9:00 PM', expected: true,  desc: 'Peak ends' },
  { hour: 22, time: '10:00 PM', expected: false, desc: 'After peak' },
  { hour: 0,  time: '12:00 AM', expected: false, desc: 'Midnight' },
  { hour: 8,  time: '8:00 AM', expected: false, desc: 'Morning' }
];

testTimes.forEach(({ hour, time, expected, desc }) => {
  // Create timestamp for that hour today
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  const timestamp = date.getTime();

  const isPeak = isPeakHour(timestamp);
  const passed = isPeak === expected;
  const status = passed ? '✅' : '❌';

  console.log(`${status} ${time.padEnd(10)} → ${isPeak ? 'PEAK' : 'OFF-PEAK'.padEnd(9)} (${desc}) ${passed ? '' : ' - FAILED'}`);
});

console.log('\n📊 Peak Hours Summary:');
console.log('   Peak: 2:00 PM - 10:00 PM (14:00-22:00)');
console.log('   Off-Peak: All other times');

// Test with current time
const now = new Date();
const currentHour = now.getHours();
const currentPeak = isPeakHour(now.getTime());
console.log(`\n⏰ Current time: ${now.toLocaleTimeString()}`);
console.log(`   Status: ${currentPeak ? 'PEAK HOUR' : 'OFF-PEAK'}`);