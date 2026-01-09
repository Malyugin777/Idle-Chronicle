# Idle Chronicle

Multiplayer World Boss Clicker for Telegram Mini App (L2-style).

## Links

| | |
|---|---|
| **GitHub** | https://github.com/Malyugin777/Idle-Chronicle |
| **Deploy** | Railway (auto-deploy on push) |
| **Version** | v1.0.111 |

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Phaser 3, TailwindCSS
- **Backend**: Node.js, Socket.io (single server.js ~5000 lines)
- **Database**: PostgreSQL + Prisma
- **Deploy**: Railway

## Quick Start

```bash
# Install pnpm
npm install -g pnpm

# Install dependencies
pnpm install

# Start PostgreSQL
docker-compose up -d

# Setup database
cd apps/web
cp .env.example .env
npx prisma db push

# Run development
pnpm dev
```

## Git Workflow

```bash
# 1. COMMIT - save changes locally
git add -A
git commit -m "v1.0.XXX: Description"

# 2. PUSH - upload to GitHub
git push

# 3. DEPLOY - automatic!
# Railway watches GitHub and deploys on every push
```

### What is what?

| Term | What it does |
|------|--------------|
| **Commit** | Saves a snapshot of your code locally (like a save point in a game) |
| **Push** | Uploads commits from your computer to GitHub |
| **Deploy** | Railway automatically builds and runs the new code when it sees a push |

## Project Structure

```
idle-chronicle/
├── apps/web/                 # Next.js app
│   ├── server.js             # Socket.io backend
│   ├── prisma/schema.prisma  # Database schema
│   └── src/
│       ├── components/
│       │   ├── game/         # PhaserGame.tsx
│       │   └── tabs/         # CharacterTab, TreasuryTab, ShopTab, LeaderboardTab
│       └── lib/              # socket.ts, i18n.ts
│
└── packages/shared/src/data/ # Shared data
    ├── items.ts              # All items (ITEMS)
    ├── sets.ts               # Set bonuses (SETS)
    └── lootTables.ts         # Chest drops (CHESTS)
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for AI assistant instructions and game balance.

See [project.md](./project.md) for detailed game mechanics documentation.
