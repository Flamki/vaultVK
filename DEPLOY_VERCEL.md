# Deploy VaultKV Frontend On Vercel

This document deploys the React control plane on Vercel while running the VaultKV backend stack on a Linux container host.

Related docs:

- Main overview: [README.md](README.md)
- Oracle backend guide: [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)
- Render backend guide: [DEPLOY_RENDER.md](DEPLOY_RENDER.md)

## 1) Backend Requirement

Vercel does not run the full long-lived VaultKV stack (3 C++ nodes + FastAPI gateway + Docker-based node control).  
Deploy backend on Linux using Docker Compose, then expose gateway publicly over HTTPS.

Required routes:

- `https://gateway.yourdomain.com/api/*`
- `wss://gateway.yourdomain.com/ws/*`

Current live example:

- Frontend: [https://vault-vk.vercel.app](https://vault-vk.vercel.app)
- Backend: [https://80.225.207.59.nip.io](https://80.225.207.59.nip.io)

## 2) Vercel Project Settings

When importing this repository into Vercel:

- Framework: `Vite`
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

## 3) Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `VITE_API_BASE_URL=https://gateway.yourdomain.com`
- `VITE_WS_BASE_URL=wss://gateway.yourdomain.com` (optional)

If `VITE_WS_BASE_URL` is omitted, the app derives WebSocket URL from `VITE_API_BASE_URL`.

## 4) Deploy

Push to GitHub and deploy from Vercel dashboard, or use Vercel CLI:

```bash
cd frontend
npm i -g vercel
vercel --prod
```

## Included Frontend Deployment Artifacts

- `frontend/vercel.json`: SPA rewrite for React Router
- `frontend/.env.example`: environment variable template
- `frontend/src/lib/runtimeConfig.ts`: central API/WS URL builder used by all network calls

## Quick Troubleshooting

- `404: NOT_FOUND` on Vercel root: set project Root Directory to `frontend`, then redeploy.
- Key Explorer `{"detail":"key not found"}`: run `SET` first, then `GET` the same key.
