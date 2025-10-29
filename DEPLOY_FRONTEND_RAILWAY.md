# Deploy Frontend to Railway - Step by Step Guide

**Date:** 2025-10-24
**Status:** Ready to Deploy

---

## 🚀 Quick Deploy Steps

### 1. Go to Railway Dashboard

Open: https://railway.com/project/b7689a85-7397-47fc-a821-0d15e09de530

---

### 2. Create New Service

1. Click **"+ New"** button
2. Select **"GitHub Repo"**
3. Choose repository: **Zhihong0321/Eternalgy-EMS**
4. Railway will detect the repository

---

### 3. Configure Service

**Service Settings:**

| Setting | Value |
|---------|-------|
| **Service Name** | `frontend` or `ems-frontend` |
| **Root Directory** | `frontend` |
| **Build Method** | Auto-detected (Dockerfile) |

**How to set Root Directory:**
1. Click on the new service
2. Go to **"Settings"** tab
3. Scroll to **"Service"** section
4. Set **"Root Directory"** to: `frontend`
5. Click **"Save"**

---

### 4. Deploy

Railway will automatically:
1. Detect `frontend/railway.toml`
2. Use `frontend/Dockerfile` for build
3. Build the multi-stage Docker image
4. Deploy with Nginx

**Expected build time:** ~2-3 minutes

---

### 5. Get Public URL

Once deployed:
1. Go to **"Settings"** tab
2. Scroll to **"Networking"** section
3. Click **"Generate Domain"**
4. Railway will provide a URL like:
   ```
   https://ems-frontend-production.up.railway.app
   ```

---

## ✅ Verify Deployment

### Test 1: Health Check

Visit the Railway URL in browser:
```
https://your-frontend-url.railway.app
```

**Expected:** EMS Dashboard loads with navigation tabs

—

## Important: Two UI Serving Paths

This project can serve the Dashboard UI from TWO different places. Knowing which one you are testing prevents "why didn't it update?" moments:

1) Frontend Service (recommended for production)
- Hosted by Railway as its own service
- Built via `frontend/Dockerfile` and served by Nginx
- URL looks like: `https://ems-frontend-<env>.up.railway.app`
- When you push to GitHub, Railway rebuilds this service and serves the latest assets automatically

2) Backend Static UI (useful for quick testing or single-domain)
- Backend Express serves files from `backend/public`
- Those files must be kept up to date by copying the latest `frontend/dist` build into `backend/public`
- URL looks like: `https://eternalgy-ems-<env>.up.railway.app`
- To automate this, the backend service must run a Build Command that builds the frontend and syncs it before starting the server

If you are testing the backend URL, make sure the backend service rebuilds the frontend and syncs assets on each deploy (see "Backend Static UI" notes below).

—

---

### Test 2: WebSocket Connection

1. Open browser console (F12)
2. Check for:
   ```
   ✅ WebSocket connected
   ```

If you see "WebSocket disconnected", wait 10 seconds for auto-reconnect.

---

### Test 3: End-to-End Flow

**Complete Test:**

1. **Open Frontend URL** → Should see Dashboard tab

2. **Switch to Simulator Tab**
   - Device ID: "RAILWAY-TEST-001"
   - Power: 80 kW
   - Volatility: 15%
   - Interval: 10 seconds
   - Click **"Start Auto-Send"**

3. **Switch to Dashboard Tab**
   - Should see real-time updates
   - Chart should populate
   - Block stats should update
   - Progress bar should grow

4. **Verify Data in Backend**
   ```bash
   # Check readings were inserted
   curl https://eternalgy-ems-production.up.railway.app/api/debug/meters/list

   # Check current block
   curl https://eternalgy-ems-production.up.railway.app/api/debug/blocks/calculate-current/RAILWAY-TEST-001
   ```

---

## 🔧 Troubleshooting

### Issue: "Application failed to respond"

**Solution:** Check build logs
1. Go to service in Railway
2. Click **"Deployments"** tab
3. Click latest deployment
4. Check **"Build Logs"** and **"Deploy Logs"**

---

### Issue: "Frontend didn’t update on backend domain"

Symptoms:
- You pushed changes, but `https://eternalgy-ems-<env>.up.railway.app` still shows the old UI

Cause:
- You are viewing the backend-hosted static UI (`backend/public`). It only updates when the backend deploy runs the frontend build and sync step.

Fix:
1. In Railway, open your Backend service.
2. Set Build Command to:
   ```bash
   npm --prefix backend run build
   ```
   This runs the script defined in `backend/package.json`, which:
   - installs frontend deps (`npm ci`),
   - builds the Vite assets,
   - copies `frontend/dist` into `backend/public` via `scripts/sync-frontend.js`.
3. Set Start Command to:
   ```bash
   npm --prefix backend run start
   ```
