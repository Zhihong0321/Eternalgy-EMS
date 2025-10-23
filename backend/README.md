# Eternalgy EMS - Backend

WebSocket server and REST API for the Energy Management System.

## Features

- ✅ WebSocket server for real-time data streaming
- ✅ PostgreSQL database with connection pooling
- ✅ 30-minute block aggregation (kWh calculation)
- ✅ Peak hour detection (2:00 PM - 10:00 PM)
- ✅ REST API for data retrieval
- ✅ Railway-ready deployment

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL
```

### 3. Run Database Migration
```bash
npm run db:migrate
```

### 4. Start Development Server
```bash
npm run dev
```

Server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /api/health
```

### Get All Meters
```
GET /api/meters
```

### Get Current 30-Min Block
```
GET /api/meters/:deviceId/current-block
```

### Get Today's Blocks
```
GET /api/meters/:deviceId/blocks/today
```

## WebSocket Protocol

### Client → Server Messages

**Register as Simulator:**
```json
{
  "type": "simulator:register",
  "deviceId": "EMS-SIMULATOR-001"
}
```

**Send Meter Reading:**
```json
{
  "type": "simulator:reading",
  "deviceId": "EMS-SIMULATOR-001",
  "totalPowerKw": 50.5,
  "timestamp": 1698765432000,
  "frequency": 50.0
}
```

**Register as Dashboard:**
```json
{
  "type": "dashboard:register"
}
```

### Server → Client Messages

**Dashboard Update (Real-time):**
```json
{
  "type": "dashboard:update",
  "meter": { "id": 1, "device_id": "..." },
  "reading": { "total_power_kw": 50.5 },
  "currentBlock": {
    "total_kwh": 12.5,
    "reading_count": 15
  },
  "blockInfo": {
    "start": "2025-10-23T14:00:00Z",
    "end": "2025-10-23T14:30:00Z",
    "isPeakHour": true
  }
}
```

## Project Structure

```
backend/
├── src/
│   ├── db/
│   │   ├── connection.js      # PostgreSQL pool
│   │   ├── queries.js         # Data access layer
│   │   ├── schema.sql         # Database schema
│   │   └── migrate.js         # Migration script
│   ├── services/
│   │   └── blockAggregator.js # 30-min block calculator
│   └── index.js               # Main server
├── public/                    # Static files (simulator/dashboard)
├── Dockerfile                 # Railway deployment
├── package.json
└── .env.example
```

## Deployment

### Railway
```bash
railway up
```

Ensure these environment variables are set:
- `DATABASE_URL` (auto-provided by Railway Postgres)
- `PORT` (auto-provided by Railway)

## Development

### Run with Nodemon (auto-reload)
```bash
npm run dev
```

### Run Database Migration
```bash
npm run db:migrate
```

### Production Build
```bash
npm start
```

## License

MIT
