# EMS Platform - Energy Management System

**Peak Shaving Service for Utility Bill Optimization**

---

## 🎯 Project Overview

An Energy Management System designed to help clients reduce electricity costs by monitoring and managing peak usage during 30-minute billing blocks.

### Key Features (MVP)
- Real-time energy usage monitoring (1-minute intervals)
- 30-minute block aggregation and visualization
- Peak hour detection (2:00 PM - 10:00 PM)
- Live dashboard with progress indicators
- Mobile-responsive interface

---

## 📚 Documentation

### **START HERE for New Claude Sessions**
1. **`PROJECT_GUARDRAILS.md`** - Complete development guidelines, rules, and architecture
2. **`PROJECT_STATUS.md`** - Current progress, blockers, and next steps
3. **`ADW3xx mqtt protocol 2022.2.16.pdf`** - Energy meter specification

### Quick Links
- **UI Framework**: [DevReady Kit Documentation](https://docs.devreadykit.com/)
- **Deployment**: Railway
- **Database**: PostgreSQL

---

## 🏗️ Architecture

```
Energy Meters (MQTT) → Mosquitto Broker → Node.js Backend → PostgreSQL
                                               ↓
                                          WebSocket
                                               ↓
                                       React Frontend
```

### Technology Stack
- **Backend**: Node.js + Express + MQTT.js
- **Database**: PostgreSQL
- **Frontend**: React + TypeScript + Vite
- **UI**: DevReady Kit + Tailwind CSS
- **Charts**: Recharts
- **MQTT Broker**: Mosquitto
- **Hosting**: Railway

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Railway CLI (for deployment)

### Development Setup
```bash
# Clone and navigate to project
cd EMS

# Install dependencies (will be created in future sessions)
npm install

# Start local development environment
docker-compose up -d  # MQTT broker + PostgreSQL

# Run backend
cd backend
npm run dev

# Run frontend (separate terminal)
cd frontend
npm run dev

# Run meter simulator (separate terminal)
cd simulator
npm run start
```

---

## 📊 30-Minute Block Calculation

Energy consumption is calculated using 1-minute power readings:

```
Total kWh = Σ(Power readings in kW) × (1/60)

Example:
- 30 readings at 50 kW each
- Total kWh = (50 × 30) × (1/60) = 25 kWh
```

**Peak Hours**: 2:00 PM - 10:00 PM (higher billing rate)
**Off-Peak**: All other times (lower billing rate)

---

## 🎨 UI Components

Using **DevReady Kit** for consistent, accessible design:
- Progress bars for usage targets
- Badges for peak/off-peak status
- Chips for time indicators
- Real-time charts with Recharts

---

## 📝 Development Guidelines

### Critical Rules
1. ✅ **Use DevReady Kit** for all UI components
2. ✅ **No mock data** - all data must be real or from simulator
3. ✅ **TypeScript strict mode** for type safety
4. ✅ **Mobile-first** responsive design
5. ❌ **No user authentication** in MVP
6. ❌ **No notifications** in MVP

### Code Quality
- All MQTT/DB operations must have error handling
- Use structured logging
- Document complex calculations
- Follow existing code patterns

---

## 🔄 Project Status

**Current Phase**: Initial Planning ✅

See `PROJECT_STATUS.md` for detailed progress tracking.

---

## 📞 Support

For questions about:
- **Architecture/Design**: Check `PROJECT_GUARDRAILS.md`
- **Current Progress**: Check `PROJECT_STATUS.md`
- **Meter Data Format**: Check `ADW3xx mqtt protocol 2022.2.16.pdf`

---

## 📅 Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2025-10-23 | Initial planning and documentation |

---

**Built for peak shaving optimization | Powered by Railway**
