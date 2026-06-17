# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (incl. dev) for compiling TypeScript
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build   # compiles to dist/ and copies schema.sql

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output (includes dist/db/schema.sql)
COPY --from=build /app/dist ./dist

EXPOSE 4000

# Run migrations + seed (idempotent) then start the API + bot.
CMD ["npm", "run", "start:railway"]
