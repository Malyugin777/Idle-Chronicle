// Localization system
export type Language = 'ru' | 'en';

export const translations = {
  en: {
    // Welcome popup
    welcome: {
      title: 'Welcome, Hero!',
      subtitle: "You've entered the most mysterious place in Telegram",
      bosses: '100 World Bosses',
      bossesDesc: 'Fight legendary monsters together with other players. Each boss is stronger!',
      rewards: 'Growing Rewards',
      rewardsDesc: 'Each boss drops more loot than the last. Level up to farm higher bosses!',
      autoBattle: 'Auto-Battle System',
      autoBattleDesc: "Upgrade your stats to deal more damage, even while you're away!",
      upgrade: 'Upgrade & Grow',
      upgradeDesc: 'Level up your stats and unlock powerful abilities!',
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
      stamina: '⚡ Stamina',
      exhausted: '⚡ EXHAUSTED',
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
    // Character tab
    character: {
      notAuth: 'Not authenticated',
      playInTelegram: 'Play in Telegram to save progress',
      level: 'Lv',
      exp: 'EXP',
      gold: 'Gold',
      // Combat Stats
      combatStats: 'Combat',
      pAtk: 'P.Atk',
      pDef: 'P.Def',
      mAtk: 'M.Atk',
      mDef: 'M.Def',
      critChance: 'Crit',
      atkSpd: 'Atk.Spd',
      // Base Stats
      baseStats: 'Stats',
      power: 'POW',
      vitality: 'VIT',
      agility: 'AGI',
      intellect: 'INT',
      spirit: 'SPI',
      // Skills
      skills: 'Skills',
      skillFireball: 'Fireball',
      skillFireballDesc: 'Fire damage to boss',
      skillIceball: 'Ice Ball',
      skillIceballDesc: 'Ice damage to boss',
      skillLightning: 'Lightning',
      skillLightningDesc: 'Electric damage to boss',
      // Inventory
      inventory: 'Inventory',
      equipment: 'Equipment',
      stats: 'Stats',
      // Equipment slots
      helmet: 'Helmet',
      armor: 'Armor',
      pants: 'Pants',
      gloves: 'Gloves',
      boots: 'Boots',
      weapon: 'Weapon',
      shield: 'Shield',
      earring: 'Earring',
      ring: 'Ring',
      necklace: 'Necklace',
      belt: 'Belt',
      empty: 'Empty',
      // Item actions
      equip: 'Equip',
      unequip: 'Unequip',
      replace: 'Replace',
      close: 'Close',
      // Rarity
      common: 'Common',
      uncommon: 'Uncommon',
      rare: 'Rare',
      epic: 'Epic',
      legendary: 'Legendary',
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
      previousBoss: 'Previous Boss',
      allTime: 'Legend',
      loading: 'Loading...',
      noDamage: 'No damage dealt yet',
      beFirst: 'Be the first to attack!',
      damage: 'damage',
      prizePool: 'Prize Pool',
      ton: 'TON',
      chests: 'Chests',
      exp: 'EXP',
      finalBlow: 'Final Blow',
      topDamage: 'Top Damage',
      participants: 'Participants',
      yourReward: 'Your Reward',
      noPrevious: 'No previous boss',
      waitForKill: 'Wait for boss to be killed',
      ofBoss: 'of boss',
    },
    // Shop
    shop: {
      gold: 'Gold',
      ether: 'Ether',
      etherDesc: 'Doubles damage per tap.',
      owned: 'Owned',
      buffs: 'Buffs',
      buffsDesc: 'Temporary boosts. Use wisely!',
      use: 'Use',
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
      title: 'Loot',
      subtitle: 'Chests & Items',
      gold: 'Gold',
      crystals: 'Crystals',
      // Chests
      chests: 'Chests',
      openChest: 'Open',
      opening: 'Opening...',
      claim: 'Claim',
      alreadyOpening: 'Already opening another chest',
      noChests: 'No chests',
      defeatBosses: 'Defeat bosses to get chests!',
      // Rarity
      common: 'Common',
      uncommon: 'Standard',
      rare: 'Rare',
      epic: 'Epic',
      legendary: 'Legendary',
      // Time
      minutes: 'm',
      hours: 'h',
      // Inventory
      inventory: 'Inventory',
      slots: 'Slots',
      locked: 'Locked',
      unlockFor: 'Unlock for',
      empty: 'Empty',
    },
  },
  ru: {
    // Welcome popup
    welcome: {
      title: 'Добро пожаловать, Герой!',
      subtitle: 'Ты попал в самое загадочное место в Телеграм',
      bosses: '100 Мировых Боссов',
      bossesDesc: 'Сражайся с легендарными монстрами вместе с другими игроками. Каждый босс сильнее!',
      rewards: 'Растущие Награды',
      rewardsDesc: 'С каждым боссом дроп растёт. Качайся чтобы фармить сильных боссов!',
      autoBattle: 'Система Авто-Боя',
      autoBattleDesc: 'Прокачивай статы чтобы наносить больше урона, даже когда ты не в игре!',
      upgrade: 'Прокачка и Рост',
      upgradeDesc: 'Качай свои характеристики и открывай мощные способности!',
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
      stamina: '⚡ Стамина',
      exhausted: '⚡ ИСТОЩЁН',
    },
    // Boss
    boss: {
      victory: 'ПОБЕДА!',
      defeated: 'пал!',
      nextBossIn: 'Следующий босс через',
      finalBlow: 'Добивание',
      topDamage: 'Топ Урон',
      bonus: 'бонус',
      topParticipants: 'Лучшие Участники',
      yourDamage: 'Твой урон',
    },
    // Character tab
    character: {
      notAuth: 'Не авторизован',
      playInTelegram: 'Играй в Телеграм чтобы сохранять прогресс',
      level: 'Ур',
      exp: 'ОПЫТ',
      gold: 'Золото',
      // Combat Stats
      combatStats: 'Боевые',
      pAtk: 'Ф.Атк',
      pDef: 'Ф.Деф',
      mAtk: 'М.Атк',
      mDef: 'М.Деф',
      critChance: 'Крит',
      atkSpd: 'Скор.Атк',
      // Base Stats
      baseStats: 'Статы',
      power: 'СИЛ',
      vitality: 'ВЫН',
      agility: 'ЛОВ',
      intellect: 'ИНТ',
      spirit: 'ДУХ',
      // Skills
      skills: 'Умения',
      skillFireball: 'Огненный шар',
      skillFireballDesc: 'Огненный урон боссу',
      skillIceball: 'Ледяной шар',
      skillIceballDesc: 'Ледяной урон боссу',
      skillLightning: 'Молния',
      skillLightningDesc: 'Электрический урон боссу',
      // Inventory
      inventory: 'Инвентарь',
      equipment: 'Экипировка',
      stats: 'Статы',
      // Equipment slots
      helmet: 'Шлем',
      armor: 'Броня',
      pants: 'Штаны',
      gloves: 'Перчатки',
      boots: 'Ботинки',
      weapon: 'Оружие',
      shield: 'Щит',
      earring: 'Серьга',
      ring: 'Кольцо',
      necklace: 'Ожерелье',
      belt: 'Пояс',
      empty: 'Пусто',
      // Item actions
      equip: 'Надеть',
      unequip: 'Снять',
      replace: 'Заменить',
      close: 'Закрыть',
      // Rarity
      common: 'Обычный',
      uncommon: 'Необычный',
      rare: 'Редкий',
      epic: 'Эпический',
      legendary: 'Легендарный',
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
      previousBoss: 'Предыдущий',
      allTime: 'Легенда',
      loading: 'Загрузка...',
      noDamage: 'Урон ещё не нанесён',
      beFirst: 'Будь первым в атаке!',
      damage: 'урон',
      prizePool: 'Призовой Пул',
      ton: 'TON',
      chests: 'Сундуки',
      exp: 'ОПЫТ',
      finalBlow: 'Добивание',
      topDamage: 'Топ Урон',
      participants: 'Участники',
      yourReward: 'Твоя Награда',
      noPrevious: 'Нет предыдущего босса',
      waitForKill: 'Дождись убийства босса',
      ofBoss: 'от босса',
    },
    // Shop
    shop: {
      gold: 'Золото',
      ether: 'Эфир',
      etherDesc: 'Удваивает урон за тап.',
      owned: 'Есть',
      buffs: 'Баффы',
      buffsDesc: 'Временные усиления. Используй с умом!',
      use: 'Юзать',
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
      title: 'Добыча',
      subtitle: 'Сундуки и предметы',
      gold: 'Золото',
      crystals: 'Кристаллы',
      // Chests
      chests: 'Сундуки',
      openChest: 'Открыть',
      opening: 'Открывается...',
      claim: 'Забрать',
      alreadyOpening: 'Уже открывается другой сундук',
      noChests: 'Нет сундуков',
      defeatBosses: 'Побеждай боссов чтобы получить сундуки!',
      // Rarity
      common: 'Обычный',
      uncommon: 'Стандарт',
      rare: 'Редкий',
      epic: 'Эпический',
      legendary: 'Легендарный',
      // Time
      minutes: 'м',
      hours: 'ч',
      // Inventory
      inventory: 'Инвентарь',
      slots: 'Слоты',
      locked: 'Закрыт',
      unlockFor: 'Открыть за',
      empty: 'Пусто',
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
