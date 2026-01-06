# Claude Code Instructions

## Язык общения
Всегда отвечай на русском языке.

## Проект
Idle Chronicle — мобильный кликер-RPG для Telegram Mini App с L2-стилем.

## Основные технологии
- Frontend: Next.js 14, TypeScript, Phaser 3
- Backend: server.js (Fastify + Socket.io)
- Database: PostgreSQL + Prisma
- Shared: packages/shared (типы, константы, данные)

## Структура
```
apps/web/           # Next.js frontend
  server.js         # Socket.io backend (single file)
  prisma/           # Database schema
  src/components/   # React компоненты
  src/game/         # Phaser сцены

packages/shared/    # Общие типы и данные
  src/data/items.ts # База предметов
  src/data/sets.ts  # Сетовые бонусы
```

## Важные файлы
- `apps/web/server.js` — вся серверная логика
- `apps/web/src/components/tabs/CharacterTab.tsx` — экипировка и статы
- `packages/shared/src/data/items.ts` — база предметов (ITEMS)
- `packages/shared/src/data/sets.ts` — сетовые бонусы (SETS)
