// Localization system
export type Language = 'ru' | 'en';

export const translations = {
  en: {
    // Welcome popup
    welcome: {
      title: 'Welcome, Hero!',
      subtitle: "You've entered the most mysterious place in Telegram",
      bosses: '10 Epic World Bosses',
      bossesDesc: 'Fight legendary monsters together with other players in real-time!',
      rewards: 'Increasing Rewards',
      rewardsDesc: 'Each boss drops more loot than the last. Final blow and top damage get bonuses!',
      autoBattle: 'Auto-Battle System',
      autoBattleDesc: "Upgrade your auto-attack to deal damage even while you're away!",
      upgrade: 'Upgrade & Grow',
      upgradeDesc: 'Level up STR, DEX, LUCK and unlock powerful abilities!',
      startButton: 'Start Adventure!',
    },
    // Game UI
    game: {
      loading: 'Loading...',
      initializing: 'Initializing...',
      online: 'online',
      onlineStatus: 'Online',
      connecting: 'Connecting...',
      offline: 'Offline',
      sessionDamage: 'Session Damage',
      status: 'Status',
      mana: 'MANA',
      auto: 'Auto',
      rage: 'RAGE',
    },
    // Boss
    boss: {
      victory: 'VICTORY!',
      defeated: 'defeated',
      nextBossIn: 'Next boss in',
      finalBlow: 'Final Blow',
      topDamage: 'Top Damage',
      bonus: 'bonus',
      topParticipants: 'Top Participants',
      yourDamage: 'Your damage',
    },
    // Offline earnings
    offline: {
      welcomeBack: 'Welcome Back!',
      awayFor: 'You were away for',
      hours: 'hours',
      earnings: 'Offline Earnings',
      collect: 'Collect',
    },
    // Character tab
    character: {
      notAuth: 'Not authenticated',
      playInTelegram: 'Play in Telegram to save progress',
      level: 'Level',
      adena: 'Adena',
      combatStats: 'Combat Stats',
      pAtk: 'P.Atk',
      critChance: 'Crit Chance',
      totalDamage: 'Total Damage',
      bossesKilled: 'Bosses Killed',
      baseStats: 'Base Stats',
      combatSkills: 'Combat Skills',
      // Stats
      str: 'STR',
      strEffect: '+8% damage',
      dex: 'DEX',
      dexEffect: '+5% speed',
      luck: 'LUCK',
      luckEffect: '+3% crit',
      // Skills
      tapSpeed: 'Tap Speed',
      tapSpeedDesc: 'Taps per second limit',
      autoAttack: 'Auto-Attack',
      autoAttackDesc: 'Passive damage per second',
      manaRegen: 'Mana Regen',
      manaRegenDesc: 'Mana recovery per second',
      max: 'MAX',
    },
    // Navigation
    nav: {
      battle: 'Battle',
      hero: 'Hero',
      shop: 'Shop',
      loot: 'Loot',
      top: 'Top',
    },
    // Leaderboard
    leaderboard: {
      title: 'Leaderboard',
      subtitle: 'Top damage dealers',
      currentBoss: 'Current Boss',
      allTime: 'All Time',
      loading: 'Loading...',
      noDamage: 'No damage dealt yet',
      beFirst: 'Be the first to attack!',
      damage: 'damage',
    },
    // Shop
    shop: {
      adena: 'Adena',
      soulshots: 'Soulshots',
      soulshotsDesc: 'Increase damage per tap. Toggle to activate.',
      owned: 'Owned',
      buffs: 'Buffs',
      buffsDesc: 'Temporary boosts. Use wisely!',
      use: 'Use',
      // Soulshots
      ssNG: 'No-Grade SS',
      ssD: 'D-Grade SS',
      ssC: 'C-Grade SS',
      ssB: 'B-Grade SS',
      ssA: 'A-Grade SS',
      ssS: 'S-Grade SS',
      // Buffs
      haste: 'Haste',
      hasteEffect: '+30% speed',
      acumen: 'Acumen',
      acumenEffect: '+50% damage',
      luck: 'Luck',
      luckEffect: '+10% crit',
    },
    // Treasury
    treasury: {
      title: 'Treasury',
      subtitle: 'Your collected loot',
      adena: 'Adena',
      ancientCoins: 'Ancient Coins',
      inventory: 'Inventory',
      loading: 'Loading...',
      noItems: 'No items yet',
      defeatBosses: 'Defeat bosses to collect loot!',
    },
  },
  ru: {
    // Welcome popup
    welcome: {
      title: 'Добро пожаловать, Герой!',
      subtitle: 'Ты попал в самое загадочное место в Телеграм',
      bosses: '10 Эпических Боссов',
      bossesDesc: 'Сражайся с легендарными монстрами вместе с другими игроками в реальном времени!',
      rewards: 'Растущие Награды',
      rewardsDesc: 'Каждый босс даёт больше добычи. Бонусы за последний удар и топ урон!',
      autoBattle: 'Система Авто-Боя',
      autoBattleDesc: 'Прокачай авто-атаку и наноси урон даже когда ты не в игре!',
      upgrade: 'Прокачка и Рост',
      upgradeDesc: 'Качай СИЛ, ЛОВ, УДАЧУ и открывай мощные способности!',
      startButton: 'Начать Приключение!',
    },
    // Game UI
    game: {
      loading: 'Загрузка...',
      initializing: 'Инициализация...',
      online: 'онлайн',
      onlineStatus: 'В сети',
      connecting: 'Подключение...',
      offline: 'Оффлайн',
      sessionDamage: 'Урон за сессию',
      status: 'Статус',
      mana: 'МАНА',
      auto: 'Авто',
      rage: 'ЯРОСТЬ',
    },
    // Boss
    boss: {
      victory: 'ПОБЕДА!',
      defeated: 'повержен',
      nextBossIn: 'Следующий босс через',
      finalBlow: 'Добивание',
      topDamage: 'Топ Урон',
      bonus: 'бонус',
      topParticipants: 'Лучшие Участники',
      yourDamage: 'Твой урон',
    },
    // Offline earnings
    offline: {
      welcomeBack: 'С возвращением!',
      awayFor: 'Тебя не было',
      hours: 'часов',
      earnings: 'Оффлайн Награда',
      collect: 'Забрать',
    },
    // Character tab
    character: {
      notAuth: 'Не авторизован',
      playInTelegram: 'Играй в Телеграм чтобы сохранять прогресс',
      level: 'Уровень',
      adena: 'Адена',
      combatStats: 'Боевые Статы',
      pAtk: 'Ф.Атк',
      critChance: 'Шанс Крита',
      totalDamage: 'Всего Урона',
      bossesKilled: 'Боссов Убито',
      baseStats: 'Базовые Статы',
      combatSkills: 'Боевые Навыки',
      // Stats
      str: 'СИЛ',
      strEffect: '+8% урона',
      dex: 'ЛОВ',
      dexEffect: '+5% скорости',
      luck: 'УДАЧА',
      luckEffect: '+3% крита',
      // Skills
      tapSpeed: 'Скорость Тапа',
      tapSpeedDesc: 'Лимит тапов в секунду',
      autoAttack: 'Авто-Атака',
      autoAttackDesc: 'Пассивный урон в секунду',
      manaRegen: 'Реген Маны',
      manaRegenDesc: 'Восстановление маны в секунду',
      max: 'МАКС',
    },
    // Navigation
    nav: {
      battle: 'Бой',
      hero: 'Герой',
      shop: 'Магазин',
      loot: 'Добыча',
      top: 'Топ',
    },
    // Leaderboard
    leaderboard: {
      title: 'Таблица Лидеров',
      subtitle: 'Топ по урону',
      currentBoss: 'Текущий Босс',
      allTime: 'За Всё Время',
      loading: 'Загрузка...',
      noDamage: 'Урон ещё не нанесён',
      beFirst: 'Будь первым в атаке!',
      damage: 'урон',
    },
    // Shop
    shop: {
      adena: 'Адена',
      soulshots: 'Заряды Души',
      soulshotsDesc: 'Увеличивают урон за тап. Нажми чтобы активировать.',
      owned: 'Есть',
      buffs: 'Баффы',
      buffsDesc: 'Временные усиления. Используй с умом!',
      use: 'Юзать',
      // Soulshots
      ssNG: 'NG Заряд',
      ssD: 'D Заряд',
      ssC: 'C Заряд',
      ssB: 'B Заряд',
      ssA: 'A Заряд',
      ssS: 'S Заряд',
      // Buffs
      haste: 'Хаст',
      hasteEffect: '+30% скорости',
      acumen: 'Акумен',
      acumenEffect: '+50% урона',
      luck: 'Удача',
      luckEffect: '+10% крита',
    },
    // Treasury
    treasury: {
      title: 'Сокровищница',
      subtitle: 'Твоя добыча',
      adena: 'Адена',
      ancientCoins: 'Древние Монеты',
      inventory: 'Инвентарь',
      loading: 'Загрузка...',
      noItems: 'Пока пусто',
      defeatBosses: 'Побеждай боссов чтобы собирать лут!',
    },
  },
} as const;

export type Translations = typeof translations.en;

// Get user's language from Telegram
export function detectLanguage(): Language {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    const lang = (user as { language_code?: string } | undefined)?.language_code;
    if (lang?.startsWith('ru')) return 'ru';
  }
  return 'en';
}

// Get translation function
export function useTranslation(lang: Language) {
  return translations[lang];
}