4. Redeploy the Backend service, then hard-refresh the browser (Ctrl/Cmd+Shift+R) or open in Incognito.

Verification:
- On the Dashboard page, look for the build marker section titled "TEST NEW CHART". If you see it, the backend is serving the latest build.

—

### Issue: WebSocket won't connect

**Possible causes:**

1. **Backend not running**
   - Check: https://eternalgy-ems-production.up.railway.app/api/health
   - Should return `{"status":"ok",...}`

2. **Wrong WebSocket URL**
   - Frontend expects: `wss://eternalgy-ems-production.up.railway.app`
   - Check browser console for connection attempts

3. **CORS issue**
   - Backend already has `cors` enabled with `*` origin
   - Should work out of the box

---

### Issue: Build fails with npm errors

**Solution:** Check package.json
- All dependencies should install
- If fails, check Railway logs for specific error
- May need to add `--legacy-peer-deps` to npm install

---

## 📊 Expected Railway Services

After deployment, you should have:

```
Railway Project: Eternalgy-EMS
├── PostgreSQL (Database)          ✅ Running
├── Backend (Node.js)              ✅ Running
│   └── URL: eternalgy-ems-production.up.railway.app
└── Frontend (Nginx)               🆕 Deploying
    └── URL: ems-frontend-production.up.railway.app

If you plan to use the Backend domain for the UI, enable the Backend Build Command (see Troubleshooting above) so it always serves the latest assets.
```

---

## 🎯 Post-Deployment Checklist

After frontend deploys successfully:

- [ ] Frontend URL loads
- [ ] Dashboard tab visible
- [ ] Simulator tab visible
- [ ] WebSocket connects (check browser console)
- [ ] Simulator can send readings
- [ ] Dashboard receives real-time updates
- [ ] Chart displays data
- [ ] Progress bar works
- [ ] Peak hour badge shows correctly
- [ ] Block statistics calculate correctly
- [ ] If testing backend domain, "TEST NEW CHART" section is visible (build marker)

---

## 📱 Mobile Testing

Once deployed, test on mobile:

1. Open frontend URL on phone
2. Go to Simulator tab
3. Start auto-send (10s interval)
4. Switch to Dashboard tab
5. Verify real-time updates work on mobile

**Expected:** Fully responsive, works perfectly on phone! 📱

---

## 🔒 Security Notes

**Current Configuration:**
- ✅ Nginx with security headers
- ✅ CORS enabled on backend
- ✅ WebSocket over WSS (encrypted)
- ✅ HTTPS by default on Railway

**For Production (Future):**
- [ ] Add authentication
- [ ] Restrict CORS origins
- [ ] Add rate limiting
- [ ] Custom domain

---

## 📊 Monitoring

**Check Deployment Status:**
```bash
# Frontend health (Nginx)
curl https://your-frontend-url.railway.app

# Backend health (Node.js)
curl https://eternalgy-ems-production.up.railway.app/api/health

# WebSocket test (browser console)
const ws = new WebSocket('wss://eternalgy-ems-production.up.railway.app')
ws.onopen = () => console.log('Connected!')
```

---

## 💰 Railway Costs

**Free Tier Usage:**
- PostgreSQL: ~$1-2/month
- Backend: ~$1-2/month
- Frontend: ~$0.50-1/month
- **Total:** ~$2.50-5/month (within $5 free credit)

---

## 🎉 Success Indicators

Your deployment is successful when:

1. ✅ Frontend URL loads instantly
2. ✅ Browser console shows: "✅ WebSocket connected"
3. ✅ Simulator can send readings
4. ✅ Dashboard updates in real-time
5. ✅ Chart displays data
6. ✅ No console errors

---

## 📞 Quick Commands

**Railway CLI (if needed):**
```bash
# Link to project
railway link

# View logs
railway logs

# Open in browser
railway open
```

---

## 🚀 Alternative: One-Click Deploy

If you prefer, you can also deploy directly from Railway UI:

1. Go to Railway dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose "Zhihong0321/Eternalgy-EMS"
5. Railway detects both backend and frontend
6. Click "Deploy"

Railway will deploy both services automatically!

---

## ✅ Final Result

**After successful deployment:**

- **Frontend**: https://ems-frontend-production.up.railway.app
- **Backend**: https://eternalgy-ems-production.up.railway.app
- **GitHub**: https://github.com/Zhihong0321/Eternalgy-EMS

**All systems:** 🟢 LIVE

---

## 📝 What to Do After Deploy

1. **Test the simulator** - Send some readings
2. **Watch the dashboard** - See real-time updates
3. **Share the URL** - Show your team!
4. **Mobile test** - Try on phone
5. **Celebrate!** 🎉

---

**Ready to deploy! Just follow the steps above.** 🚀

Let me know once deployed and I'll help you test it!
