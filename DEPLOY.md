# Deploying UniBot to Railway

This monorepo deploys as **3 Railway services in one project**:

1. **Postgres** — managed database (Railway plugin)
2. **backend** — Express API + Telegram bot (root dir: `backend`)
3. **admin** — Next.js dashboard (root dir: `admin`)

The bot uses **long polling**, so no webhook or public URL is needed for Telegram
to work. Migrations + seed run **automatically on every deploy** (idempotent) via
`npm run start:railway`.

---

## Step 1 — Create the project & database
1. Push this repo to GitHub (already done).
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo** → pick this repo.
3. In the project: **New → Database → PostgreSQL**. Name it `Postgres`.

## Step 2 — Configure the **backend** service
Railway created a service from the repo. Open it → **Settings**:
- **Root Directory:** `backend`
- (Build & start commands come from `backend/railway.json` automatically.)

Then open **Variables** and add:

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
| `CORS_ORIGIN` | (fill in Step 4 with the admin URL) |

> Do **not** set `PORT` — Railway injects it and the app reads it automatically.

Under **Settings → Networking**, click **Generate Domain** → copy the backend URL
(e.g. `https://unibot-backend.up.railway.app`). You'll need it for the admin.

## Step 3 — Add the **admin** service
1. In the same project: **New → GitHub Repo** → pick this repo again.
2. Open it → **Settings → Root Directory:** `admin`
3. **Variables:**

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | the backend public URL from Step 2 |

> `NEXT_PUBLIC_*` is baked in at **build time**, so set it *before* the first build
> (if you set it later, trigger a redeploy).

4. **Settings → Networking → Generate Domain** → copy the admin URL.

## Step 4 — Close the loop (CORS)
Back in the **backend** service → Variables → set:

| Variable | Value |
| --- | --- |
| `CORS_ORIGIN` | the admin public URL from Step 3 |

Redeploy the backend.

---

## Done — verify
- **Backend health:** open `https://<backend-url>/health` → `{"status":"ok","botEnabled":true}`
- **Bot:** message your bot on Telegram → `/start` should reply in Arabic.
- **Admin:** open the admin URL → log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

---

## Alternative: Docker

Each service has a `Dockerfile`, and `docker-compose.yml` runs the whole stack
(Postgres + backend + admin) locally with one command.

```bash
# 1. Fill backend/.env (TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, admin creds).
#    DATABASE_URL is overridden by compose to use the bundled Postgres.
docker compose up --build
```

- Admin → http://localhost:3000
- Backend/API → http://localhost:4000 (health: `/health`)
- Migrations + seed run automatically when the backend container starts.

Build images individually:
```bash
docker build -t unibot-backend ./backend
docker build -t unibot-admin --build-arg NEXT_PUBLIC_API_URL=https://your-api ./admin
```

> Railway can deploy straight from these Dockerfiles too — in a service's
> **Settings → Build**, switch the builder to **Dockerfile** instead of Nixpacks.
> (The default Nixpacks + `railway.json` path also works; pick one.)

---

## Notes
- **Private networking:** using `${{Postgres.DATABASE_PRIVATE_URL}}` keeps DB traffic
  on Railway's internal network (`*.railway.internal`) — faster, free egress, and the
  URL is never exposed. That's why `PGSSL=false` (internal connections aren't proxied
  over TLS). If you ever connect over the **public** proxy URL instead, set `PGSSL=true`.
- **Auto-migrate/seed:** `start:railway` runs `migrate` then `seed` (both idempotent)
  before starting. Sample articles are only inserted when the `articles` table is empty,
  so deleting them in the admin won't bring them back on the next deploy.
- **Scaling note:** the bot's orientation questionnaire state is in-memory, so keep the
  **backend at 1 replica**. Everything else (data, settings) lives in Postgres.
