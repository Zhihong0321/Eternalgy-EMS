# Serve Frontend from Backend (Static UI) on Railway

Use this approach if you want a single domain (the Backend service) to serve both the API and the Dashboard UI.

## Overview

- Backend Express serves static files from `backend/public`
- The `frontend/dist` build must be copied into `backend/public` on each deploy
- We automate this with a Backend Build Command that runs a script to build and sync assets

## Prerequisites

- `backend/package.json` contains a `build` script that:
  ```json
  {
    "scripts": {
      "build": "npm --prefix ../frontend ci --legacy-peer-deps --include=dev && npm --prefix ../frontend run build && node ../scripts/sync-frontend.js"
    }
  }
  ```
- `scripts/sync-frontend.js` copies `frontend/dist` to `backend/public`

## Railway Configuration (Backend Service)

1. Open your Backend service in Railway
2. In Settings, set:
   - Build Command:
     ```bash
     npm --prefix backend run build
     ```
   - Start Command:
     ```bash
     npm --prefix backend run start
     ```
3. Redeploy the Backend service

## Verify the Latest Build is Served

1. Open the Backend URL:
   ```
   https://eternalgy-ems-<env>.up.railway.app
   ```
2. Hard refresh (Ctrl/Cmd+Shift+R) or use Incognito
3. On the Dashboard, look for the section titled:
   - "TEST NEW CHART" — this is a build marker used to confirm the deployed UI is the latest

If you see the marker, the sync succeeded and the Backend is serving the latest `frontend/dist`.

## Notes on Caching

- Vite outputs hashed asset filenames, which bust cache for JS/CSS automatically
- The HTML (`index.html`) can be cached by browsers and proxies; use hard refresh when validating
- For stricter control, you can add headers on the Backend to set low/no-cache for `index.html` while keeping long cache for static assets

## When to Prefer the Frontend Service

- For clearer separation of concerns, better caching, and cleaner logs, use the dedicated Frontend service (Docker + Nginx)
- If you choose this, test via the Frontend URL and skip this static sync approach

## Quick Release Checklist (Backend Static UI)

- [ ] Push changes to `master`
- [ ] Backend service rebuilds (check Railway Deploy logs)
- [ ] Build Command runs successfully
- [ ] Start Command runs successfully
- [ ] Visit Backend URL and hard refresh
- [ ] See "TEST NEW CHART" marker on Dashboard

## Troubleshooting

If UI didn’t update on the Backend domain:
- Confirm the Backend Build Command is set to `npm --prefix backend run build`
- Check that `scripts/sync-frontend.js` completed in the logs
- Ensure `backend/public/index.html` changed in the deployment
- Try Incognito or Ctrl/Cmd+Shift+R