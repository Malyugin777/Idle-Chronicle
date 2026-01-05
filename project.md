# Idle Chronicle

## Обзор проекта

**Жанр:** Idle Clicker
**Платформа:** Telegram Mini App (TMA)
**Движок:** Phaser 3.80.1
**Язык:** Vanilla JavaScript (ES6, strict mode)
**Версия:** 1.0.0
**GitHub:** https://github.com/Malyugin777/Idle-Chronicle
**Vercel:** https://idle-chronicle.vercel.app
**Интеграция:** [Pocket Chronicles](https://github.com/Malyugin777/l2-phaser-rpg)

---

## Архитектура проекта

### Структура файлов

```
src/
├── core/
│   └── config.js          # Phaser config, constants, colors
├── state/
│   ├── clickerState.js    # Game state, upgrades, click logic
│   └── saveSystem.js      # localStorage save/load, offline progress
├── ui/
│   └── clickerUI.js       # Main ClickerScene (Phaser Scene)
├── game.js                # Entry point
assets/
├── images/                # Sprites, icons
└── audio/                 # Sound effects
index.html                 # Entry point
```

---

## Игровые механики

### Ресурсы
- **Gold** - основная валюта, зарабатывается кликами и пассивно

### Апгрейды

| Апгрейд | Эффект | Базовая цена | Множитель |
|---------|--------|--------------|-----------|
| Click Power | +1 gold за клик | 10 | x1.5 |
| Auto Clicker | +1 gold/sec | 50 | x1.8 |
| Multiplier | x2 ко всему золоту | 500 | x3.0 |

### Формулы

```javascript
// Стоимость апгрейда
cost = baseCost * (costMultiplier ^ level)

// Сила клика
clickPower = (1 + clickPowerLevel) * (1 + multiplierLevel)

// Золото в секунду
goldPerSecond = autoClickerLevel * (1 + multiplierLevel)
```

---

## Сохранение

- **Ключ:** `idleChroniclesSave`
- **Автосейв:** каждые 30 секунд
- **Оффлайн прогресс:** до 8 часов

```javascript
saveData = {
  version: 1,
  timestamp: Date.now(),
  state: { gold, crystals, clickCount, upgrades, ... }
}
```

---

## TMA Platform

| Параметр | Значение |
|----------|----------|
| BASE_W | 780 |
| BASE_H | 1688 |
| Scale Mode | ENVELOP |

---

## Визуальный стиль

- **Тема:** Dark Fantasy (как Pocket Chronicles)
- **Шрифт:** Press Start 2P (пиксельный)
- **Цвета:**
  - Фон: `0x0e141b` → `0x2a313b` (градиент)
  - Золото: `#D6B36A`
  - Текст: белый с чёрной обводкой

---

## История версий

| Версия | Дата | Изменения |
|--------|------|-----------|
| **1.0.0** | **05.01.2026** | Initial release |
| | | - Базовый кликер |
| | | - 3 типа апгрейдов |
| | | - Автосейв + оффлайн |
| | | - Dark Fantasy UI |

---

## TODO

- [ ] Добавить звуки кликов
- [ ] Больше типов апгрейдов
- [ ] Престиж система (rebirth)
- [ ] Интеграция с Pocket Chronicles (sync wallet)
- [ ] Достижения
- [ ] Ежедневные награды
