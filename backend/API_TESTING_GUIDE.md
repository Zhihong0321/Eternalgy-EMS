# EMS Backend - API Testing & Debugging Guide

**Created:** 2025-10-24
**Purpose:** Comprehensive internal debugging API for validating backend functionality

---

## 🎯 Overview

This guide provides all the API endpoints needed to test and debug the EMS backend without requiring a frontend or simulator. Perfect for:

- ✅ Validating backend deployment on Railway
- ✅ Testing database connectivity
- ✅ Inserting test data
- ✅ Verifying calculations (30-min blocks, peak hours)
- ✅ Debugging issues in future sessions

---

## 🚀 Base URLs

**Local Development:**
```
http://localhost:3000
```

**Production (Railway):**
```
https://eternalgy-ems-production.up.railway.app
```

**Debug API Base Path:**
```
/api/debug
```

---

## 📋 Quick Start Tests

### 1. Test if Backend is Running
```bash
curl https://eternalgy-ems-production.up.railway.app/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T...",
  "connectedSimulators": 0,
  "connectedDashboards": 0
}
```

---

### 2. Test Database Connection
```bash
curl https://eternalgy-ems-production.up.railway.app/api/debug/db/test-connection
```

**Expected Response:**
```json
{
  "status": "success",
  "connected": true,
  "serverTime": "2025-10-24...",
  "dbVersion": "PostgreSQL 15.x..."
}
```

---

### 3. Check if Tables Exist
```bash
curl https://eternalgy-ems-production.up.railway.app/api/debug/db/check-tables
```

**Expected Response:**
```json
{
  "status": "success",
  "tables": ["meters", "energy_readings", "thirty_min_blocks"],
  "expectedTables": ["meters", "energy_readings", "thirty_min_blocks"],
  "missingTables": [],
  "allTablesExist": true
}
```

---

### 4. Run Complete System Test
```bash
curl -X POST https://eternalgy-ems-production.up.railway.app/api/debug/system/full-test
```

This will:
- Test database connection
- Create a test meter
- Insert 5 test readings
- Calculate a 30-min block
- Test time calculations

---

## 📊 Database Testing Endpoints

### Get Database Pool Status
```bash
GET /api/debug/db/pool-status
```

### Get Table Row Counts
```bash
GET /api/debug/db/table-counts
```

**Response:**
```json
{
  "meters": 5,
  "energy_readings": 1432,
  "thirty_min_blocks": 48,
  "totalRecords": 1485
}
```

---

## 🔌 Meter Testing Endpoints

### List All Meters with Stats
```bash
GET /api/debug/meters/list
```

**Response:**
```json
{
  "count": 2,
  "meters": [
    {
      "id": 1,
      "device_id": "TEST-METER-001",
      "is_simulator": true,
      "created_at": "2025-10-24...",
      "stats": {
        "totalReadings": 120,
        "totalBlocks": 4,
        "latestReading": {
          "timestamp": 1729785600000,
          "total_power_kw": 75.5
        }
      }
    }
  ]
}
```

### Create Test Meter
```bash
POST /api/debug/meters/create-test
Content-Type: application/json

{
  "deviceId": "MY-TEST-METER",
  "isSimulator": true
}
```

---

## 📈 Reading Testing Endpoints

### Insert Single Test Reading
```bash
POST /api/debug/readings/insert-test
Content-Type: application/json

{
  "deviceId": "TEST-METER-001",
  "totalPowerKw": 85.5,
  "timestamp": 1729785600000,
  "frequency": 60.0
}
```

**Note:** If `timestamp` is omitted, current time is used.

---

### Insert Batch Test Readings (Populate Current Block)
```bash
POST /api/debug/readings/insert-batch
Content-Type: application/json

{
  "deviceId": "TEST-METER-001",
  "count": 20,
  "minPower": 40,
  "maxPower": 120
}
```

**Parameters:**
- `count`: Number of readings to insert (default: 10)
- `minPower`: Minimum kW value (default: 30)
- `maxPower`: Maximum kW value (default: 150)
- `startTime`: Optional - start timestamp (default: current block start)

**Response:**
```json
{
  "status": "success",
  "meter": { ... },
  "insertedCount": 20,
  "readings": [ ... ],
  "message": "Inserted 20 test readings for TEST-METER-001"
}
```

---

### Get Readings for Current Block
```bash
GET /api/debug/readings/current-block/TEST-METER-001
```

