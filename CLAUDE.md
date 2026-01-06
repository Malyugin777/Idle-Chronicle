# Claude Code Instructions

## Язык общения
Всегда отвечай на русском языке.

## Проект
Idle Chronicle — мобильный кликер-RPG для Telegram Mini App с L2-стилем.

## Версионирование
**При каждом коммите обновляй версию в PhaserGame.tsx!**
```typescript
const APP_VERSION = 'v1.0.XX';  // Инкремент при каждом фиксе
```

Формат версии: `v{major}.{minor}.{patch}`
- **major** — глобальные изменения
- **minor** — новые фичи
- **patch** — баг-фиксы

## Основные технологии
- Frontend: Next.js 14, TypeScript, Phaser 3
- Backend: server.js (Fastify + Socket.io)
- Database: PostgreSQL + Prisma
- Shared: packages/shared (типы, константы, данные)

## Структура проекта
```
apps/web/
  server.js              # Socket.io backend (single file)
  prisma/schema.prisma   # Database schema
  src/components/        # React компоненты
  src/game/              # Phaser (config + scenes)
  services/              # StatsService, etc

packages/shared/src/
  data/items.ts          # База предметов (ITEMS)
  data/sets.ts           # Сетовые бонусы (SETS)
  data/lootTables.ts     # Таблицы дропа сундуков
  types/                 # Общие типы
```

## Ключевые файлы данных (НЕ захардкоживать цифры!)
| Файл | Что содержит |
|------|--------------|
| `data/items.ts` | Все предметы: id, slot, rarity, stats, setId |
| `data/sets.ts` | Сеты и бонусы (3/7, 6/7) |
| `data/lootTables.ts` | DROP_RATES, CHESTS, RARITY_STYLES |

## Баланс старта (MVP)
```
Базовые атрибуты: СИЛ=10, ЛОВ=10, СТОЙ=12, ИНТ=10, ДУХ=10

P.Atk = 10 + (СИЛ-10)*1 + equipment
P.Def = 0 + equipment
MaxStamina = 800 + (СТОЙ-10)*80  = 960 при СТОЙ=12
MaxMana = 100 + (ДУХ-10)*10

Сет новичка (7 предметов):
- Weapon: +8 pAtk
- Helmet/Gloves/Legs/Boots/Shield: +1-3 pDef each
- 3/7 бонус: +3% P.Atk
- 6/7 бонус: +5% P.Atk, +5% P.Def
```

## Награды за босса (Top-100)
```
Rank 1:     Gold + Silver сундук
Rank 2-3:   Silver сундук
Rank 4-10:  Bronze сундук
Rank 11-50: Wooden сундук
Rank 51-100: Wooden сундук
Остальные (active 30s+): 1 Wooden
Не участник (<30s active): ничего
```

## Важные правила
1. **Всегда обновляй версию при коммите**
2. **Цифры баланса — только из файлов data/**
3. **Не создавай новые файлы без необходимости**
4. **Комментарии на русском в data/ файлах**
