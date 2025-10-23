# EMS Platform - Project Guardrails & Development Guidelines

**Last Updated:** 2025-10-23
**Project:** Energy Management System (EMS) - Peak Shaving Service
**Status:** MVP Development Phase

---

## 🎯 PROJECT GOAL

Build an **Energy Management System (EMS)** for **peak shaving** to help clients reduce electricity costs by maintaining targeted peak usage levels during 30-minute billing blocks.

### Primary Objective
Help users maintain targeted PEAK usage levels per 30-minute block to reduce Peak Usage Charges in utility bills.

### Key Success Criteria
- **Real-time precision**: Meter data → Chart display with <1 minute latency
- **Accurate 30-min block calculations**: kW readings aggregated correctly to kWh
- **Peak hour awareness**: System distinguishes 2:00 PM - 10:00 PM (PEAK) vs OFF-PEAK

---

## 📊 BUSINESS CONTEXT

### What is Peak Shaving?
- Electricity bills charge based on **peak usage during 30-minute blocks**
- **PEAK HOURS**: 2:00 PM - 10:00 PM (billed at higher rate)
- **OFF-PEAK HOURS**: 12:00 AM - 2:00 PM, 10:00 PM - 12:00 AM (lower rate)
- Users need **real-time visibility** to react and reduce load before hitting peak thresholds

### 30-Minute Block Structure
```
Block starts at: 00:00, 00:30, 01:00, 01:30, ..., 23:00, 23:30
Example: 2:00 PM - 2:30 PM block
- If usage hits 200 kWh in this block → high charge
- User monitors in real-time (e.g., at 2:15 PM, sees 120 kWh accumulated)
- User reduces load to stay under target
```

---

## 🏗️ SYSTEM ARCHITECTURE

### Technology Stack

#### Backend
- **Runtime**: Node.js (v18+)
- **Framework**: Express
- **Database**: PostgreSQL (Railway managed)
- **MQTT Broker**: Mosquitto (Docker on Railway)
- **Real-time**: WebSocket (ws library)

#### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: **DevReady Kit** (https://docs.devreadykit.com/)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Mobile**: Responsive, mobile-first design

#### Hosting
- **Platform**: Railway (all services)
- **Deployment**: Docker containers

### Data Flow
```
Energy Meter (500 clients)
    ↓ (MQTT, 1-minute interval)
MQTT Broker (Mosquitto)
    ↓
Backend MQTT Subscriber
    ↓
PostgreSQL (raw + aggregated data)
    ↓
WebSocket Server
    ↓
React Frontend (real-time chart)
```

---

## 📡 ENERGY METER SPECIFICATION

### Device
- **Model**: ADW3xx Series
- **Protocol**: MQTT (JSON format)
- **Interval**: 1 minute

### MQTT Topic Structure
```
platform/<vendor_id>/meter/json-v2/analog/<group>
Example: platform/acrel/meter/json-v2/analog/0000
```

### Data Format
```json
{
  "data": [{
    "tp": 1631839905057,  // timestamp in milliseconds
    "point": [
      {"id": 0, "val": "20201998111433"},  // Device ID
      {"id": 13, "val": 45.5},             // Total Active Power (kW) ← KEY FIELD
      {"id": 28, "val": 123.4}             // Forward Active Energy (kWh)
    ]
  }]
}
```

### Critical Data Points
| ID | Field | Unit | Usage |
|----|-------|------|-------|
| 0 | Device ID | String | Unique meter identifier |
| 13 | **Total Active Power** | kW | **PRIMARY - Used for 30-min calculations** |
| 28 | Forward Active Energy | kWh | Cumulative energy (reference only) |
| 26 | Frequency | Hz | Optional monitoring |

---

## 🧮 CALCULATION LOGIC

### 30-Minute Block kWh Calculation

