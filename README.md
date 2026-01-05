# Idle Chronicle

Clicker game for Telegram Mini App (TMA).

## Tech Stack

- **Engine:** Phaser 3.80.1
- **Platform:** Telegram Mini App
- **Language:** Vanilla JavaScript (ES6)

## Features

- Click to earn gold
- Upgrades: Click Power, Auto Clicker, Multiplier
- Offline progress (up to 8 hours)
- Auto-save every 30 seconds
- Dark Fantasy UI style

## Project Structure

```
src/
├── core/
│   └── config.js      # Phaser config, constants
├── state/
│   ├── clickerState.js # Game state
│   └── saveSystem.js   # localStorage save/load
├── ui/
│   └── clickerUI.js    # Main UI scene
└── game.js             # Entry point
```

## Integration

Designed to integrate with [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg) as a mini-game.

## Development

Just open `index.html` in browser or deploy to Vercel.

## License

MIT
