# UniBot — AI Orientation Assistant for Algerian Bac Students

A simple Telegram AI chatbot that helps Algerian Baccalaureate students:

1. Choose university specialties
2. Understand specialties and career opportunities
3. Understand university registration procedures
4. Receive registration updates and announcements

The bot replies in **Arabic by default** but also understands French and English.

This is a **single-admin** MVP — no multi-tenancy, no microservices, no queues, no
vector database. Just a Telegram bot, an Express API, PostgreSQL, and an OpenRouter
LLM, plus a small Next.js admin panel.

```
Telegram Bot ──► Express Backend ──► PostgreSQL
                       │
                       └──► OpenRouter (LLM)
Admin (Next.js) ──► Express Backend
```

## Project structure

```
ai-agent-university-students/
├── backend/          Node + Express + TypeScript: REST API + Telegram bot
│   └── src/
│       ├── config/   Environment & settings loading
│       ├── db/       Postgres pool, schema, migrations, seed
│       ├── services/ AI (OpenRouter), knowledge base, settings, users
│       ├── bot/      Telegram bot (grammY) handlers
│       ├── routes/   Admin REST API
│       └── middleware/
└── admin/            Next.js + TailwindCSS admin dashboard
```

## Quick start

### 0. Prerequisites
- Node.js 18+ (tested on 22)
- A running PostgreSQL database
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An OpenRouter API key from [openrouter.ai](https://openrouter.ai/keys)

### 1. Backend
```bash
cd backend
cp .env.example .env      # then fill in the values
npm install
npm run migrate           # create tables
npm run seed              # insert default AI settings + sample articles
npm run dev               # starts API + Telegram bot
```

### 2. Admin panel
```bash
cd admin
cp .env.example .env.local # set NEXT_PUBLIC_API_URL (default http://localhost:4000)
npm install
npm run dev                # http://localhost:3000
```

Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in the backend `.env`.

See [backend/README.md](backend/README.md) for API details.
