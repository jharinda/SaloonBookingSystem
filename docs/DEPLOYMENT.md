# SnapSalon Deployment Guide

## Prerequisites

- MongoDB Atlas cluster (staging + production)
- Upstash Redis instance (staging + production)
- Render.com account (or equivalent container host)
- PayHere merchant account (sandbox for staging, live for production)
- SendGrid account
- Cloudinary account
- Google OAuth credentials (separate for staging/production redirect URIs)

## Environment variables

Each service needs its environment variables set in the Render.com dashboard (or your orchestrator). Consolidated reference templates live at the repository root:

- `.env.staging.example`
- `.env.production.example`

Copy to `.env.staging` / `.env.production` only for local or non-git workflows; do not commit filled files.

Infrastructure-as-code for Render is outlined in `render.yaml` at the repo root.

## Deploy order

1. **Infrastructure:** MongoDB Atlas, Upstash Redis (TLS; set `REDIS_TLS=true`, `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT` per service that uses Redis).
2. **Backend services:** auth, user, salon, booking, notification, calendar, review, subscription, chat (private services or internal URLs as per your topology).
3. **API gateway:** point upstream `*_SERVICE_URL` env vars to each service’s URL.
4. **Frontend (web)** — depends on the public gateway URL; same-origin `apiUrl` in production uses nginx or reverse proxy to `/api`.

## Health check verification

After deployment, verify each layer (replace hosts with your staging/production domains):

```bash
# Gateway (direct)
curl -fsS https://api.example.com/health

# Example: Terminus health on a service behind the gateway (global prefix + controller path)
curl -fsS https://api.example.com/api/health
```

Adjust paths to match your `PORT` / `globalPrefix` / routing. For services exposed only on the private network, use internal URLs or `kubectl exec` / Render shell as appropriate.

## GitHub environments

In **Settings → Environments**, create `staging` and `production`. Add secrets (e.g. `RENDER_DEPLOY_HOOKS`, database URLs, API keys) per environment. For **production**, enable **required reviewers** so releases need manual approval before running deploy workflows.
