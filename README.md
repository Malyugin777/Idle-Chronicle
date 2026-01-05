# World Boss Clicker

Multiplayer World Boss Clicker for Telegram Mini App (TMA).
Part of [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg) universe.

## Links

- **GitHub:** https://github.com/Malyugin777/Idle-Chronicle
- **Live:** https://world-boss-web.onrender.com (after deploy)
- **Main Game:** [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Phaser 3.80.1, Zustand, TailwindCSS |
| Backend | Fastify, Socket.io, Prisma, ioredis |
| Database | PostgreSQL 15, Redis 7 |
| Deploy | **Render** (web + server + database) |

## Project Structure

```
world-boss-clicker/
├── apps/
│   ├── web/                # Next.js TMA Client
│   └── server/             # Fastify + Socket.io Backend
├── packages/
│   └── shared/             # TypeScript types, constants
├── docker-compose.yml      # Local dev (Redis + PostgreSQL)
├── render.yaml             # Render Blueprint
├── turbo.json
└── pnpm-workspace.yaml
```

## Local Development

```bash
# Install pnpm if not installed
npm install -g pnpm

# Install dependencies
pnpm install

# Start Docker (Redis + PostgreSQL)
docker-compose up -d

# Copy env file
cp apps/server/.env.example apps/server/.env

# Push Prisma schema
pnpm db:push

# Start development
pnpm dev
```

## Deploy to Render

### Option 1: Blueprint (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Blueprint**
3. Connect your GitHub repo
4. Render will detect `render.yaml` and create all services

### Option 2: Manual Setup

#### Frontend (apps/web)

1. **New** → **Web Service**
2. Connect repo
3. Settings:
   - **Name:** `world-boss-web`
   - **Root Directory:** `apps/web`
   - **Runtime:** Node
   - **Build Command:** `pnpm install && pnpm build`
   - **Start Command:** `pnpm start`

#### Backend (apps/server)

1. **New** → **Web Service**
2. Connect repo
3. Settings:
   - **Name:** `world-boss-server`
   - **Root Directory:** `apps/server`
   - **Runtime:** Node
   - **Build Command:** `pnpm install && pnpm build`
   - **Start Command:** `pnpm start`
4. Add Environment Variables:
   - `DATABASE_URL` - from Render PostgreSQL
   - `REDIS_URL` - from Upstash or Render Redis
   - `CORS_ORIGIN` - your frontend URL

#### Database

1. **New** → **PostgreSQL**
2. **Name:** `world-boss-db`
3. Copy `Internal Database URL` to server env

#### Redis (Options)

**Option A: Upstash (Free)**
1. Go to [upstash.com](https://upstash.com)
2. Create Redis database
3. Copy URL to `REDIS_URL`

**Option B: Render Redis (Paid)**
1. **New** → **Redis**
2. Copy connection string

## Environment Variables

### Frontend (apps/web)
```
NEXT_PUBLIC_API_URL=https://world-boss-server.onrender.com
```

### Backend (apps/server)
```
DATABASE_URL=postgresql://user:pass@host:5432/worldboss
REDIS_URL=redis://...
CORS_ORIGIN=https://world-boss-web.onrender.com
PORT=3001
NODE_ENV=production
```

## Game Features

- Real-time multiplayer World Boss
- L2-style stats (STR, DEX, LUCK)
- Soulshots system (NG → S grade)
- Energy-based anti-cheat
- Offline progress
- Leaderboards

## License

MIT
