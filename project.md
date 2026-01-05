# World Boss Clicker

## Overview

**Genre:** Multiplayer Idle Clicker
**Platform:** Telegram Mini App (TMA)
**Engine:** Next.js 14 + Phaser 3.80.1
**Backend:** Fastify + Socket.io + Prisma
**Version:** 2.0.0
**GitHub:** https://github.com/Malyugin777/Idle-Chronicle
**Vercel:** https://idle-chronicle.vercel.app
**Integration:** [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg)

---

## Architecture (Turborepo Monorepo)

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
├── docker-compose.yml          # Redis + PostgreSQL
├── turbo.json
└── pnpm-workspace.yaml
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
- Default max: 1000
- Regen: 10/sec

---

## Database Schema (PostgreSQL)

- **User** - Stats, currencies, inventory
- **Boss** - HP, defense, loot table
- **BossSession** - Active boss instance
- **DamageLog** - Per-user damage tracking
- **Weapon** - Upgradeable weapons
- **Item** - Loot drops (RPG items)
- **Task** - Daily/weekly quests

---

## Redis State

- `boss:hp` - Current boss HP (atomic DECRBY)
- `boss:session:*:lb` - Session leaderboard (Sorted Set)
- `user:*` - User cache (Hash, TTL 1h)
- `users:online` - Online users (Set)
- `boss:damagefeed` - Recent damage (List, capped 50)
- `ratelimit:user:*` - Token bucket rate limiting

---

## WebSocket Events

### Client → Server
- `tap:batch` - Batch of taps
- `upgrade:stat` - Buy stat upgrade
- `soulshot:toggle` - Toggle soulshot

### Server → Client
- `boss:state` - HP update (100ms interval)
- `tap:result` - Damage result
- `boss:killed` - Victory + rewards
- `boss:rage` - Rage phase change

---

## Visual Style

- **Theme:** Dark Fantasy (Lineage 2 C1-C4)
- **Font:** Press Start 2P (pixel)
- **Colors:**
  - Background: `#0e141b` → `#2a313b`
  - Gold: `#D6B36A`
  - Health: `#C41E3A`
  - Energy: `#3498DB`
  - Crit: `#FF4444`

---

## Commands

```bash
# Development
pnpm dev              # Start all apps
pnpm --filter web dev # Start frontend only
pnpm --filter server dev # Start backend only

# Database
pnpm db:push          # Push schema to DB
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed initial data
pnpm db:studio        # Open Prisma Studio

# Docker
pnpm docker:up        # Start Redis + PostgreSQL
pnpm docker:down      # Stop containers

# Build
pnpm build            # Build all apps
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 05.01.2026 | Initial simple clicker |
| **2.0.0** | **05.01.2026** | **Turborepo monorepo upgrade** |
| | | - Next.js 14 + TypeScript |
| | | - Fastify + Socket.io backend |
| | | - Prisma + PostgreSQL |
| | | - Redis for hot state |
| | | - Friend's boss sprite + effects |

---

## TODO

- [ ] Implement damage calculation on server
- [ ] Add WebSocket authentication
- [ ] Boss rotation system
- [ ] Leaderboard tab
- [ ] Shop tab with soulshots
- [ ] Character tab with upgrades
- [ ] Treasury tab (RPG loot)
- [ ] Offline progress
- [ ] Deploy backend to Railway
