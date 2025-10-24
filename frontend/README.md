# EMS Frontend - Energy Management System

Real-time dashboard and simulator for monitoring 30-minute energy blocks.

## 🚀 Features

- **Real-time Dashboard** - Live energy usage monitoring with WebSocket updates
- **Simulator** - Test energy meter readings without physical hardware
- **Peak Hour Detection** - Visual indicators for peak/off-peak hours (2PM-10PM)
- **30-Min Block Tracking** - Monitor current block progress toward target
- **Live Charts** - Real-time power readings visualization with Recharts
- **Mobile Responsive** - Works on phones, tablets, and desktops

## 🛠️ Tech Stack

- **React 18** + TypeScript
- **Vite** - Fast build tool
- **DevReady Kit** - UI component library
- **Tailwind CSS** - Utility-first styling
- **Recharts** - Chart library
- **WebSocket** - Real-time communication

## 📦 Installation

```bash
npm install
```

## 🏃 Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🌍 Environment Variables

Create `.env` file:

```env
VITE_API_URL=https://eternalgy-ems-production.up.railway.app
VITE_WS_URL=wss://eternalgy-ems-production.up.railway.app
```

## 📱 How to Use

### Simulator

1. Open the **Simulator** tab
2. Configure device ID, power level, and volatility
3. Click "Start Auto-Send" to begin transmitting readings
4. Readings are sent to the backend via WebSocket

### Dashboard

1. Open the **Dashboard** tab
2. View real-time energy usage for the current 30-min block
3. Monitor progress toward target (200 kWh default)
4. See live chart of power readings
5. Track peak/off-peak hour status

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx     # Real-time dashboard
│   │   └── Simulator.tsx     # Meter simulator
│   ├── hooks/
│   │   └── useWebSocket.ts   # WebSocket connection hook
│   ├── App.tsx               # Main app with routing
│   ├── main.tsx              # Entry point
│   └── index.css             # Tailwind directives
├── public/                   # Static assets
├── Dockerfile                # Production container
├── nginx.conf                # Nginx configuration
└── package.json
```

## 🐳 Docker Deployment

```bash
# Build image
docker build -t ems-frontend .

# Run container
docker run -p 80:80 ems-frontend
```

## 🚀 Railway Deployment

This frontend is configured for Railway deployment with:
- Multi-stage Docker build
- Nginx for serving static files
- Optimized production bundle
- Environment variable support

## 📊 Screenshots

### Dashboard
- Real-time 30-min block tracking
- Peak hour indicators
- Live power chart (Recharts)
- Progress bar toward target

### Simulator
- Adjustable power level (10-200 kW)
- Volatility slider (0-50%)
- Auto-send with configurable interval
- Connection status indicators

## 🔗 WebSocket Protocol

### Simulator Messages

```typescript
// Register as simulator
{
  type: 'simulator:register',
  deviceId: 'SIMULATOR-001'
}

// Send reading
{
  type: 'simulator:reading',
  deviceId: 'SIMULATOR-001',
  totalPowerKw: 75.5,
  timestamp: 1729785600000,
  frequency: 60.0
}
```

### Dashboard Messages

```typescript
// Register as dashboard
{
  type: 'dashboard:register'
}

// Receive updates
{
  type: 'dashboard:update',
  meter: { ... },
  reading: { ... },
  currentBlock: { ... },
  blockInfo: { ... }
}
```

## 🎨 Customization

### Colors

Edit `tailwind.config.js` to customize colors:

```js
theme: {
  extend: {
    colors: {
      peak: '#EF4444',      // Red for peak hours
      offpeak: '#10B981',   // Green for off-peak
    },
  },
},
```

### Target kWh

Edit `Dashboard.tsx` line 85:

```typescript
const targetKwh = 200 // Change this value
```

## 📝 License

MIT © Eternalgy
