# Railway Deployment Configuration

This document describes the Railway deployment settings for the Robbie parliamentary procedure application.

## Project Structure

The project consists of two services deployed as separate Railway services:

```
robbie/
├── backend/          # Express + Socket.io server
│   └── railway.toml
├── frontend/         # React + Vite SPA
│   └── railway.toml
└── shared/           # Shared types (npm package)
```

## Service Configuration

### Backend Service (`backend/railway.toml`)

```toml
[build]
builder = "RAILPACK"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Key settings:**
- **builder**: `RAILPACK` - Railway's optimized builder
- **buildCommand**: Installs dependencies and compiles TypeScript
- **startCommand**: Runs `node dist/index.js` via npm start
- **healthcheckPath**: `/api/health` endpoint for Railway to verify the service is running

### Frontend Service (`frontend/railway.toml`)

```toml
[build]
builder = "RAILPACK"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
```

**Key settings:**
- **builder**: `RAILPACK` - Railway's optimized builder
- **buildCommand**: Compiles TypeScript and builds Vite production bundle
- **startCommand**: Runs `serve dist -s` to serve the static files

## Critical Configuration Details

### PORT Environment Variable

Railway automatically assigns a `PORT` environment variable (typically `8080`). Both services must:

1. **Listen on `0.0.0.0`** (not `localhost`) - Railway cannot reach localhost-bound services
2. **Use the `PORT` environment variable** - Railway routes traffic to this port

**Backend (`src/index.ts`):**
```typescript
const PORT = process.env.PORT || 3001;
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Frontend (`package.json`):**
```json
{
  "scripts": {
    "start": "serve dist -s -l tcp://0.0.0.0:${PORT:-3000}"
  }
}
```

### Domain Target Port (Dashboard Setting)

In the Railway dashboard under **Settings > Networking > Public Networking**, each domain has a **Target Port** setting.

**This must match the port your application listens on.**

| Setting | Value | Why |
|---------|-------|-----|
| Target Port | `8080` | Railway assigns `PORT=8080`, so apps listen on 8080 |

If the target port doesn't match the listening port, you'll get **502 "Application failed to respond"** errors.

### Common 502 Error Causes

1. **Port mismatch**: Target port set to 3000/3001 but app listens on 8080
2. **Binding to localhost**: App binds to `127.0.0.1` instead of `0.0.0.0`
3. **App not started**: Check deploy logs for startup errors
4. **Health check failing**: Verify healthcheckPath returns 200

## Environment Variables

### Backend

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Auto-assigned by Railway | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `CLIENT_ORIGIN` | Frontend URL for CORS | `https://robbie-frontend-development.up.railway.app` |

### Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Auto-assigned by Railway | `8080` |
| `VITE_SERVER_URL` | Backend URL (build-time) | `https://robbie-backend-development.up.railway.app` |

**Note:** Vite environment variables prefixed with `VITE_` are embedded at build time, not runtime.

## Database (PostgreSQL)

The backend connects to a Railway-provisioned PostgreSQL database. The connection string is provided via `DATABASE_URL`.

The storage layer (`db/meetingStorage.ts`) auto-detects the environment:
- With `DATABASE_URL`: Uses PostgreSQL for persistent storage
- Without: Falls back to in-memory storage

## Deployment Commands

```bash
# Deploy from CLI (if Railway CLI installed)
cd backend && railway up
cd frontend && railway up

# Or push to linked GitHub repo for automatic deploys
git push origin main
```

## URLs (Development Environment)

- **Frontend**: https://robbie-frontend-development.up.railway.app
- **Backend**: https://robbie-backend-development.up.railway.app
- **Health Check**: https://robbie-backend-development.up.railway.app/api/health

## Troubleshooting

### 502 Bad Gateway
1. Check deploy logs for errors
2. Verify app logs show correct port (should be 8080)
3. Verify domain target port in dashboard matches app port
4. Ensure app binds to `0.0.0.0`

### WebSocket Connection Failed
1. Verify `CLIENT_ORIGIN` is set correctly on backend
2. Check browser console for CORS errors
3. Ensure frontend `VITE_SERVER_URL` points to backend URL

### Database Connection Failed
1. Verify `DATABASE_URL` is set in backend service variables
2. Check PostgreSQL service is running
3. Review backend logs for connection errors
