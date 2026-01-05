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
      online: 'online',
      connecting: 'Connecting...',
      offline: 'Offline',
      sessionDamage: 'Session Damage',
      status: 'Status',
      mana: 'MANA',
      auto: 'Auto',
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
      online: 'онлайн',
      connecting: 'Подключение...',
      offline: 'Оффлайн',
      sessionDamage: 'Урон за сессию',
      status: 'Статус',
      mana: 'МАНА',
      auto: 'Авто',
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
  },
} as const;

export type Translations = typeof translations.en;

// Get user's language from Telegram
export function detectLanguage(): Language {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    const lang = window.Telegram.WebApp.initDataUnsafe?.user?.language_code;
    if (lang?.startsWith('ru')) return 'ru';
  }
  return 'en';
}

// Get translation function
export function useTranslation(lang: Language) {
  return translations[lang];
}
