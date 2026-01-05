# World Boss Clicker

Multiplayer World Boss Clicker for Telegram Mini App (TMA).
Part of [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg) universe.

## Links

- **GitHub:** https://github.com/Malyugin777/Idle-Chronicle
- **Vercel:** https://idle-chronicle.vercel.app
- **Main Game:** [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Phaser 3.80.1, Zustand, TailwindCSS |
| Backend | Fastify, Socket.io, Prisma, ioredis |
| Database | PostgreSQL 15, Redis 7 |
| Deploy | Vercel (web), Railway (server) |

## Project Structure

```
world-boss-clicker/
├── apps/
│   ├── web/                # Next.js TMA Client
│   └── server/             # Fastify + Socket.io Backend
├── packages/
│   └── shared/             # TypeScript types, constants
├── docker-compose.yml      # Redis + PostgreSQL
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

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

## Vercel Setup

> **Important:** Root directory must be set to `apps/web`

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select project → **Settings** → **General**
3. Set **Root Directory:** `apps/web`
4. Set **Framework Preset:** Next.js
5. Click **Redeploy**

## Game Features

- Real-time multiplayer World Boss
- L2-style stats (STR, DEX, LUCK)
- Soulshots system (NG → S grade)
- Energy-based anti-cheat
- Offline progress
- Leaderboards

## License

MIT
