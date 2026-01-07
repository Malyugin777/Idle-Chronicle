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
- Backend: server.js (Node.js + Socket.io)
- Database: PostgreSQL + Prisma
- Shared: packages/shared (типы, константы, данные)
- Deploy: Railway

## Структура проекта
```
apps/web/
  server.js              # Socket.io backend (single file, ~4000 строк)
  prisma/schema.prisma   # Database schema
  src/components/        # React компоненты
    game/PhaserGame.tsx  # Главный игровой UI
    tabs/                # CharacterTab, TreasuryTab, LeaderboardTab, ShopTab
  src/game/              # Phaser (config + scenes)
  services/              # StatsService.js

packages/shared/src/
  data/items.ts          # База предметов (ITEMS)
  data/sets.ts           # Сетовые бонусы (SETS)
  data/lootTables.ts     # Таблицы дропа сундуков (CHESTS)
  types/                 # Общие типы
```

## Ключевые файлы данных (НЕ захардкоживать цифры!)
| Файл | Что содержит |
|------|--------------|
| `data/items.ts` | Все предметы: id, slot, rarity, stats, setId |
| `data/sets.ts` | Сеты и бонусы (3/7, 6/7) |
| `data/lootTables.ts` | CHESTS, CHEST_UI, RARITY_STYLES |

## Баланс старта (MVP)
```
Базовые атрибуты: СИЛ=10, ЛОВ=10, СТОЙ=12, ИНТ=10, ДУХ=10

P.Atk = 10 + (СИЛ-10)*1 + equipment
P.Def = 0 + equipment
MaxStamina = 800 + (СТОЙ-10)*80  = 960 при СТОЙ=12
MaxMana = 400 + (ДУХ-10)*40

Сет новичка (7 предметов):
- Weapon: +8 pAtk
- Helmet/Gloves/Legs/Boots/Shield: +1-3 pDef each
- 3/7 бонус: +3% P.Atk
- 6/7 бонус: +5% P.Atk, +5% P.Def
```

## Награды за босса (TZ Этап 2)
```
Все eligible (30+ сек активности): 2 Wooden базово

Rank 1:     +1 Gold, +2 Silver, +2 Bronze, badge "Slayer" (7 дней)
Rank 2:     +1 Gold, +1 Silver, +2 Bronze, badge "Elite" (7 дней)
Rank 3:     +1 Gold, +1 Silver, +1 Bronze, badge "Elite" (3 дня)
Rank 4-10:  +1 Silver, +1 Bronze
Rank 11-25: +1 Silver
Rank 26-50: +1 Bronze, +1 Wooden
Rank 51-100: +1 Bronze
Rank 101+:  только базовые 2 Wooden

Не eligible (<30 сек): ничего
```

## Consumables
| Item | Эффект | Длительность |
|------|--------|--------------|
| Soulshot NG | x2 урона | 1 тап |
| Soulshot D | x2.2 урона | 1 тап |
| Soulshot C | x3.5 урона | 1 тап |
| Scroll Haste | +30% скорость атаки | 30 сек |
| Scroll Acumen | +50% урона | 30 сек |
| Scroll Luck | +10% крит шанс | 60 сек |

## Сундуки
| Тип | Длительность | Лут |
|-----|--------------|-----|
| Wooden | 5 мин | 1000 gold, 55% шмот, 3% свиток |
| Bronze | 30 мин | 2500 gold, 80% шмот, 15% свиток |
| Silver | 4 часа | 7000 gold, 100% шмот, 25% свиток |
| Gold | 8 часов | 20000 gold, 100% шмот, 45% свиток |

## Server Features
- **Graceful shutdown**: SIGTERM/SIGINT сохраняет boss state + данные игроков
- **onlineUsers cleanup**: каждые 5 мин удаляет stale (>30 мин без активности)
- **Boss state persistence**: сохраняется в БД каждые 10 сек
- **Previous boss session**: сохраняется для вкладки лидерборда

## Важные правила
1. **Всегда обновляй версию при коммите**
2. **Цифры баланса — только из файлов data/**
3. **Не создавай новые файлы без необходимости**
4. **Комментарии на русском в data/ файлах**
5. **ITEMS таблицу (data/items.ts) изменять ТОЛЬКО с письменного разрешения!**
6. **server.js содержит TODO-комментарии для синхронизации с shared**

## Правила экипировки (КРИТИЧНО!)
1. **НИКОГДА не создавать generic предметы!** Дроп только из существующих в БД с `droppable=true`
2. **Каждый предмет — в 4 редкостях** (common, uncommon, rare, epic)
3. **Все предметы принадлежат сету** (setId обязателен)
4. **Сеты именуются по прогрессии**: novice → iron → steel → mithril и т.д.
5. **Структура имён**: `{set}-{slot}` (например: `iron-sword`, `steel-helmet`)
6. **Дроп**: если нет droppable предметов нужной редкости — выдаётся бонус gold
7. **Улучшение редкости**: НЕ реализовано, предметы дропаются готовой редкости

## Баланс статов по редкости
| Rarity | pAtk (weapon) | pDef (armor) | Описание |
|--------|---------------|--------------|----------|
| Common | 8-10 | 1-3 | Базовые статы |
| Uncommon | 12-14 | 3-5 | +20-40% к статам |
| Rare | 16-18 | 5-7 | +60-80% к статам |
| Epic | 20-24 | 8-10 | +100-140% к статам |

## Мёртвый код (не удалять без разрешения)
- `calculateOfflineEarnings()` в server.js
- `calculateOfflineProgress()` в StatsService.js
- `offlineEarnings` state в PhaserGame.tsx
- `offline:earnings` socket listener
- переводы `offline.*` в i18n.ts
