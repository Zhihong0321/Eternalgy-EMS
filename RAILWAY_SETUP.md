# Railway Setup Guide

## Project Information
- **Project Name**: Eternalgy-EMS
- **Project URL**: https://railway.com/project/b7689a85-7397-47fc-a821-0d15e09de530
- **Environment**: production

---

## Services Overview

### 1. PostgreSQL Database ✅
**Status**: Provisioned
**Purpose**: Store energy readings and 30-min block aggregations

**Tables to Create**:
- `meters` - Device registry
- `energy_readings` - Raw 1-minute power readings
- `thirty_min_blocks` - Aggregated 30-min kWh values

**Environment Variables** (Auto-provided by Railway):
- `DATABASE_URL` - Full connection string
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

---

### 2. MQTT Broker (Mosquitto) 🚧
**Status**: Ready to deploy
**Purpose**: Message broker for meter MQTT data

**Configuration**:
- Listener Port: `1883` (MQTT)
- WebSocket Port: `9001` (optional)
- Authentication: Disabled for MVP (⚠️ enable in production)

**Files**:
- `/mqtt-broker/Dockerfile` - Mosquitto container
- `/mqtt-broker/mosquitto.conf` - Broker configuration

**Deployment**:
```bash
cd mqtt-broker
railway up
```

**Environment Variables Needed**:
- `PORT` - Railway will inject this (use 1883)

---

### 3. Backend Service 🚧
**Status**: Not yet created
**Purpose**: MQTT subscriber, API server, WebSocket server, block aggregator

**Stack**:
- Node.js 18+
- Express
- MQTT.js
- WebSocket (ws)
- pg (PostgreSQL client)

**Ports**:
- HTTP API: Railway-assigned port
- WebSocket: Same port as HTTP

**Environment Variables Needed**:
```
DATABASE_URL=${DATABASE_URL from Postgres service}
MQTT_BROKER_URL=mqtt://<MQTT service internal URL>:1883
NODE_ENV=production
PORT=${PORT from Railway}
```

---

### 4. Frontend Service 🚧
**Status**: Not yet created
**Purpose**: React dashboard for real-time monitoring

**Stack**:
- React 18 + TypeScript
- Vite
- DevReady Kit
- Recharts
- Tailwind CSS

**Build Command**: `npm run build`
**Start Command**: Serve `dist/` folder

**Environment Variables Needed**:
```
VITE_API_URL=https://<backend-service-url>
VITE_WS_URL=wss://<backend-service-url>
```

---

## Deployment Order

1. ✅ **PostgreSQL** - Already provisioned
2. **MQTT Broker** - Deploy next (needed for backend testing)
3. **Backend** - Deploy after MQTT is ready
4. **Frontend** - Deploy last (depends on backend API)

---

## Railway CLI Commands

### Check Project Status
```bash
railway status
```

### Link to Project
```bash
railway link
# Select: Eternalgy-EMS
```

### Deploy a Service
```bash
# From service directory (e.g., backend/)
railway up
```

### View Logs
```bash
railway logs
```

### Set Environment Variable
```bash
railway variables set KEY=value
```

### Get Database URL
```bash
railway variables get DATABASE_URL
```

---

## Next Steps

1. **Deploy MQTT Broker**:
   ```bash
   cd mqtt-broker
   railway up
   ```

2. **Create Backend Service** (scaffold Node.js project)

3. **Create Database Schema** (connect to PostgreSQL and run migrations)

4. **Create Frontend Service** (scaffold React + Vite project)

5. **Test End-to-End**: Simulator → MQTT → Backend → Database → Frontend

---

## Internal Networking

Railway provides **private networking** between services:
- Services can communicate using internal URLs
- Format: `<service-name>.railway.internal:<port>`
- Example: `mqtt-broker.railway.internal:1883`

**Important**: Use private URLs for service-to-service communication (free and faster)

---

## Database Connection

Railway auto-injects PostgreSQL connection details. Use in backend:

```javascript
// backend/src/db/connection.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Railway
  }
});

module.exports = pool;
```

---

## Monitoring

- **Railway Dashboard**: https://railway.com/project/b7689a85-7397-47fc-a821-0d15e09de530
- **Logs**: `railway logs`
- **Metrics**: Available in Railway dashboard

---

## Cost Considerations (Free Tier)

Railway Free Tier includes:
- $5 credit/month
- 512MB RAM per service
- 1GB disk per service

**Estimated Monthly Cost for MVP**:
- PostgreSQL: ~$1-2
- MQTT Broker: ~$1
- Backend: ~$1-2
- Frontend: ~$0.50
- **Total**: ~$3.50-5.50/month (within free tier)

---

## Production Checklist (Post-MVP)

- [ ] Enable MQTT authentication
- [ ] Set up SSL/TLS for MQTT
- [ ] Configure PostgreSQL backups
- [ ] Set up custom domain
- [ ] Enable rate limiting
- [ ] Add monitoring/alerting
- [ ] Implement user authentication

---

**Last Updated**: 2025-10-23
**Status**: PostgreSQL ready, MQTT broker configured, Backend/Frontend pending
