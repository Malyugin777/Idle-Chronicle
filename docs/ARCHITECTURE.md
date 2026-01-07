# Idle Chronicle - Architecture Documentation

## Overview

Idle Chronicle - это idle/clicker RPG в стиле Lineage 2 с системой World Boss.

---

## UI Architecture

### Phaser vs React - Разделение ответственности

**ВАЖНО: НЕ ТРОГАТЬ эту архитектуру без веских причин!**

#### Phaser (BattleScene.ts) - ТОЛЬКО для:
```
+------------------------------------------+
|                                          |
|         PHASER CANVAS AREA               |
|                                          |
|    - Boss sprite (изображение босса)     |
|    - Tap handling (обработка кликов)     |
|    - Floating damage numbers (цифры)     |
|    - Hit effects (эффекты удара)         |
|    - Shake/flash animations              |
|                                          |
+------------------------------------------+
```

#### React (PhaserGame.tsx) - ВСЁ остальное:
```
+------------------------------------------+
|  [HP BAR] Boss Name          [Players]   |  <- React header
+------------------------------------------+
|                                          |
|         PHASER CANVAS                    |  <- Phaser (только босс)
|         (boss sprite only)               |
|                                          |
+------------------------------------------+
|  [MANA BAR]                              |  <- React
|  [STAMINA BAR]                           |  <- React
|  [🔥] [❄️] [⚡]  Skill Buttons           |  <- React
|  Damage Feed (список ударов)             |  <- React
+------------------------------------------+
```

### Почему так?

| Компонент | Phaser | React | Причина |
|-----------|--------|-------|---------|
| Boss sprite | ✅ | ❌ | Нужны сложные анимации |
| Damage numbers | ✅ | ❌ | Плавающие анимации |
| Hit effects | ✅ | ❌ | Shake, flash |
| HP/Mana/Stamina bars | ❌ | ✅ | CSS проще и легче |
| Skill buttons | ❌ | ✅ | React состояние, hover эффекты |
| Damage feed | ❌ | ✅ | Просто список текста |
| Modals/Overlays | ❌ | ✅ | React routing, state |

**Phaser тяжёлый!** Используй его только для того, что React/CSS не могут сделать хорошо.

---

## File Structure

```
apps/web/
├── src/
│   ├── game/
│   │   ├── config.ts           # Phaser config (НЕ ТРОГАТЬ размеры)
│   │   ├── index.ts            # Exports
│   │   └── scenes/
│   │       └── BattleScene.ts  # ТОЛЬКО босс + эффекты
│   │
│   ├── components/
│   │   ├── game/
│   │   │   ├── PhaserGame.tsx  # React wrapper + ВСЕ UI элементы
│   │   │   └── TasksModal.tsx  # Daily tasks
│   │   ├── tabs/
│   │   │   ├── CharacterTab.tsx   # Equipment + stats + consumables
│   │   │   ├── TreasuryTab.tsx    # Chests
│   │   │   ├── LeaderboardTab.tsx # Session + all-time
│   │   │   └── ShopTab.tsx        # Buy consumables
│   │   ├── modals/
│   │   │   └── ChestOpenModal.tsx # Chest opening animation
│   │   └── ui/
│   │       ├── BottomNav.tsx      # Tab navigation
│   │       └── ErrorBoundary.tsx
│   │
│   └── lib/
│       ├── socket.ts           # Socket.io singleton
│       ├── i18n.ts             # Translations (RU/EN)
│       └── taskManager.ts      # Daily tasks state
│
├── server.js                   # Game server (~4000 lines)
├── services/
│   └── StatsService.js         # L2 формулы расчёта статов
└── prisma/
    └── schema.prisma           # Database schema
```

---

## Server Architecture (server.js)

### Intervals
| Interval | Frequency | Purpose |
|----------|-----------|---------|
| Boss state broadcast | 250ms | Sync HP to all clients |
| Respawn check | 1000ms | Check if respawn timer expired |
| Stamina/Mana regen | 1000ms | Regen resources for online users |
| Auto-attack | 1000ms | Process auto-attacks |
| Auto-save | 30000ms | Save player data to DB |
| onlineUsers cleanup | 300000ms | Remove stale users (>30 min inactive) |
| Boss state save | 10000ms | Persist boss state to DB |

### Graceful Shutdown
При SIGTERM/SIGINT:
1. Сохраняет boss state в БД
2. Сохраняет данные всех онлайн игроков
3. Отключает Prisma
4. Закрывает Socket.io и HTTP сервер
5. Timeout 10 сек для forced exit

