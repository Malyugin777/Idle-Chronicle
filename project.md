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

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Canvas 2D, Socket.io-client, TailwindCSS |
| Backend | Fastify, Socket.io, Prisma |
| Database | PostgreSQL |
| Deploy | Render (2 services + database) |

---

## Project Structure

```
world-boss-clicker/
├── apps/
│   ├── web/                    # Next.js 14 Frontend
│   │   ├── src/
│   │   │   ├── app/            # Pages
│   │   │   ├── components/     # GameCanvas, UI
│   │   │   └── lib/            # Socket, constants
│   │   └── public/assets/      # Boss sprites
│   │
│   └── server/                 # Fastify + Socket.io Backend
│       ├── src/
│       │   ├── config/         # Environment
│       │   ├── shared/prisma/  # Prisma client
│       │   └── index.ts        # Main server
│       └── prisma/             # Schema
│
├── packages/
│   └── shared/                 # Types, constants (optional)
│
├── render.yaml                 # Render Blueprint
└── turbo.json
```

---

## Game Mechanics

### World Boss
- **All players attack ONE boss** in real-time
- HP syncs across all connected clients via WebSocket
- Boss respawns 5 seconds after death
- Rage phases at 75%, 50%, 25% HP (damage multiplier increases)

### Stats (L2-style)

| Stat | Effect |
|------|--------|
| STR | +8% damage per point |
| DEX | +5% attack speed per point |
| LUCK | +3% crit chance per point |

### Damage Formula
```
baseDamage = pAtk * (1 + STR * 0.08)
variance = baseDamage * (0.9 to 1.1)
critCheck = random < (0.05 + LUCK * 0.03)
critDamage = damage * 2.0
rageMultiplier = [1.0, 1.2, 1.5, 2.0][ragePhase]
finalDamage = (damage - bossDefense) * rageMultiplier
```

### Energy System (Anti-cheat)
- 1 energy per tap
- Max: 1000
- Regen: 10/sec
- Tap batching: up to 50 taps per batch

---

## WebSocket Events

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `auth` | `{ telegramId, username, firstName, photoUrl }` | Authenticate user |
| `tap:batch` | `{ count }` | Batch of taps (1-50) |
| `upgrade:stat` | `{ stat: 'str'|'dex'|'luck' }` | Buy stat upgrade |
| `leaderboard:get` | - | Request leaderboard |

### Server → Client
| Event | Data | Description |
|-------|------|-------------|
| `boss:state` | `{ id, name, hp, maxHp, ragePhase, playersOnline }` | Boss HP (100ms) |
| `tap:result` | `{ damage, crits, energy, sessionDamage }` | Tap result |
| `damage:feed` | `{ playerName, damage, isCrit }` | Other players' damage |
| `boss:killed` | `{ bossName, finalBlowBy, leaderboard }` | Boss death |
| `boss:respawn` | `{ id, name, hp, maxHp }` | New boss spawned |
| `boss:rage` | `{ phase, multiplier }` | Rage phase change |
| `auth:success` | `{ id, username, level, str, dex, luck, ... }` | Auth success |

---

## Database Schema (PostgreSQL)

| Model | Description |
|-------|-------------|
| User | Telegram user, stats, currencies, energy |
| Boss | Boss definition, HP, defense, loot table |
| BossSession | Active boss instance, damage tracking |
| DamageLog | Per-user damage per session |
| Weapon | Upgradeable weapons |
| Item | Loot drops |
| Task | Daily/weekly quests |

---

## Local Development

```bash
# 1. Install pnpm
npm install -g pnpm

# 2. Install dependencies
pnpm install

# 3. Start PostgreSQL (Docker)
docker run -d --name worldboss-db \
  -e POSTGRES_USER=worldboss \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=worldboss \
  -p 5432:5432 postgres:15

# 4. Setup server
cp apps/server/.env.example apps/server/.env
# Edit DATABASE_URL if needed
pnpm db:push

# 5. Run development
pnpm dev
```

### Commands

```bash
pnpm dev                    # Start all (frontend + backend)
pnpm --filter web dev       # Frontend only
pnpm --filter server dev    # Backend only
pnpm db:push                # Push Prisma schema
pnpm db:studio              # Prisma Studio (DB GUI)
pnpm build                  # Build all
```

---

## Deploy to Render

### Option 1: Blueprint (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. **New** → **Blueprint**
3. Connect GitHub repo
4. Render will detect `render.yaml` and create:
   - `world-boss-web` (Frontend)
   - `world-boss-server` (Backend)
   - `world-boss-db` (PostgreSQL)

5. **After deployment**, set environment variables:
   - **Frontend** (`world-boss-web`):
     - `NEXT_PUBLIC_API_URL` = `https://world-boss-server.onrender.com`
   - **Backend** (`world-boss-server`):
     - `CORS_ORIGIN` = `https://world-boss-web.onrender.com`

### Option 2: Manual Setup

#### 1. Database
- **New** → **PostgreSQL**
- Name: `world-boss-db`
- Copy **Internal Database URL**

#### 2. Backend
- **New** → **Web Service**
- Connect repo
- Settings:
  - **Name:** `world-boss-server`
  - **Root Directory:** `apps/server`
  - **Build Command:** `npm i -g pnpm && cd ../.. && pnpm i && cd apps/server && pnpm build && pnpm db:push`
  - **Start Command:** `pnpm start`
- Environment Variables:
  - `DATABASE_URL` = (from PostgreSQL)
  - `CORS_ORIGIN` = (frontend URL after deploy)
  - `NODE_ENV` = `production`

#### 3. Frontend
- **New** → **Web Service**
- Connect repo
- Settings:
  - **Name:** `world-boss-web`
  - **Root Directory:** `apps/web`
  - **Build Command:** `npm i -g pnpm && cd ../.. && pnpm i && pnpm build:web`
  - **Start Command:** `pnpm start`
- Environment Variables:
  - `NEXT_PUBLIC_API_URL` = (backend URL)
  - `NODE_ENV` = `production`

---

## Seeding Initial Boss

After deploy, you need to add a boss to the database:

```sql
-- Connect to Render PostgreSQL and run:
INSERT INTO "Boss" (id, code, name, title, "baseHp", defense, "ragePhases", "isActive")
VALUES (
  'orfen-001',
  'ORFEN',
  'Orfen',
  'Nightmare',
  1000000,
  0,
  '[{"hpPercent": 75, "multiplier": 1.2}, {"hpPercent": 50, "multiplier": 1.5}, {"hpPercent": 25, "multiplier": 2.0}]',
  true
);
```

Or use Prisma Studio: `pnpm db:studio`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 05.01.2026 | Initial simple clicker |
| 2.0.0 | 05.01.2026 | Turborepo, Next.js, Fastify, Prisma |
| **2.1.0** | **05.01.2026** | **Full multiplayer implementation** |
| | | - Server-side damage calculation |
| | | - WebSocket real-time sync |
| | | - Rage phases |
| | | - Energy system |
| | | - Damage feed |
| | | - Session leaderboard |
| | | - No Redis (in-memory state) |

---

## TODO

- [x] Server-side damage calculation
- [x] WebSocket real-time sync
- [x] Rage phases
- [x] Energy system
- [ ] Telegram authentication verification
- [ ] Persistent leaderboard (all-time)
- [ ] Shop tab (soulshots, buffs)
- [ ] Character upgrades UI
- [ ] Treasury (RPG loot drops)
- [ ] Offline progress
- [ ] Multiple bosses rotation
- [ ] Boss Spine animations
