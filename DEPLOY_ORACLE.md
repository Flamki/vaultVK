# Deploy VaultKV Backend On Oracle Always Free

This runbook deploys the VaultKV backend (3 nodes + gateway + TLS proxy) to an Oracle Cloud Always Free VM, then connects your Vercel frontend.

Related docs:

- Main overview: [README.md](README.md)
- Vercel frontend guide: [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)
- Render backend guide: [DEPLOY_RENDER.md](DEPLOY_RENDER.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

## 1) Create Oracle VM

1. Create an Oracle Cloud account and choose a region with available Always Free capacity.
2. Create one Ubuntu VM (Always Free shape).
3. Open inbound security rules for:
   - `22/tcp` (SSH)
   - `80/tcp` (HTTP for ACME challenge)
   - `443/tcp` (HTTPS API + WebSocket)
4. Point an `A` record like `api.yourdomain.com` to your VM public IP.

Note: Oracle may reclaim idle Always Free instances. Keep a real workload and monitor uptime.

## 2) Bootstrap VM

SSH into VM and run:

```bash
sudo bash scripts/oracle_bootstrap.sh
```

Then reconnect SSH once (if you use the `ubuntu` user) so Docker group membership applies.

## 3) Configure Environment

Create deployment env file:

```bash
cp deploy/oracle/.env.example deploy/oracle/.env
```

Edit `deploy/oracle/.env`:

- `DOMAIN=api.yourdomain.com`
- `ACME_EMAIL=you@example.com`
- `VAULTKV_KEY_HEX=<64-char-hex-key>`
- `VAULTKV_CORS_ORIGINS=https://your-frontend.vercel.app`

## 4) Deploy Backend

```bash
bash scripts/oracle_deploy.sh up
```

Check status:

```bash
bash scripts/oracle_deploy.sh status
```

Follow logs:

```bash
bash scripts/oracle_deploy.sh logs gateway
```

## 5) Validate Backend

```bash
curl -i https://api.yourdomain.com/health
curl -i https://api.yourdomain.com/api/cluster
```

## 6) Wire Vercel Frontend

In Vercel Project Settings -> Environment Variables:

- `VITE_API_BASE_URL=https://api.yourdomain.com`
- `VITE_WS_BASE_URL=wss://api.yourdomain.com` (optional)

Redeploy frontend after setting vars.

## 7) Operations

Restart backend stack:

```bash
bash scripts/oracle_deploy.sh restart
```

Shutdown backend stack:

```bash
bash scripts/oracle_deploy.sh down
```

## Included Files

- [deploy/oracle/docker-compose.oracle.yml](deploy/oracle/docker-compose.oracle.yml)
- [deploy/oracle/Caddyfile](deploy/oracle/Caddyfile)
- [deploy/oracle/.env.example](deploy/oracle/.env.example)
- [scripts/oracle_bootstrap.sh](scripts/oracle_bootstrap.sh)
- [scripts/oracle_deploy.sh](scripts/oracle_deploy.sh)
