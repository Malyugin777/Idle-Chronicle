# World Boss Clicker

Multiplayer World Boss Clicker for Telegram Mini App.
Part of [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg) universe.

## Overview

| | |
|---|---|
| **Genre** | Multiplayer Idle Clicker |
| **Platform** | Telegram Mini App (TMA) |
| **Version** | 2.0.0 |
| **GitHub** | https://github.com/Malyugin777/Idle-Chronicle |
| **Render** | https://world-boss-web.onrender.com |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Phaser 3.80.1, Zustand, TailwindCSS |
| Backend | Fastify, Socket.io, Prisma, ioredis |
| Database | PostgreSQL 15, Redis 7 |
| Deploy | Render |

---

## Project Structure

```
world-boss-clicker/
├── apps/
│   ├── web/                    # Next.js 14 (App Router)
│   │   ├── src/
│   │   │   ├── app/            # Pages
│   │   │   ├── components/     # React + Phaser
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── stores/         # Zustand stores
│   │   │   └── lib/            # Utils
│   │   └── public/assets/      # Images, sounds
│   │
│   └── server/                 # Fastify + Socket.io
│       ├── src/
│       │   ├── config/         # Environment
│       │   ├── modules/        # Business logic
│       │   └── shared/         # Prisma, Redis
│       └── prisma/             # Schema, migrations
│
├── packages/
│   └── shared/                 # Types, constants
│
├── docker-compose.yml          # Local dev
├── render.yaml                 # Render Blueprint
└── turbo.json
```

---

## Game Mechanics

### World Boss
- Entire server attacks ONE boss in real-time
- HP syncs across all connected clients
- Rage phases at 75%, 50%, 25% HP

### Stats (L2-style)

| Stat | Effect |
|------|--------|
| STR | +8% damage per point |
| DEX | +5% attack speed per point |
| LUCK | +3% crit chance per point |

### Soulshots

| Grade | Multiplier | Cost |
|-------|------------|------|
| NG | x1.5 | 1 |
| D | x2.2 | 5 |
| C | x3.5 | 25 |
| B | x5.0 | 100 |
| A | x7.0 | 500 |
| S | x10.0 | 2000 |

### Energy System (Anti-cheat)
- 1 energy per tap
- Max: 1000, Regen: 10/sec

---

## Database Schema

| Model | Description |
|-------|-------------|
| User | Stats, currencies, inventory |
| Boss | HP, defense, loot table |
| BossSession | Active boss instance |
| DamageLog | Per-user damage tracking |
| Weapon | Upgradeable weapons |
| Item | Loot drops (RPG items) |
| Task | Daily/weekly quests |

## Redis Keys

| Key | Type | Description |
|-----|------|-------------|
| `boss:hp` | String | Current HP (atomic DECRBY) |
| `boss:session:*:lb` | Sorted Set | Session leaderboard |
| `user:*` | Hash | User cache (TTL 1h) |
| `users:online` | Set | Online users |
| `boss:damagefeed` | List | Recent damage (cap 50) |

---

## WebSocket Events

### Client → Server
- `tap:batch` - Batch of taps
- `upgrade:stat` - Buy stat upgrade
- `soulshot:toggle` - Toggle soulshot

### Server → Client
- `boss:state` - HP update (100ms)
- `tap:result` - Damage result
- `boss:killed` - Victory + rewards
- `boss:rage` - Rage phase change

---

## Visual Style

- **Theme:** Dark Fantasy (Lineage 2 C1-C4)
- **Font:** Press Start 2P
- **Colors:**
  - Background: `#0e141b` → `#2a313b`
  - Gold: `#D6B36A`
  - Health: `#C41E3A`
  - Energy: `#3498DB`
  - Crit: `#FF4444`

---

## Local Development

```bash
# Install
npm install -g pnpm
pnpm install

# Docker
docker-compose up -d

# Setup
cp apps/server/.env.example apps/server/.env
pnpm db:push

# Run
pnpm dev
```

## Commands

```bash
pnpm dev                    # Start all
pnpm --filter web dev       # Frontend only
pnpm --filter server dev    # Backend only
pnpm db:push                # Push schema
pnpm db:studio              # Prisma Studio
pnpm build                  # Build all
```

---

## Deploy to Render

### Frontend (apps/web)

| Setting | Value |
|---------|-------|
| Name | `world-boss-web` |
| Root Directory | `apps/web` |
| Build Command | `npm i -g pnpm && pnpm i && pnpm build` |
| Start Command | `pnpm start` |

### Backend (apps/server)

| Setting | Value |
|---------|-------|
| Name | `world-boss-server` |
| Root Directory | `apps/server` |
| Build Command | `npm i -g pnpm && pnpm i && pnpm build` |
| Start Command | `pnpm start` |

### Environment Variables

**Frontend:**
```
NEXT_PUBLIC_API_URL=https://world-boss-server.onrender.com
```

**Backend:**
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://... (Upstash free)
CORS_ORIGIN=https://world-boss-web.onrender.com
PORT=3001
NODE_ENV=production
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 05.01.2026 | Initial simple clicker |
| 2.0.0 | 05.01.2026 | Turborepo monorepo, Next.js 14, Fastify, Prisma, Redis |

---

## TODO

- [ ] Server-side damage calculation
- [ ] WebSocket authentication
- [ ] Boss rotation system
- [ ] Leaderboard tab
- [ ] Shop tab
- [ ] Character upgrades tab
- [ ] Treasury (RPG loot)
- [ ] Offline progress
