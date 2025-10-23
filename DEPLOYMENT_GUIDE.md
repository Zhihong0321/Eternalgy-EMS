# Railway Deployment Guide - Eternalgy EMS Backend

## 🚀 Quick Deployment Steps

### 1. Create Backend Service in Railway

1. Go to Railway Dashboard: https://railway.com/project/b7689a85-7397-47fc-a821-0d15e09de530

2. Click **"+ New Service"**

3. Select **"GitHub Repo"**

4. Choose: **Zhihong0321/Eternalgy-EMS**

5. Set **Root Directory**: `backend`

6. Railway will auto-detect the Dockerfile and deploy!

---

### 2. Configure Environment Variables

In the Railway service settings, add these variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | *Auto-linked from Postgres* | Click "Add Reference" → Select Postgres → DATABASE_URL |
| `NODE_ENV` | `production` | Manual entry |
| `ALLOWED_ORIGINS` | `*` | For MVP (restrict in production) |

**Important**: The `DATABASE_URL` should be **referenced** from the existing Postgres service, not manually entered!

---

### 3. Link Database (Critical!)

1. In the backend service, go to **"Variables"** tab

2. Click **"New Variable"** → **"Add Reference"**

3. Select: **Postgres service** → **DATABASE_URL**

4. This ensures the backend can connect to the database

---

### 4. Run Database Migration

After first deployment:

1. Go to backend service → **"Settings"** → **"Deploy"**

2. Add a **One-time Command**:
   ```bash
   npm run db:migrate
   ```

3. Or connect to the service terminal and run:
   ```bash
   railway run npm run db:migrate
   ```

This will create the database tables (meters, energy_readings, thirty_min_blocks).

---

### 5. Verify Deployment

Once deployed, Railway will provide a public URL like:

```
https://eternalgy-ems-backend-production.up.railway.app
```

**Test the deployment:**

1. **Visit the health check page:**
   ```
   https://your-backend-url.railway.app/
   ```
   You should see the status dashboard with green indicators!

2. **Check the API:**
   ```
   https://your-backend-url.railway.app/api/health
   ```
   Should return JSON with status: "ok"

3. **Test WebSocket (optional):**
   ```javascript
   const ws = new WebSocket('wss://your-backend-url.railway.app');
   ws.onopen = () => console.log('Connected!');
   ```

---

## 📋 Troubleshooting

### Issue: "Cannot connect to database"

**Solution**: Make sure DATABASE_URL is linked from Postgres service (not manually entered)

1. Delete manual DATABASE_URL variable
2. Click "Add Reference" → Postgres → DATABASE_URL

---

### Issue: "Tables don't exist"

**Solution**: Run the migration script

```bash
railway run npm run db:migrate
```

---

### Issue: "Port already in use"

**Solution**: Railway auto-assigns the PORT. Make sure your code uses `process.env.PORT` (already configured in `src/index.js`)

---

## 🎯 Post-Deployment Checklist

- [ ] Service deployed successfully
- [ ] DATABASE_URL linked from Postgres
- [ ] Migration script run (tables created)
- [ ] Health check page loads (https://your-url/)
- [ ] API endpoint works (/api/health returns JSON)
- [ ] WebSocket ready (shown in health check)

---

## 📊 Expected Service Architecture

```
Railway Project: Eternalgy-EMS
├── Postgres (Database)
│   └── Tables: meters, energy_readings, thirty_min_blocks
│
└── Backend (Node.js)
    ├── Port: Auto-assigned by Railway
    ├── Health: /api/health
    ├── Static: / (health check page)
    └── WebSocket: ws://your-url/
```

---

## 🔐 Security Notes (Post-MVP)

Currently configured for MVP:
- CORS: `*` (allow all origins)
- Database SSL: Auto-handled by Railway

**Before production:**
- [ ] Restrict CORS to specific domains
- [ ] Add rate limiting
- [ ] Enable WebSocket authentication
- [ ] Set up monitoring/alerts

---

## 📝 Useful Railway CLI Commands

```bash
# View logs
railway logs

# Run migration
railway run npm run db:migrate

# Open service in browser
railway open

# Get DATABASE_URL
railway variables get DATABASE_URL
```

---

## ✅ Success Indicators

Your deployment is successful if:

1. ✅ Service shows "Active" in Railway dashboard
2. ✅ Health check page loads with green indicators
3. ✅ `/api/health` returns `{"status": "ok", ...}`
4. ✅ No errors in Railway logs
5. ✅ Database connection works (check logs for "✅ Database connected")

---

**Next Step:** Once backend is deployed, build the simulator and dashboard pages!

**Railway Project URL:** https://railway.com/project/b7689a85-7397-47fc-a821-0d15e09de530

**GitHub Repo:** https://github.com/Zhihong0321/Eternalgy-EMS
