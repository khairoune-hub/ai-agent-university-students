# UniBot Backend

Express + TypeScript API and Telegram bot for the Algerian Bac orientation assistant.

## Scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Start API + Telegram bot with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run migrate` | Create/update database tables (`src/db/schema.sql`) |
| `npm run seed` | Insert default AI settings + sample articles |
| `npm run typecheck` | Type-check without emitting |

## Setup
1. `cp .env.example .env` and fill in values (DB, Telegram token, OpenRouter key, admin creds).
2. `npm install`
3. `npm run migrate`
4. `npm run seed`
5. `npm run dev`

## API

Base URL: `http://localhost:4000`

`GET /health` — liveness probe (public).

### Auth
`POST /api/auth/login` → `{ token, username }`
Body: `{ "username": "...", "password": "..." }`

All routes below require header `Authorization: Bearer <token>`.

### Dashboard
`GET /api/dashboard` — stats + recent users/announcements.

### Articles (knowledge base)
- `GET /api/articles?category=` — list
- `GET /api/articles/:id`
- `POST /api/articles` — `{ title, category, content }`
- `PUT /api/articles/:id` — `{ title, category, content }`
- `DELETE /api/articles/:id`

### Announcements
- `GET /api/announcements`
- `POST /api/announcements` — `{ title, message }` (creates, does not send)
- `POST /api/announcements/:id/send` — broadcast to all Telegram users → `{ delivered, total }`
- `DELETE /api/announcements/:id`

### AI settings
- `GET /api/ai-settings`
- `PUT /api/ai-settings` — `{ system_prompt, model, temperature }`

### Users
- `GET /api/users?limit=&offset=` → `{ users, total }`

## How the AI answers a question
1. Load AI settings (system prompt, model, temperature) from `ai_settings`.
2. Keyword-search `articles` (Postgres full-text, ILIKE fallback) for the question.
3. Build prompt: system prompt + KB context + the student's orientation data + question.
4. Call OpenRouter (`/chat/completions`) and return the text.

No vector database — keyword search only, by design.
