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
│   │   └── game/
│   │       ├── PhaserGame.tsx  # React wrapper + ВСЕ UI элементы
│   │       ├── BattleBars.tsx  # HP/Mana/Stamina bars (React)
│   │       ├── SkillButtons.tsx # Skill buttons (React)
│   │       └── DamageFeed.tsx  # Damage feed (React)
│   │
│   └── lib/
│       └── socket.ts           # Socket.io singleton
│
├── server.js                   # Game server (НЕ ТРОГАТЬ формулы без причины)
└── services/
    └── StatsService.js         # L2 формулы расчёта статов
```

---

## Combat System (L2-style)

### НЕ ТРОГАТЬ без понимания:

1. **StatsService.js** - все формулы расчёта:
   - `calculateDerived()` - производные статы
   - `calculateThorns()` - урон от шипов босса
   - `getAttackInterval()` - интервал авто-атаки
   - `calculateOfflineProgress()` - оффлайн прогресс

2. **server.js** - игровая логика:
   - Stamina система (заменила mana для боя)
   - Thorns механика (босс тратит stamina игрока)
   - Exhaustion (5 сек при 0 stamina)
   - Auto-attack loop

### Ключевые формулы:

```javascript
// Stamina cost per tap
staminaCost = 1 + thornsTaken

// Thorns (softcap)
thornsTaken = ceil(rawThorns * 100 / (100 + pDef))

// Auto-attack interval (min 250ms)
interval = 300000 / attackSpeed

// Offline progress (cap 4 hours)
goldEarned = floor(totalDamage / 100)
```

---

## Socket Events

### Client → Server:
- `tap:batch` - пачка тапов
- `skill:use` - использование скилла
- `upgrade:stat` - прокачка стата

### Server → Client:
- `auth:success` - авторизация + начальные данные
- `boss:state` - состояние босса (каждую секунду)
- `tap:result` - результат тапов
- `hero:exhausted` - игрок истощён
- `combat:tick` - результат авто-атаки
- `boss:killed` - босс убит

---

## Database (Prisma)

### User - ключевые поля:
- `gold` (бывший adena) - основная валюта
- `stamina` / `maxStamina` - для боя
- `mana` / `maxMana` - для скиллов
- `power`, `agility`, `vitality` - L2 атрибуты

### Boss:
- `thornsDamage` - обратка босса

### GameState:
- Singleton для сохранения состояния сервера

---

## Changelog

### 2024-01-06
- Renamed `adena` → `gold` everywhere
- Phaser architecture: stripped to boss-only rendering
- UI moved to React (bars, buttons, feed)