**Formula (CONFIRMED):**
```
Total kWh = Σ(Power readings in kW) × (1/60)

Example for 2:00 PM - 2:30 PM block:
- Reading 1 (2:00): 50 kW
- Reading 2 (2:01): 52 kW
- Reading 3 (2:02): 48 kW
- ...
- Reading 30 (2:29): 51 kW

Total kWh = (50 + 52 + 48 + ... + 51) × (1/60)
          = 1500 × 0.01667 = 25 kWh
```

**Implementation Notes:**
- Collect all kW readings (ID 13) within the 30-minute window
- Sum all readings
- Multiply by (1/60) to convert to kWh
- Store result as aggregated block value

### Peak Hour Detection
```javascript
function isPeakHour(timestamp) {
  const hour = new Date(timestamp).getHours();
  return hour >= 14 && hour < 22; // 2:00 PM (14:00) to 10:00 PM (22:00)
}
```

---

## 🎨 FRONTEND DESIGN REQUIREMENTS

### UI Library - DevReady Kit (MANDATORY)

**Documentation**: https://docs.devreadykit.com/

#### Must Use These Components
- **Progress Bar**: Show % toward peak target in current block
- **Badge**: Display "PEAK HOUR" / "OFF-PEAK HOUR" status
- **Chip**: Time remaining in block, current status
- **Buttons**: Standard actions (refresh, future settings)

#### Chart Library
- **Recharts** for 30-minute block visualization
- Integration with Tailwind CSS for consistent theming

### Design Principles
1. **Mobile-first**: Must work on phones/tablets
2. **Real-time updates**: UI refreshes every minute via WebSocket
3. **Visual clarity**: Large, easy-to-read numbers and charts
4. **Status at a glance**: Color-coded indicators (green/yellow/red)

