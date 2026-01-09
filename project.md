# Idle Chronicle

Multiplayer World Boss Clicker для Telegram Mini App в стиле Lineage 2.

## Overview

| | |
|---|---|
| **Genre** | Multiplayer Idle Clicker RPG |
| **Platform** | Telegram Mini App (TMA) |
| **Version** | 1.0.111 |
| **GitHub** | https://github.com/Malyugin777/Idle-Chronicle |
| **Deploy** | Railway |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Phaser 3, TailwindCSS |
| Backend | Node.js, Socket.io, Prisma |
| Database | PostgreSQL |
| Deploy | Railway |

---

## Project Structure

```
idle-chronicle/
├── apps/
│   └── web/                     # Next.js Frontend + Backend
│       ├── src/
│       │   ├── app/             # Next.js pages
│       │   ├── components/      # React components
│       │   │   ├── game/        # PhaserGame.tsx, TasksModal.tsx
│       │   │   ├── tabs/        # CharacterTab, TreasuryTab, LeaderboardTab, ShopTab
│       │   │   ├── modals/      # ChestOpenModal
│       │   │   └── ui/          # BottomNav, ErrorBoundary
│       │   ├── game/            # Phaser config + BattleScene
│       │   └── lib/             # Socket, i18n, taskManager
│       ├── server.js            # Socket.io backend (~4000 lines)
│       ├── services/            # StatsService.js
│       └── prisma/              # Schema
│
└── packages/
    └── shared/                  # Shared types & data
        └── src/data/
            ├── items.ts         # Item definitions (ITEMS)
            ├── sets.ts          # Set bonuses (SETS)
            └── lootTables.ts    # Chest drop rates (CHESTS)
```

---

## Game Mechanics

### World Boss
- **All players attack ONE boss** in real-time
- HP syncs across all connected clients via WebSocket
- Boss respawns **5 hours** after death
- Rage phases at 75%, 50%, 25% HP (damage multiplier increases)
- 100 bosses total (cycling through templates)

### Stats (L2-style)

| Stat | Base | Effect |
|------|------|--------|
| Power (СИЛ) | 10 | +8% damage per point |
| Agility (ЛОВ) | 10 | Attack speed, crit chance |
| Vitality (СТОЙ) | 12 | +80 max stamina per point |
| Intellect (ИНТ) | 10 | Magic power |
| Spirit (ДУХ) | 10 | +40 max mana per point |

### Damage Formula
```
baseDamage = pAtk * (1 + STR * 0.08)
variance = baseDamage * (0.9 to 1.1)
critCheck = random < (0.05 + LUCK * 0.03)
critDamage = damage * 2.0
rageMultiplier = [1.0, 1.2, 1.5, 2.0][ragePhase]
soulshotMultiplier = 1.0 / 2.0 / 2.2 / 3.5 (NG/D/C)
buffMultiplier = 1.0 + acumenBonus (0.5)
finalDamage = (damage - bossDefense) * rageMultiplier
```

