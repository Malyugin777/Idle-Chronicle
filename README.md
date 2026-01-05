# World Boss Clicker

Multiplayer World Boss Clicker for Telegram Mini App (TMA).

## Tech Stack

### Frontend (apps/web)
- **Next.js 14** - App Router
- **TypeScript** - Strict mode
- **Phaser 3.80.1** - Boss scene, effects
- **Zustand** - Global state
- **Socket.io-client** - WebSocket
- **TailwindCSS** - Styling

### Backend (apps/server)
- **Fastify** - HTTP server
- **Socket.io** - WebSocket server
- **Prisma** - PostgreSQL ORM
- **ioredis** - Redis client

### Infrastructure
- **PostgreSQL 15** - Persistent data
- **Redis 7** - Hot state, rate limiting
- **Vercel** - Frontend deploy
- **Railway** - Backend deploy

## Project Structure

```
world-boss-clicker/
├── apps/
│   ├── web/                # Next.js TMA Client
│   └── server/             # Fastify Backend
├── packages/
│   └── shared/             # TypeScript types, constants
├── docker-compose.yml      # Redis + PostgreSQL
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start Docker (Redis + PostgreSQL)
docker-compose up -d

# Push Prisma schema
pnpm db:push

# Start development
pnpm dev
```

## Links

- **GitHub:** https://github.com/Malyugin777/Idle-Chronicle
- **Vercel:** https://idle-chronicle.vercel.app
- **Main Game:** [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg)

## License

MIT