### Main Dashboard Layout (MVP)
```
┌─────────────────────────────────────────────┐
│  [Badge: PEAK HOUR]    [Chip: 12 min left] │
├─────────────────────────────────────────────┤
│  Current Block: 2:00 PM - 2:30 PM           │
│  Current Usage: 145.2 kWh                   │
│  Target: 200 kWh                            │
│                                             │
│  [Progress Bar: 72%]                        │
│                                             │
│  ┌───────────────────────────────────┐     │
│  │  Chart: 1-min readings (30 bars) │     │
│  │  X-axis: Time (2:00-2:29)        │     │
│  │  Y-axis: Power (kW)              │     │
│  └───────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

---

## 🛠️ DATABASE SCHEMA

### Tables

#### `meters`
```sql
CREATE TABLE meters (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  client_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `energy_readings`
```sql
CREATE TABLE energy_readings (
  id SERIAL PRIMARY KEY,
  meter_id INTEGER REFERENCES meters(id),
  timestamp BIGINT NOT NULL,  -- milliseconds
  total_power_kw DECIMAL(10,2) NOT NULL,
  frequency DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_meter_timestamp (meter_id, timestamp)
);
```

#### `thirty_min_blocks`
```sql
CREATE TABLE thirty_min_blocks (
  id SERIAL PRIMARY KEY,
  meter_id INTEGER REFERENCES meters(id),
  block_start TIMESTAMP NOT NULL,
  block_end TIMESTAMP NOT NULL,
  total_kwh DECIMAL(10,4) NOT NULL,
  avg_power_kw DECIMAL(10,2),
  reading_count INTEGER,
  is_peak_hour BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_meter_block (meter_id, block_start)
);
```

---

## 🧪 METER SIMULATOR

### Purpose
Simulate real energy meter MQTT messages for development/testing (no physical meters available yet).

### Configuration
```json
{
  "deviceId": "EMS-SIMULATOR-001",
  "mqttBroker": "mqtt://localhost:1883",
  "topic": "platform/acrel/meter/json-v2/analog/0000",
  "interval": 60000,  // 1 minute
  "power": {
    "min": 30,        // kW
    "max": 150,       // kW
    "volatility": 0.2 // 20% random fluctuation
  }
}
```

### Behavior
- Publishes MQTT message every 60 seconds
- Generates realistic fluctuating power readings between min/max
- Follows ADW3xx JSON format exactly
- Configurable volatility for testing edge cases

---

## ✅ MVP SCOPE - DO NOW

### Phase 1: Infrastructure
- [x] Project structure
- [ ] PostgreSQL database setup
- [ ] Mosquitto MQTT broker (Railway)
- [ ] Meter simulator

### Phase 2: Backend
- [ ] MQTT subscriber
- [ ] 30-min block aggregation logic
- [ ] REST API (GET current block, GET history)
- [ ] WebSocket server (real-time updates)

### Phase 3: Frontend
- [ ] React + TypeScript + Vite setup
- [ ] DevReady Kit integration
- [ ] Real-time chart component
- [ ] Current block dashboard
- [ ] Peak hour indicator

### Phase 4: Integration
- [ ] End-to-end testing
- [ ] Railway deployment
- [ ] Performance testing (simulate 500 meters)

---

## ❌ MVP SCOPE - DON'T DO (YET)

### Not in MVP
- ❌ User authentication / login system
- ❌ Multi-client UI (admin panel)
- ❌ WhatsApp notification integration
- ❌ Threshold configuration UI
- ❌ Historical analytics (daily/monthly reports)
- ❌ Alert triggers / automated notifications
- ❌ Load forecasting / prediction
- ❌ Cost calculation / billing integration
- ❌ Manual load control features

### Future Phases
These will be added after MVP approval by management.

---

## 🚨 CRITICAL RULES

### Data Integrity
1. **NO MOCK DATA**: Never use fake/hardcoded data in production code
2. **VERIFY FIRST**: Always grep/read existing code before making assumptions
3. **ASK IF UNCLEAR**: Check with user if requirements are ambiguous

### Code Quality
1. **TypeScript strict mode**: All frontend code must be type-safe
2. **Error handling**: All MQTT/DB operations must have try-catch
3. **Logging**: Use structured logging for debugging
4. **Comments**: Document complex calculations (especially kWh formula)

### Performance
1. **Database indexing**: All time-based queries must use indexes
2. **Connection pooling**: PostgreSQL must use connection pool
3. **WebSocket efficiency**: Only send changed data, not full state

### UI/UX
1. **DevReady Kit ONLY**: No other UI component libraries
2. **Tailwind CSS**: All custom styles via Tailwind utilities
3. **Responsive**: Test on mobile viewport (375px minimum)

---

## 📝 DEVELOPMENT WORKFLOW

### Before Starting Work
1. Read this document completely
2. Check `PROJECT_STATUS.md` for current progress
3. Review recent commits/changes
4. Update todo list

### During Development
1. Follow existing code patterns
2. Test locally before committing
3. Update documentation if architecture changes
4. Keep todos updated

### Before Ending Session
1. Update `PROJECT_STATUS.md` with progress
2. Document any blockers/decisions needed
3. Commit all working code
4. Clear todo list or mark WIP items

---

## 📚 REFERENCE DOCUMENTS

- **Meter Spec**: `ADW3xx mqtt protocol 2022.2.16.pdf`
- **DevReady Kit**: https://docs.devreadykit.com/
- **Project Status**: `PROJECT_STATUS.md` (created each session)
- **This Document**: `PROJECT_GUARDRAILS.md` (source of truth)

---

## 🔄 VERSION HISTORY

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-23 | 1.0 | Initial guardrail document created |

---

## 📞 DECISION LOG

Track major technical decisions here:

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-23 | Use sum × (1/60) for kWh calculation | More accurate than simple averaging |
| 2025-10-23 | Deploy all services on Railway | Single platform, easier management |
| 2025-10-23 | DevReady Kit for UI | Lightweight, Tailwind-based, mobile-first |

---

**END OF GUARDRAILS**

*Future Claude sessions: Read this document FIRST before making any changes.*