### Stamina System
- Tap cost: 1 + thornsDamage (boss thorns)
- Max: 800 + (Vitality - 10) * 80
- Regen: 1/sec
- Exhaustion: 5 sec at 0 stamina (can't attack)

### Consumables

| Item | Effect | Duration |
|------|--------|----------|
| Soulshot NG | x2 damage | per tap |
| Soulshot D | x2.2 damage | per tap |
| Soulshot C | x3.5 damage | per tap |
| Scroll Haste | +30% attack speed | 30 sec |
| Scroll Acumen | +50% damage | 30 sec |
| Scroll Luck | +10% crit chance | 60 sec |

---

## Reward System (TZ Этап 2)

### Activity Requirement
- Must be active 30+ seconds to be eligible
- Activity ping every 5 seconds from client
- Max 10 sec between pings (anti-cheat)

### Chest Rewards by Rank

| Rank | Wooden | Bronze | Silver | Gold | Badge |
|------|--------|--------|--------|------|-------|
| 1 | 2 | 2 | 2 | 1 | Slayer (7d) |
| 2 | 2 | 2 | 1 | 1 | Elite (7d) |
| 3 | 2 | 1 | 1 | 1 | Elite (3d) |
| 4-10 | 2 | 1 | 1 | - | - |
| 11-25 | 2 | - | 1 | - | - |
| 26-50 | 3 | 1 | - | - | - |
| 51-100 | 2 | 1 | - | - | - |
| 101+ | 2 | - | - | - | - |
| Not eligible | 0 | 0 | 0 | 0 | - |

### Chest Types

| Type | Open Time | Gold | Item % | Scroll % |
|------|-----------|------|--------|----------|
| Wooden | 5 min | 1000 | 55% | 3% |
| Bronze | 30 min | 2500 | 80% | 15% |
| Silver | 4 hours | 7000 | 100% | 25% |
| Gold | 8 hours | 20000 | 100% | 45% |

---

## WebSocket Events

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `auth` | `{ initData, language }` | Telegram auth |
| `tap:batch` | `{ count }` | Batch of taps (1-50) |
| `activity:ping` | - | Activity tracking |
| `buff:use` | `{ buffId }` | Use buff scroll |
| `soulshot:toggle` | `{ grade }` | Toggle soulshot |
| `chest:start` | `{ chestId }` | Start opening chest |
| `chest:collect` | `{ chestId }` | Collect opened chest |
| `equipment:equip` | `{ itemId }` | Equip item |
| `equipment:unequip` | `{ itemId }` | Unequip item |
| `rewards:claim` | `{ rewardId }` | Claim pending reward |

### Server → Client
| Event | Data | Description |
|-------|------|-------------|
| `auth:success` | player data | Auth success |
| `boss:state` | boss state | Boss HP (250ms) |
| `boss:killed` | kill data | Boss death + rewards |
| `boss:respawn` | boss state | New boss spawned |
| `tap:result` | damage data | Tap result |
| `damage:feed` | feed entry | Other players' damage |
| `player:state` | stamina/mana | Resource update |
| `activity:status` | activity data | Eligibility status |
| `chest:data` | chests array | User's chests |
| `chest:opened` | chest data | Chest ready to collect |
| `rewards:available` | - | New rewards available |
| `buff:success` | buff data | Buff activated |

---

## Database Schema

### Key Models
| Model | Description |
|-------|-------------|
| User | Telegram user, stats, currencies, consumables |
| Equipment | Item templates (weapons, armor) |
| UserEquipment | User's items (equipped + inventory) |
| Chest | User's chests (pending + opening) |
| PendingReward | Boss kill rewards to claim |
| ActiveBuff | Active buff timers |
| GameState | Singleton: boss state, leaderboard, previousBossSession |

---

## Local Development

```bash
# 1. Install pnpm
npm install -g pnpm

# 2. Install dependencies
pnpm install

# 3. Start PostgreSQL (Docker)
docker-compose up -d

# 4. Setup database
cd apps/web
cp .env.example .env
npx prisma db push

# 5. Run development
pnpm dev
```

---

## TODO

### Done
- [x] Server-side damage calculation
- [x] WebSocket real-time sync
- [x] Rage phases
- [x] Stamina system (replaced energy)
- [x] Equipment system with set bonuses
- [x] L2-style stat formulas
- [x] Telegram authentication
- [x] Shop tab (soulshots, buffs)
- [x] Character tab with equipment
- [x] Treasury (chest system)
- [x] Multiple bosses rotation (100 bosses)
- [x] TZ Этап 2 reward system
- [x] Activity tracking for eligibility
- [x] Graceful shutdown
- [x] onlineUsers cleanup
- [x] Buff scroll usage from inventory
- [x] Enchanting system (Enchant Charges + Protection)
- [x] MERGE system (item fusion)
- [x] SALVAGE system (item disassembly)
- [x] Chest Keys (instant open)
- [x] SSOT architecture for resources
- [x] Auto-attack with buff support
- [x] Forge UI (enchant, merge, salvage)

### Pending
- [ ] Offline progress (code exists but not connected)
- [ ] Boss Spine animations
- [ ] Persistent all-time leaderboard
- [ ] TON wallet integration
- [ ] Source of premium crystals (dailies/achievements)