**Response:**
```json
{
  "status": "success",
  "meter": { ... },
  "blockStart": "2025-10-24T14:00:00.000Z",
  "blockEnd": "2025-10-24T14:30:00.000Z",
  "readingCount": 15,
  "readings": [ ... ]
}
```

---

## 🧮 Block Calculation Testing Endpoints

### Calculate Current Block
```bash
GET /api/debug/blocks/calculate-current/TEST-METER-001
```

**Response:**
```json
{
  "status": "success",
  "meter": { ... },
  "blockInfo": {
    "start": "2025-10-24T14:00:00.000Z",
    "end": "2025-10-24T14:30:00.000Z",
    "isPeakHour": true,
    "minutesElapsed": 12
  },
  "block": {
    "id": 15,
    "meter_id": 1,
    "block_start": "2025-10-24T14:00:00.000Z",
    "block_end": "2025-10-24T14:30:00.000Z",
    "total_kwh": "18.5000",
    "avg_power_kw": "74.00",
    "max_power_kw": "95.50",
    "min_power_kw": "52.30",
    "reading_count": 15,
    "is_peak_hour": true
  }
}
```

---

### Calculate All Blocks for Today
```bash
GET /api/debug/blocks/calculate-today/TEST-METER-001
```

This will:
1. Look at all readings for today
2. Calculate all 48 possible 30-min blocks
3. Save to database
4. Return results

---

### Get Today's Blocks (From Database)
```bash
GET /api/debug/blocks/today/TEST-METER-001
```

**Response:**
```json
{
  "status": "success",
  "meter": { ... },
  "date": "2025-10-24",
  "summary": {
    "totalBlocks": 12,
    "peakBlocks": 8,
    "offPeakBlocks": 4,
    "totalPeakKwh": "145.2500",
    "totalOffPeakKwh": "52.1200",
    "totalKwh": "197.3700"
  },
  "blocks": [ ... ]
}
```

---

## 🕐 Time & Utility Testing Endpoints

### Get Current Time Info
```bash
GET /api/debug/utils/time-info
```

**With Custom Timestamp:**
```bash
GET /api/debug/utils/time-info?timestamp=1729785600000
```

**Response:**
```json
{
  "currentTime": "2025-10-24T14:15:30.000Z",
  "timestamp": 1729785630000,
  "blockStart": "2025-10-24T14:00:00.000Z",
  "blockEnd": "2025-10-24T14:30:00.000Z",
  "isPeakHour": true,
  "blockProgress": {
    "minutesElapsed": 15,
    "minutesRemaining": 15,
    "percentComplete": "50.0"
  }
}
```

---

### Get Peak Hours for Today
```bash
GET /api/debug/utils/peak-hours-today
```

**Response:**
```json
{
  "date": "2025-10-24",
  "peakHourDefinition": "14:00 - 22:00 (2 PM - 10 PM)",
  "peakHourCount": 8,
  "offPeakHourCount": 16,
  "hourBreakdown": [
    { "hour": 0, "time": "00:00", "isPeak": false, "period": "OFF-PEAK" },
    { "hour": 1, "time": "01:00", "isPeak": false, "period": "OFF-PEAK" },
    ...
    { "hour": 14, "time": "14:00", "isPeak": true, "period": "PEAK" },
    ...
  ]
}
```

---

## 🧹 Data Management Endpoints

### Clear Test Data (Simulator Meters Only)
```bash
DELETE /api/debug/data/clear-test-data?confirm=yes
```

This will delete all readings and blocks for meters marked as `is_simulator = true`, but keeps the meters themselves.

---

### Clear ALL Data (⚠️ DANGEROUS!)
```bash
DELETE /api/debug/data/clear-all?confirm=DESTROY_ALL
```

**WARNING:** This deletes EVERYTHING from all tables. Use only when needed!

---

## 🧪 Complete Testing Workflow

### Scenario 1: Test Basic Functionality

```bash
# Step 1: Check health
curl https://your-url/api/health

# Step 2: Test database
curl https://your-url/api/debug/db/test-connection

# Step 3: Check tables
curl https://your-url/api/debug/db/check-tables

# Step 4: Run system test
curl -X POST https://your-url/api/debug/system/full-test
```

---

### Scenario 2: Test 30-Min Block Calculation

