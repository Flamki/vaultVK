# Deploy VaultKV On Render (Free Trial Setup)

This setup uses Render Blueprint to deploy:

- `vaultkv-node1` (private service)
- `vaultkv-node2` (private service)
- `vaultkv-node3` (private service)
- `vaultkv-gateway` (public web service)

## Important Cost Note

Private services (`pserv`) do not support the `free` plan. This setup depends on Render trial credits for the 3 node services.

## 1) Deploy Blueprint

1. Push this repo to GitHub.
2. In Render dashboard, choose **New -> Blueprint**.
3. Select this repository.
4. Render detects `render.yaml` at repo root.

## 2) Set Required Environment Variables

During Blueprint setup, set:

- `VAULTKV_KEY_HEX` (same 64-char hex value for all nodes)
- `VAULTKV_CORS_ORIGINS` (your frontend URL, e.g. `https://your-app.vercel.app`)

## 3) Verify

After deploy, open:

- `https://<vaultkv-gateway>.onrender.com/health`
- `https://<vaultkv-gateway>.onrender.com/api/cluster`

## 4) Connect Vercel Frontend

Set Vercel env vars:

- `VITE_API_BASE_URL=https://<vaultkv-gateway>.onrender.com`
- `VITE_WS_BASE_URL=wss://<vaultkv-gateway>.onrender.com` (optional)

Then redeploy frontend.

## Operational Notes

- `kill` / `restart` node actions are disabled in this Render mode (`VAULTKV_DISABLE_DOCKER_CONTROL=1`) because Render does not provide a shared Docker daemon to service containers.
- Gateway on `free` plan can spin down when idle, causing cold starts.