### State Persistence
| Data | Storage | Frequency |
|------|---------|-----------|
| Boss HP/state | GameState singleton | 10 sec |
| Session leaderboard | GameState.sessionLeaderboard | 10 sec |
| Previous boss session | GameState.previousBossSession | On boss kill |
| Player progress | User table | 30 sec + on disconnect |

---

## Combat System (L2-style)

### StatsService.js - Формулы:
```javascript
// P.Atk
physicalPower = 10 + (power - 10) * 1 + equipment

// Max Stamina
maxStamina = 800 + (vitality - 10) * 80

// Max Mana
maxMana = 400 + (spirit - 10) * 40

// Thorns (softcap)
thornsTaken = ceil(rawThorns * 100 / (100 + pDef))

// Attack interval (min 250ms)
interval = 300000 / attackSpeed
```

### Damage Calculation (server.js):
```javascript
baseDamage = pAtk * (1 + str * 0.08)
variance = baseDamage * (0.9 to 1.1)

// Modifiers
soulshotMultiplier = SOULSHOTS[grade].multiplier // 2.0/2.2/3.5
acumenBonus = 0.5 // from buff
critMultiplier = 2.0

// Final
damage = baseDamage * variance * soulshotMultiplier * (1 + acumenBonus)
if (crit) damage *= critMultiplier
damage *= ragePhaseMultiplier
damage = max(1, damage - bossDefense)
```

---

## Reward System (TZ Этап 2)

### Activity Tracking
1. Client sends `activity:ping` every 5 seconds
2. Server caps time between pings at 10 sec (anti-cheat)
3. After 30 sec total → `isEligible = true`
4. Activity resets when boss changes

### Reward Distribution
1. On boss kill → build leaderboard from sessionLeaderboard Map
2. Calculate rank for each participant
3. Distribute chests based on rank (see project.md)
4. Create PendingReward in DB
5. Emit `rewards:available`
6. Player claims via `rewards:claim` → chests created

### Chest Overflow
If user has no free chest slots:
- Chest converts to 50% of base gold value
- User receives gold instead

---

## Socket Events Flow

### Auth Flow
```
Client                    Server
   |                         |
   |-- auth {initData} ----->|
   |                         | verify Telegram
   |                         | upsert User
   |<-- auth:success --------|
   |<-- player:state --------|
   |<-- boss:state ----------|
```

### Tap Flow
```
Client                    Server
   |                         |
   |-- tap:batch {count} --->|
   |                         | validate stamina
   |                         | calculate damage
   |                         | update leaderboard
   |<-- tap:result ----------|
   |                         |
   |                         | broadcast to all
   |<-- damage:feed ---------|
```

### Buff Usage Flow
```
Client                    Server
   |                         |
   |-- buff:use {buffId} --->|
   |                         | check potion count
   |                         | decrement count
   |                         | add to activeBuffs
   |                         | save to DB
   |<-- buff:success --------|
```

---

## Database (Prisma)

### Key Models
| Model | Purpose |
|-------|---------|
| User | Player data, stats, consumables |
| Equipment | Item templates |
| UserEquipment | Player's items (equipped/inventory) |
| Chest | Player's chests |
| PendingReward | Unclaimed boss rewards |
| ActiveBuff | Active buff timers |
| GameState | Singleton for server state |

### GameState Fields
- `currentBossIndex` - which boss is active
- `bossCurrentHp` / `bossMaxHp` - HP
- `respawnAt` - respawn timer
- `sessionLeaderboard` - JSON array
- `previousBossSession` - JSON for leaderboard tab

---

## Dead Code (do not remove without permission)

These are prepared for offline progress feature but not connected:

| File | Function/Variable |
|------|-------------------|
| server.js | `calculateOfflineEarnings()` |
| StatsService.js | `calculateOfflineProgress()` |
| PhaserGame.tsx | `offlineEarnings` state |
| PhaserGame.tsx | `socket.on('offline:earnings')` |
| i18n.ts | `offline.*` translations |

---

## Changelog

### 2026-01-07 (v1.0.49)
- Buff scroll usage from CharacterTab inventory
- Graceful shutdown
- onlineUsers cleanup
- Previous boss session persistence

### 2026-01-06 (v1.0.46-48)
- TZ Этап 2 reward system
- Chest system
- Activity tracking
- Boss image sync fix
- Equipment delta display
- Stat/consumable tooltips

### 2024-01-06
- Renamed `adena` → `gold` everywhere
- Phaser architecture: stripped to boss-only rendering
- UI moved to React (bars, buttons, feed)
