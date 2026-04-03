# SnapSalon Database Backup Strategy

## MongoDB Atlas automated backups

### Configuration (Atlas UI)

- Enable **Cloud Backup** / continuous backups on **M10+** clusters (exact labels vary by Atlas version).
- **Snapshot frequency:** every 6 hours (or per your compliance needs).
- **Retention:** 7 days for frequent snapshots, 4 weeks for daily, 12 months for monthly (adjust to policy).
- **Point-in-time restore (PITR):** up to **7 days** on M10+ where available.

### Free tier (M0 — dev/staging)

- M0 does **not** include Atlas automated backups suitable for production-style recovery.
- Use the manual **`mongodump`** script (`tools/scripts/backup-mongodb.sh`) on a **daily cron** (or CI) for each database URI you care about.

### RPO / RTO targets

| Metric | Target |
|--------|--------|
| **RPO** (Recovery Point Objective) | **6 hours** maximum acceptable data loss (align with snapshot frequency). |
| **RTO** (Recovery Time Objective) | **1 hour** to restore service after a decision to recover. |

Tune these with your org; document any changes here.

---

## Manual backup script

For environments **without** Atlas automated backup (e.g. M0, self-hosted MongoDB, or **disaster-recovery drills**):

- Script: `tools/scripts/backup-mongodb.sh`
- Requires: `mongodump` (MongoDB Database Tools) on the runner
- Run from the **repository root** so rotation of `./backups/` works as written

Example (single URI; repeat per database or use a wrapper that loops your URIs):

```bash
chmod +x tools/scripts/backup-mongodb.sh
./tools/scripts/backup-mongodb.sh "$MONGODB_URI" ./backups/run-$(date +%Y%m%d_%H%M%S)
```

**Production on Atlas M10+:** automated backup is the **primary** strategy. Use the manual script for **staging (M0)**, ad-hoc exports, and **restore testing**, not as the main production safety net.

---

## Recovery procedure

1. Identify the **point in time** to restore (incident time, bad deploy, etc.).
2. In **Atlas:** cluster **⋯** → **Backup** / **Restore** → **Point in time** (or restore from a snapshot).
3. Choose **target cluster** (restore in place or clone to a new cluster).
4. After restore: run **application-level checks** (counts, spot queries, auth flows).
5. If the restore landed on a **new** cluster/host: update **connection strings** for all services and redeploy if needed.

For non-Atlas restores, use `mongorestore` with the same tools version family as `mongodump`.

---

## What to backup (by database role)

| Data domain | Priority | Notes |
|-------------|----------|--------|
| **auth** | CRITICAL | Users, credentials, OAuth state |
| **booking** | CRITICAL | Appointments and scheduling |
| **subscription** | CRITICAL | Billing / payment-related records |
| **salon** | HIGH | Salons, services, staff |
| **review** | MEDIUM | Reviews and ratings |
| **notification** | LOW | Logs; can be rebuilt / re-emitted |
| **calendar** | LOW | Sync metadata; can often re-sync from Google |

Name each Atlas database / connection string consistently with your services (see `.env.*.example` and per-service config).

---

## Redis

Redis holds **cache** and **Bull queues** — treated as **ephemeral**.

- **No backup** required for normal operations.
- If Redis is wiped: caches **repopulate**; **queued jobs** not yet completed may be **lost**; in-flight work may **retry** after workers restart, depending on your idempotency and queue settings.

For compliance-heavy deployments, consider documenting queue-critical workflows separately.