```bash
# Step 1: Create meter
curl -X POST https://your-url/api/debug/meters/create-test \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "CALC-TEST-001"}'

# Step 2: Insert batch readings (20 readings for current block)
curl -X POST https://your-url/api/debug/readings/insert-batch \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "CALC-TEST-001",
    "count": 20,
    "minPower": 50,
    "maxPower": 100
  }'

# Step 3: Calculate current block
curl https://your-url/api/debug/blocks/calculate-current/CALC-TEST-001

# Step 4: Verify calculation
# Expected: total_kwh ≈ (sum of all kW readings) × (1/60)
```

---

### Scenario 3: Test Peak Hour Detection

```bash
# Check current time info
curl https://your-url/api/debug/utils/time-info

# Get peak hour breakdown for today
curl https://your-url/api/debug/utils/peak-hours-today

# Expected: isPeakHour = true if current hour is 14-21 (2PM-10PM)
```

---

## 📱 Testing with JavaScript (Browser Console)

If you want to test from browser console on the health check page:

```javascript
// Base URL
const API = 'https://eternalgy-ems-production.up.railway.app';

// Test database
fetch(`${API}/api/debug/db/test-connection`)
  .then(r => r.json())
  .then(console.log);

// Insert batch readings
fetch(`${API}/api/debug/readings/insert-batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deviceId: 'BROWSER-TEST',
    count: 15,
    minPower: 60,
    maxPower: 90
  })
})
  .then(r => r.json())
  .then(console.log);

// Calculate current block
fetch(`${API}/api/debug/blocks/calculate-current/BROWSER-TEST`)
  .then(r => r.json())
  .then(console.log);

// Get today's summary
fetch(`${API}/api/debug/blocks/today/BROWSER-TEST`)
  .then(r => r.json())
  .then(console.log);
```

---

## 🔍 Debugging Tips

### Issue: "Tables don't exist"
```bash
# Check tables
curl https://your-url/api/debug/db/check-tables

# If missing, run migration (from backend directory)
npm run db:migrate
```

---

### Issue: "No readings in current block"
```bash
# Insert test readings first
curl -X POST https://your-url/api/debug/readings/insert-batch \
  -H "Content-Type: application/json" \
  -d '{"count": 10}'

# Then calculate
curl https://your-url/api/debug/blocks/calculate-current
```

---

### Issue: "Database connection failed"
```bash
# Check pool status
curl https://your-url/api/debug/db/pool-status

# Check connection
curl https://your-url/api/debug/db/test-connection
```

---

## 🎓 Understanding the Responses

### kWh Calculation Verification

When you get a block calculation response:

```json
{
  "total_kwh": "25.5000",
  "avg_power_kw": "51.00",
  "reading_count": 30
}
```

**Manual Verification:**
```
Formula: total_kwh = Σ(all kW readings) × (1/60)

If avg = 51 kW and count = 30:
Sum of readings ≈ 51 × 30 = 1530 kW
Total kWh = 1530 × (1/60) = 25.5 kWh ✅
```

---

### Peak Hour Verification

```json
{
  "blockStart": "2025-10-24T15:00:00.000Z",
  "isPeakHour": true
}
```

**Manual Check:**
- Extract hour from blockStart: 15 (3 PM)
- Is 14 ≤ 15 < 22? Yes ✅
- Therefore isPeakHour = true ✅

---

## ⚠️ Production Security Note

**Current Status:** Debug API is **OPEN** (no authentication)

**Before Production:**
1. Add authentication middleware
2. Restrict to admin users only
3. Or completely disable: Comment out in `src/index.js`:
   ```javascript
   // app.use('/api/debug', debugRouter); // DISABLED IN PRODUCTION
   ```

---

## 📞 Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Basic health check |
| `/api/debug/db/test-connection` | GET | Test database |
| `/api/debug/db/table-counts` | GET | Get record counts |
| `/api/debug/meters/list` | GET | List all meters |
| `/api/debug/readings/insert-batch` | POST | Insert test data |
| `/api/debug/blocks/calculate-current/:deviceId` | GET | Calculate current block |
| `/api/debug/blocks/today/:deviceId` | GET | Get today's blocks |
| `/api/debug/utils/time-info` | GET | Current time & block info |
| `/api/debug/system/full-test` | POST | Run all tests |

---

**Happy Testing! 🚀**

For issues or questions, check the logs:
```bash
railway logs
```
