# Deploying the UniBot backend to Railway

This repo is the **backend only** (Express API + Telegram bot). The app lives at
the repo root, so Railway auto-detects Node — **no Root Directory setting needed.**
The admin frontend is a separate project (kept local for now).

Two services in one Railway project:
1. **Postgres** — managed database (Railway plugin)
2. **backend** — this repo

The bot uses **long polling**, so no webhook/public URL is required for Telegram.
Migrations + seed run **automatically on every deploy** (idempotent) via
`npm run start:railway`.

---

## Step 1 — Project & database
1. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo** → pick this repo.
2. In the project: **New → Database → PostgreSQL** (name it `Postgres`).

## Step 2 — Backend variables
Open the backend service → **Variables**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_PRIVATE_URL}}` ← private network reference, not a copied string |
| `PGSSL` | `false` |
| `TELEGRAM_BOT_TOKEN` | your BotFather token |
| `BOT_ENABLED` | `true` |
| `OPENROUTER_API_KEY` | your key from openrouter.ai |
| `ADMIN_USERNAME` | e.g. `admin` |
| `ADMIN_PASSWORD` | a strong password |
| `JWT_SECRET` | a long random string |
| `CORS_ORIGIN` | the admin panel's URL (once it's deployed) |

> Do **not** set `PORT` — Railway injects it and the app reads it automatically.

## Step 3 — Build & start
Railway's builder (Railpack/Nixpacks) auto-detects this Node app:
- Build: `npm run build`
- Start: `npm run start:railway` (runs migrate → seed → start) — defined in `railway.json`.

If the start command isn't picked up automatically, set it manually under
**Settings → Deploy → Custom Start Command**: `npm run start:railway`.

**Prefer Docker?** Set **Settings → Build → Builder = Dockerfile**. The root
`Dockerfile` already auto-runs migrate+seed on start.

## Step 4 — Verify
- **Health:** open `https://<backend-url>/health` → `{"status":"ok","botEnabled":true}`
- **Bot:** message your bot → `/start` should reply in Arabic.

---

## Local with Docker
```bash
# Fill .env first (TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, admin creds)
docker compose up --build
```
Postgres + backend come up together; migrations run automatically.
API/health → http://localhost:4000.

## Notes
- **Private networking:** `${{Postgres.DATABASE_PRIVATE_URL}}` keeps DB traffic on
  Railway's internal network (`*.railway.internal`) — faster, free, never exposed.
  That's why `PGSSL=false`. Over the public proxy URL instead, use `PGSSL=true`.
- **Single replica:** the orientation questionnaire state is in-memory — keep the
  backend at **1 replica**. All persistent data lives in Postgres.
- **Frontend:** the admin panel (`admin/`, ignored here) is deployed separately.
  Point its `NEXT_PUBLIC_API_URL` at this backend's public URL, and set this
  backend's `CORS_ORIGIN` to the admin's URL.
