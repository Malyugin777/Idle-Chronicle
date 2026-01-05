# World Boss Clicker

Multiplayer World Boss Clicker for Telegram Mini App.

| | |
|---|---|
| **GitHub** | https://github.com/Malyugin777/Idle-Chronicle |
| **Render** | https://world-boss-web.onrender.com |
| **Main Game** | [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg) |

## Quick Start

```bash
npm install -g pnpm
pnpm install
docker-compose up -d
pnpm dev
```

## Deploy to Render

1. **New** → **Web Service**
2. Connect `Malyugin777/Idle-Chronicle`
3. Settings:
   - **Root Directory:** `apps/web`
   - **Build:** `npm i -g pnpm && pnpm i && pnpm build`
   - **Start:** `pnpm start`

## Documentation

See [project.md](./project.md) for full documentation.

## License

MIT
