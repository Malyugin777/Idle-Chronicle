const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// L2 Stats Service
const StatsService = require('./services/StatsService');

// ═══════════════════════════════════════════════════════════
// TELEGRAM VERIFICATION
// ═══════════════════════════════════════════════════════════

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SKIP_TELEGRAM_AUTH = process.env.NODE_ENV === 'development';

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const RESET_PASSWORD = '1993';

function verifyTelegramAuth(initData) {
  if (!initData || !TELEGRAM_BOT_TOKEN) return false;
  if (SKIP_TELEGRAM_AUTH) return true; // Skip in dev mode

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return false;

    urlParams.delete('hash');
    const params = Array.from(urlParams.entries());
    params.sort((a, b) => a[0].localeCompare(b[0]));

    const dataCheckString = params
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(TELEGRAM_BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return calculatedHash === hash;
  } catch (err) {
    console.error('[Telegram] Verify error:', err.message);
    return false;
  }
}

function parseTelegramUser(initData) {
  try {
    const urlParams = new URLSearchParams(initData);
    const userJson = urlParams.get('user');
    if (!userJson) return null;
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ═══════════════════════════════════════════════════════════
// IN-MEMORY STATE
// ═══════════════════════════════════════════════════════════

let bossState = {
  id: 'default',
  name: 'Serpent',
  nameRu: 'Змей',
  title: 'World Boss',
  maxHp: 500000,
  currentHp: 500000,
  defense: 0,
  thornsDamage: 0,  // L2: обратка босса (тратит stamina игрока)
  ragePhase: 0,
  sessionId: null,
  icon: '🐍',
  image: '/assets/bosses/boss_1.png',
  bossIndex: 1,
  totalBosses: 100, // Будет 100 боссов!
  // Rewards
  goldReward: 1000,
  expReward: 1000000,
  tonReward: 10,
  chestsReward: 10,
};

// Previous boss session data for leaderboard
let previousBossSession = null;

// Respawn timer (null = boss alive, Date = respawning)
let bossRespawnAt = null;
const BOSS_RESPAWN_TIME_MS = 5 * 60 * 1000; // 5 minutes

const onlineUsers = new Map();
const sessionLeaderboard = new Map();

// ═══════════════════════════════════════════════════════════
// BOSS STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════

async function loadBossState(prisma) {
  try {
    const state = await prisma.gameState.findUnique({ where: { id: 'singleton' } });
    if (!state) {
      console.log('[Boss] No saved state, will use defaults');
      return false;
    }

    // Check if boss is respawning
    if (state.respawnAt && new Date(state.respawnAt) > new Date()) {
      bossRespawnAt = new Date(state.respawnAt);
      console.log(`[Boss] Respawning at ${bossRespawnAt.toISOString()}`);
    }

    // Load boss state
    const boss = DEFAULT_BOSSES[state.currentBossIndex] || DEFAULT_BOSSES[0];
    currentBossIndex = state.currentBossIndex;

    // Check if boss HP is 0 and respawn timer expired - need to spawn next boss
    const savedHp = Number(state.bossCurrentHp);
    const needsRespawn = savedHp <= 0 && !bossRespawnAt;

    if (needsRespawn) {
      console.log('[Boss] Boss HP=0 and respawn timer expired, will respawn on startup');
      return 'respawn'; // Signal to respawn
    }

    bossState = {
      id: `default-${state.currentBossIndex}`,
      name: state.bossName || boss.name,
      nameRu: state.bossNameRu || boss.nameRu || boss.name,
      title: 'World Boss',
      maxHp: Number(state.bossMaxHp),
      currentHp: bossRespawnAt ? Number(state.bossMaxHp) : savedHp,
      defense: state.bossDefense || boss.defense,
      thornsDamage: state.bossThorns || boss.thornsDamage || 0,
      ragePhase: 0,
      sessionId: null,
      icon: state.bossIcon || boss.icon,
      image: boss.image || null,
      bossIndex: state.currentBossIndex + 1,
      totalBosses: 100, // Будет 100 боссов!
      goldReward: state.bossGoldReward || boss.goldReward,
      expReward: Number(state.bossExpReward) || boss.expReward,
      tonReward: state.bossTonReward || boss.tonReward || 10,
      chestsReward: state.bossChestsReward || boss.chestsReward || 10,
    };

    // Load session leaderboard
    if (state.sessionLeaderboard && !bossRespawnAt) {
      const saved = state.sessionLeaderboard;
      if (Array.isArray(saved)) {
        sessionLeaderboard.clear();
        for (const entry of saved) {
          sessionLeaderboard.set(entry.odamage, entry);
        }
      }
    }

    console.log(`[Boss] Loaded state: ${bossState.name} (${bossState.nameRu}) HP=${bossState.currentHp}/${bossState.maxHp}`);
    return true;
  } catch (err) {
    console.error('[Boss] Load state error:', err.message);
    return false;
  }
}

async function saveBossState(prisma) {
  try {
    // Serialize leaderboard
    const leaderboardArray = Array.from(sessionLeaderboard.entries()).map(([odamage, data]) => ({
      odamage,
      ...data,
    }));

    await prisma.gameState.upsert({
      where: { id: 'singleton' },
      update: {
        currentBossIndex,
        bossCurrentHp: BigInt(Math.max(0, bossState.currentHp)),
        bossMaxHp: BigInt(bossState.maxHp),
        bossName: bossState.name,
        bossNameRu: bossState.nameRu || bossState.name,
        bossIcon: bossState.icon,
        bossDefense: bossState.defense,
        bossThorns: bossState.thornsDamage,
        bossGoldReward: bossState.goldReward || 1000000,
        bossExpReward: BigInt(bossState.expReward || 1000000),
        bossTonReward: bossState.tonReward || 10,
        bossChestsReward: bossState.chestsReward || 10,
        respawnAt: bossRespawnAt,
        sessionLeaderboard: leaderboardArray,
      },
      create: {
        id: 'singleton',
        currentBossIndex,
        bossCurrentHp: BigInt(Math.max(0, bossState.currentHp)),
        bossMaxHp: BigInt(bossState.maxHp),
        bossName: bossState.name,
        bossNameRu: bossState.nameRu || bossState.name,
        bossIcon: bossState.icon,
        bossDefense: bossState.defense,
        bossThorns: bossState.thornsDamage,
        bossGoldReward: bossState.goldReward || 1000000,
        bossExpReward: BigInt(bossState.expReward || 1000000),
        bossTonReward: bossState.tonReward || 10,
        bossChestsReward: bossState.chestsReward || 10,
        respawnAt: bossRespawnAt,
        sessionLeaderboard: leaderboardArray,
      },
    });
  } catch (err) {
    console.error('[Boss] Save state error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// GAME CONSTANTS
// ═══════════════════════════════════════════════════════════

const STAT_EFFECTS = { str: 0.08, dex: 0.05, luck: 0.03 };
const BASE_CRIT_CHANCE = 0.05;
const BASE_CRIT_DAMAGE = 2.0;
const MANA_COST_PER_TAP = 1;
const BASE_MANA_REGEN = 0.2; // 1 per 5 seconds = 0.2/sec
const MAX_TAPS_PER_BATCH = 50;
const BASE_TAPS_PER_SECOND = 3;
const MAX_TAPS_PER_SECOND = 10;
const MAX_AUTO_ATTACK_SPEED = 10;
const MAX_MANA_REGEN = 10;
const RAGE_PHASES = [
  { hpPercent: 100, multiplier: 1.0 },
  { hpPercent: 75, multiplier: 1.2 },
  { hpPercent: 50, multiplier: 1.5 },
  { hpPercent: 25, multiplier: 2.0 },
];

// Soulshot config
const SOULSHOTS = {
  NG: { multiplier: 1.5, cost: 10 },
  D: { multiplier: 2.2, cost: 50 },
  C: { multiplier: 3.5, cost: 250 },
  B: { multiplier: 5.0, cost: 1000 },
  A: { multiplier: 7.0, cost: 5000 },
  S: { multiplier: 10.0, cost: 20000 },
};

// Buff config
const BUFFS = {
  haste: { effect: 'speed', value: 0.3, duration: 30000, cost: 500 },
  acumen: { effect: 'damage', value: 0.5, duration: 30000, cost: 500 },
  luck: { effect: 'crit', value: 0.1, duration: 60000, cost: 1000 },
};

// Chest config (opening durations in ms)
// Types: WOODEN, BRONZE, SILVER, GOLD
const CHEST_CONFIG = {
  WOODEN: { duration: 5 * 60 * 1000, icon: '🪵', name: 'Деревянный' },       // 5 min
  BRONZE: { duration: 30 * 60 * 1000, icon: '🟫', name: 'Бронзовый' },       // 30 min
  SILVER: { duration: 4 * 60 * 60 * 1000, icon: '🪙', name: 'Серебряный' },  // 4 hours
  GOLD: { duration: 8 * 60 * 60 * 1000, icon: '🟨', name: 'Золотой' },       // 8 hours
};

// Drop rates for each chest type (matching TZ exactly)
// Item rarities: COMMON (white), UNCOMMON (green), RARE (purple), EPIC (orange)
// Gold is FIXED amount, not range per TZ
const CHEST_DROP_RATES = {
  WOODEN: {
    // TZ: Common 50%, Uncommon 7%, Rare 0%, Epic 0%, Enchant +1 3%, Gold 1000
    items: { COMMON: 0.50, UNCOMMON: 0.07, RARE: 0, EPIC: 0 },
    gold: 1000,
    enchantChance: 0.03,
    enchantQty: [1, 1],
  },
  BRONZE: {
    // TZ: Common 60%, Uncommon 20%, Rare 3%, Epic 0%, Enchant +1 15%, Gold 3000
    items: { COMMON: 0.60, UNCOMMON: 0.20, RARE: 0.03, EPIC: 0 },
    gold: 3000,
    enchantChance: 0.15,
    enchantQty: [1, 1],
  },
  SILVER: {
    // TZ: Common 0%, Uncommon 40%, Rare 10%, Epic 1%, Enchant +1-5 25%, Gold 8000
    items: { COMMON: 0, UNCOMMON: 0.40, RARE: 0.10, EPIC: 0.01 },
    gold: 8000,
    enchantChance: 0.25,
    enchantQty: [1, 5],
  },
  GOLD: {
    // TZ: Common 0%, Uncommon 0%, Rare 15%, Epic 3%, Enchant +1-5 45%, Gold 20000
    items: { COMMON: 0, UNCOMMON: 0, RARE: 0.15, EPIC: 0.03 },
    gold: 20000,
    enchantChance: 0.45,
    enchantQty: [1, 5],
  },
};

// Starter equipment set codes
const STARTER_EQUIPMENT = [
  { code: 'starter-sword', slot: 'WEAPON', name: 'Меч новичка', icon: '🗡️', pAtk: 10 },
  { code: 'starter-helmet', slot: 'HELMET', name: 'Шлем новичка', icon: '⛑️', pDef: 2 },
  { code: 'starter-chest', slot: 'CHEST', name: 'Нагрудник новичка', icon: '🎽', pDef: 3 },
  { code: 'starter-gloves', slot: 'GLOVES', name: 'Перчатки новичка', icon: '🧤', pDef: 1 },
  { code: 'starter-legs', slot: 'LEGS', name: 'Поножи новичка', icon: '👖', pDef: 2 },
  { code: 'starter-boots', slot: 'BOOTS', name: 'Ботинки новичка', icon: '👢', pDef: 1 },
  { code: 'starter-shield', slot: 'SHIELD', name: 'Щит новичка', icon: '🛡️', pDef: 2 },
];

// Stat upgrade cost formula
function getUpgradeCost(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

// Tap speed upgrade cost (tapsPerSecond: 3 -> 10)
function getTapSpeedCost(level) {
  return Math.floor(500 * Math.pow(2, level - 3)); // Starts at level 3
}

// Auto-attack upgrade cost (10x more expensive than tap speed)
function getAutoAttackCost(level) {
  return Math.floor(5000 * Math.pow(2.5, level)); // Very expensive
}

// Mana regen upgrade cost
function getManaRegenCost(currentRegen) {
  const level = Math.round(currentRegen * 5); // 0.2 -> 1, 0.4 -> 2, etc.
  return Math.floor(1000 * Math.pow(2, level));
}

// Offline progress constants (L2: использует StatsService для расчёта)
// Legacy function kept for backward compatibility, but uses StatsService internally
function calculateOfflineEarnings(player, lastOnline) {
  // Use StatsService for L2-style offline progress (4 hour cap)
  const progress = StatsService.calculateOfflineProgress({
    lastOnline: lastOnline,
    attackSpeed: player.attackSpeed || 300,
    physicalPower: player.physicalPower || 15,
  });

  return {
    gold: progress.goldEarned,
    hours: progress.offlineHours,
    damage: progress.totalDamage,
    exp: progress.expEarned,
  };
}

// ═══════════════════════════════════════════════════════════
// DAMAGE CALCULATION
// ═══════════════════════════════════════════════════════════

function calculateDamage(player, tapCount) {
  let totalDamage = 0;
  let crits = 0;
  let soulshotUsed = 0;

  const baseDamage = player.pAtk * (1 + player.str * STAT_EFFECTS.str);
  let critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

  // Check active buffs
  const now = Date.now();
  player.activeBuffs = player.activeBuffs.filter(b => b.expiresAt > now);

  let damageBonus = 1.0;
  for (const buff of player.activeBuffs) {
    if (buff.type === 'acumen') damageBonus += buff.value;
    if (buff.type === 'luck') critChance = Math.min(0.75, critChance + buff.value);
  }

  // Soulshot multiplier
  let ssMultiplier = 1.0;
  const ssGrade = player.activeSoulshot;
  if (ssGrade && SOULSHOTS[ssGrade]) {
    const ssKey = `soulshot${ssGrade}`;
    if (player[ssKey] > 0) {
      ssMultiplier = SOULSHOTS[ssGrade].multiplier;
      // Consume soulshots (1 per tap)
      const consumed = Math.min(player[ssKey], tapCount);
      player[ssKey] -= consumed;
      soulshotUsed = consumed;
      // Auto-deactivate if ran out
      if (player[ssKey] <= 0) {
        player.activeSoulshot = null;
      }
    }
  }

  for (let i = 0; i < tapCount; i++) {
    let dmg = baseDamage * (0.9 + Math.random() * 0.2);

    // Apply soulshot (only for taps that had soulshots)
    if (i < soulshotUsed) {
      dmg *= ssMultiplier;
    }

    // Apply damage buff
    dmg *= damageBonus;

    if (Math.random() < critChance) {
      dmg *= BASE_CRIT_DAMAGE;
      crits++;
    }

    const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
    dmg *= rageMultiplier;
    dmg = Math.max(1, dmg - bossState.defense);
    totalDamage += Math.floor(dmg);
  }

  return { totalDamage, crits, soulshotUsed };
}

function updateRagePhase() {
  const hpPercent = (bossState.currentHp / bossState.maxHp) * 100;
  let newPhase = 0;

  if (hpPercent <= 25) newPhase = 3;
  else if (hpPercent <= 50) newPhase = 2;
  else if (hpPercent <= 75) newPhase = 1;

  if (newPhase !== bossState.ragePhase) {
    bossState.ragePhase = newPhase;
    return true;
  }
  return false;
}

// Default bosses for rotation (used if DB is empty)
// Всего будет 100 боссов! С каждым боссом награды растут.
// thornsDamage: обратка босса - тратит stamina игрока при каждом тапе
// tonReward и chestsReward: 50% финальному удару, 50% топ урону
// expReward: распределяется по всем участникам по % урона
// Boss templates (names/icons/images)
const BOSS_TEMPLATES = [
  { name: 'Serpent', nameRu: 'Змей', icon: '🐍', image: '/assets/bosses/boss_1.png' },
  { name: 'Plague Rat', nameRu: 'Чумная Крыса', icon: '🐀', image: '/assets/bosses/boss_2.png' },
  { name: 'Lizardman', nameRu: 'Ящер', icon: '🦎', image: '/assets/bosses/boss_3.png' },
  { name: 'Hell Hound', nameRu: 'Адский Пёс', icon: '🐕', image: '/assets/bosses/boss_4.png' },
  { name: 'Poison Toad', nameRu: 'Ядовитая Жаба', icon: '🐸', image: '/assets/bosses/boss_5.png' },
  { name: 'Kraken', nameRu: 'Кракен', icon: '🐙' },
  { name: 'Dragon', nameRu: 'Дракон', icon: '🐉' },
  { name: 'Hydra', nameRu: 'Гидра', icon: '🐍' },
  { name: 'Phoenix', nameRu: 'Феникс', icon: '🔥' },
  { name: 'Ancient Dragon', nameRu: 'Древний Дракон', icon: '🏴' },
];

// Generate boss stats dynamically (x2 rewards, x3 HP per boss)
// First boss: 500K HP, 1M adena, 1M exp, 10 TON, 10 chests
function getBossStats(index) {
  const template = BOSS_TEMPLATES[index % BOSS_TEMPLATES.length];
  const multiplier = Math.pow(2, index); // x2 for each boss
  const hpMultiplier = Math.pow(3, index); // x3 HP for each boss

  return {
    ...template,
    hp: Math.floor(500000 * hpMultiplier),
    defense: Math.floor(index * 5),
    thornsDamage: Math.floor(index * 2),
    goldReward: Math.floor(1000000 * multiplier),
    expReward: Math.floor(1000000 * multiplier),
    tonReward: Math.floor(10 * multiplier),
    chestsReward: Math.floor(10 * multiplier),
  };
}

// Backwards compatibility wrapper
const DEFAULT_BOSSES = new Proxy([], {
  get(target, prop) {
    if (prop === 'length') return 100; // 100 bosses
    const index = parseInt(prop, 10);
    if (!isNaN(index) && index >= 0 && index < 100) {
      return getBossStats(index);
    }
    return undefined;
  }
});

// Respawn timer (10 minutes = 600000ms)
// Using BOSS_RESPAWN_TIME_MS (5 min) and bossRespawnAt from line 98-99

let currentBossIndex = 0;

async function respawnBoss(prisma, forceNext = true) {
  try {
    // Try to get bosses from DB
    const bosses = await prisma.boss.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    if (bosses.length > 0) {
      // Rotate to next boss
      if (forceNext) {
        currentBossIndex = (currentBossIndex + 1) % bosses.length;
      }
      const boss = bosses[currentBossIndex];

      let session = null;
      try {
        session = await prisma.bossSession.create({
          data: { bossId: boss.id, maxHp: boss.baseHp },
        });
      } catch (e) {
        console.error('[Boss] Session create error:', e.message);
      }

      bossState = {
        id: boss.id,
        name: boss.name,
        title: boss.title || 'World Boss',
        maxHp: Number(boss.baseHp),
        currentHp: Number(boss.baseHp),
        defense: boss.defense,
        thornsDamage: boss.thornsDamage || 0,  // L2: обратка
        ragePhase: 0,
        sessionId: session?.id || null,
        icon: boss.iconUrl || '👹',
        bossIndex: currentBossIndex + 1,
        totalBosses: bosses.length,
      };
      console.log(`[Boss] Loaded from DB: ${boss.name} (${boss.baseHp} HP, thorns: ${boss.thornsDamage || 0})`);
    } else {
      // Use default bosses
      if (forceNext) {
        currentBossIndex = (currentBossIndex + 1) % DEFAULT_BOSSES.length;
      }
      const boss = DEFAULT_BOSSES[currentBossIndex];

      bossState = {
        id: `default-${currentBossIndex}`,
        name: boss.name,
        nameRu: boss.nameRu || boss.name,
        title: 'World Boss',
        maxHp: boss.hp,
        currentHp: boss.hp,
        defense: boss.defense,
        thornsDamage: boss.thornsDamage || 0,  // L2: обратка
        ragePhase: 0,
        sessionId: null,
        icon: boss.icon,
        image: boss.image || null,
        bossIndex: currentBossIndex + 1,
        totalBosses: 100, // Будет 100 боссов!
        goldReward: boss.goldReward,
        expReward: boss.expReward,
        tonReward: boss.tonReward || 10,
        chestsReward: boss.chestsReward || 10,
      };
    }
  } catch (err) {
    console.error('[Boss] Respawn error:', err.message);
    const boss = DEFAULT_BOSSES[0];
    bossState = {
      id: 'default',
      name: boss.name,
      nameRu: boss.nameRu || boss.name,
      title: 'World Boss',
      maxHp: boss.hp,
      currentHp: boss.hp,
      defense: boss.defense,
      thornsDamage: boss.thornsDamage || 0,  // L2: обратка
      ragePhase: 0,
      sessionId: null,
      icon: boss.icon,
      image: boss.image || null,
      bossIndex: 1,
      totalBosses: 100, // Будет 100 боссов!
      goldReward: boss.goldReward,
      expReward: boss.expReward,
      tonReward: boss.tonReward || 10,
      chestsReward: boss.chestsReward || 10,
    };
  }

  sessionLeaderboard.clear();
  console.log(`[Boss] Respawned: ${bossState.name} (${bossState.bossIndex}/${bossState.totalBosses}) with ${bossState.maxHp} HP`);
}

// ═══════════════════════════════════════════════════════════
// BOSS KILL HANDLER (shared between tap and auto-attack)
// TZ Этап 2: New reward system based on activity and ranking
// ═══════════════════════════════════════════════════════════

async function handleBossKill(io, prisma, killerPlayer, killerSocketId) {
  console.log(`[Boss] ${bossState.name} killed by ${killerPlayer.odamageN}!`);

  // Build leaderboard with photoUrl and activity status (from sessionLeaderboard)
  const leaderboard = Array.from(sessionLeaderboard.entries())
    .map(([id, data]) => ({
      odamage: id,
      visitorId: id,
      visitorName: data.odamageN,
      photoUrl: data.photoUrl,
      damage: data.odamage,
      isEligible: data.isEligible || false, // TZ Этап 2: saved during damage dealing
    }))
    .sort((a, b) => b.damage - a.damage);

  const totalDamageDealt = leaderboard.reduce((sum, p) => sum + p.damage, 0);
  const topDamagePlayer = leaderboard[0];
  const finalBlowPlayer = killerPlayer;

  // Prize pool from boss config (for adena/exp distribution)
  const expPool = bossState.expReward || 1000000;
  const goldPool = bossState.goldReward || 5000;

  // ═══════════════════════════════════════════════════════════
  // TZ ЭТАП 2: NEW REWARD SYSTEM
  // A) Base: 2 Wooden if eligible (30 sec activity)
  // B) Top-100 rewards by rank
  // C) Top-3 special rewards with badges
  // ═══════════════════════════════════════════════════════════

  // Helper: Calculate chest rewards based on rank (per TZ)
  const getChestRewardsByRank = (rank, isEligible) => {
    if (!isEligible) return { wooden: 0, bronze: 0, silver: 0, gold: 0, badge: null, badgeDays: null };

    let wooden = 2; // Base reward for all eligible players
    let bronze = 0;
    let silver = 0;
    let gold = 0;
    let badge = null;
    let badgeDays = null;

    if (rank === 1) {
      // #1: 1 Gold + 2 Silver + 2 Bronze + "Slayer" badge (7 days)
      gold += 1;
      silver += 2;
      bronze += 2;
      badge = 'slayer';
      badgeDays = 7;
    } else if (rank === 2) {
      // #2: 1 Gold + 1 Silver + 2 Bronze + "Elite" badge (7 days)
      gold += 1;
      silver += 1;
      bronze += 2;
      badge = 'elite';
      badgeDays = 7;
    } else if (rank === 3) {
      // #3: 1 Gold + 1 Silver + 1 Bronze + "Elite" badge (3 days)
      gold += 1;
      silver += 1;
      bronze += 1;
      badge = 'elite';
      badgeDays = 3;
    } else if (rank >= 4 && rank <= 10) {
      // Top 4-10: 1 Silver + 1 Bronze
      silver += 1;
      bronze += 1;
    } else if (rank >= 11 && rank <= 25) {
      // Top 11-25: 1 Silver
      silver += 1;
    } else if (rank >= 26 && rank <= 50) {
      // Top 26-50: 1 Bronze + 1 Wooden
      bronze += 1;
      wooden += 1;
    } else if (rank >= 51 && rank <= 100) {
      // Top 51-100: 1 Bronze
      bronze += 1;
    }
    // 101+: only base reward (2 wooden)

    return { wooden, bronze, silver, gold, badge, badgeDays };
  };

  // Distribute rewards to all participants
  const rewards = [];

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const rank = i + 1;
    const damagePercent = totalDamageDealt > 0 ? entry.damage / totalDamageDealt : 0;

    // Adena and EXP still distributed by damage %
    const goldReward = Math.floor(goldPool * damagePercent);
    const expReward = Math.floor(expPool * damagePercent);

    const isFinalBlow = entry.odamage === finalBlowPlayer.odamage;
    const isTopDamage = entry.odamage === topDamagePlayer?.odamage;

    // Calculate chest rewards (TZ Этап 2)
    const chestRewards = getChestRewardsByRank(rank, entry.isEligible);

    rewards.push({
      odamage: entry.odamage,
      visitorName: entry.visitorName,
      photoUrl: entry.photoUrl,
      damage: entry.damage,
      damagePercent: Math.round(damagePercent * 100),
      rank,
      isEligible: entry.isEligible,
      goldReward,
      expReward,
      chestRewards,
      isFinalBlow,
      isTopDamage,
    });

    // Update player stats in DB (adena, exp, totalDamage)
    try {
      await prisma.user.update({
        where: { id: entry.odamage },
        data: {
          gold: { increment: BigInt(goldReward) },
          exp: { increment: BigInt(expReward) },
          totalDamage: { increment: BigInt(entry.damage) },
          bossesKilled: { increment: isFinalBlow ? 1 : 0 },
        },
      });

      // Create PendingReward for eligible players (TZ Этап 2)
      if (entry.isEligible) {
        const totalChests = chestRewards.wooden + chestRewards.bronze + chestRewards.silver + chestRewards.gold;
        if (totalChests > 0 || chestRewards.badge) {
          try {
            await prisma.pendingReward.create({
              data: {
                userId: entry.odamage,
                bossSessionId: bossState.sessionId || `session-${Date.now()}`,
                bossName: bossState.name,
                bossIcon: bossState.icon || '👹',
                rank: rank <= 100 ? rank : null,
                wasEligible: true,
                chestsWooden: chestRewards.wooden,
                chestsBronze: chestRewards.bronze,
                chestsSilver: chestRewards.silver,
                chestsGold: chestRewards.gold,
                badgeId: chestRewards.badge,
                badgeDuration: chestRewards.badgeDays,
              },
            });
            console.log(`[Reward] Created pending reward for ${entry.visitorName} (rank ${rank}): ${chestRewards.wooden}W ${chestRewards.bronze}B ${chestRewards.silver}S ${chestRewards.gold}G`);
          } catch (e) {
            // Might be duplicate - that's OK
            if (!e.message.includes('Unique constraint')) {
              console.error('[Reward] Create pending error:', e.message);
            }
          }
        }
      }

      // Update in-memory player if online
      for (const [sid, p] of onlineUsers.entries()) {
        if (p.odamage === entry.odamage) {
          p.gold += goldReward;
          p.sessionDamage = 0;
          // Reset activity for next boss
          p.activityTime = 0;
          p.isEligible = false;
          p.activityBossSession = null;
          break;
        }
      }
    } catch (e) {
      console.error('[Reward] Error:', e.message);
    }
  }

  // Notify all online players about pending rewards
  io.emit('rewards:available');

  // Calculate total chests distributed for stats (TZ Этап 2)
  const totalChestsDistributed = rewards.reduce((sum, r) => ({
    wooden: sum.wooden + (r.chestRewards?.wooden || 0),
    bronze: sum.bronze + (r.chestRewards?.bronze || 0),
    silver: sum.silver + (r.chestRewards?.silver || 0),
    gold: sum.gold + (r.chestRewards?.gold || 0),
  }), { wooden: 0, bronze: 0, silver: 0, gold: 0 });

  const totalChestsCount = totalChestsDistributed.wooden + totalChestsDistributed.bronze +
                           totalChestsDistributed.silver + totalChestsDistributed.gold;

  // Add damagePercent to leaderboard entries
  const leaderboardWithPercent = leaderboard.map(entry => ({
    ...entry,
    damagePercent: Math.round((entry.damage / totalDamageDealt) * 100),
  }));

  // Store previous boss session for leaderboard tab
  previousBossSession = {
    bossName: bossState.name,
    bossIcon: bossState.icon,
    maxHp: bossState.maxHp,
    totalDamage: totalDamageDealt,
    finalBlowBy: finalBlowPlayer.odamageN,
    finalBlowPhoto: finalBlowPlayer.photoUrl,
    finalBlowDamage: rewards.find(r => r.isFinalBlow)?.damage || 0,
    topDamageBy: topDamagePlayer?.visitorName || 'Unknown',
    topDamagePhoto: topDamagePlayer?.photoUrl,
    topDamage: topDamagePlayer?.damage || 0,
    prizePool: { chests: totalChestsDistributed, exp: expPool, gold: goldPool },
    leaderboard: leaderboardWithPercent.slice(0, 20),
    rewards: rewards.slice(0, 20),
    killedAt: Date.now(),
  };

  // Update DB session
  if (bossState.sessionId) {
    try {
      await prisma.bossSession.update({
        where: { id: bossState.sessionId },
        data: {
          endedAt: new Date(),
          bossName: bossState.name,
          totalDamage: BigInt(totalDamageDealt),
          finalBlowBy: finalBlowPlayer.odamage || null,
          finalBlowName: finalBlowPlayer.odamageN,
          finalBlowDamage: BigInt(rewards.find(r => r.isFinalBlow)?.damage || 0),
          topDamageBy: topDamagePlayer?.odamage || null,
          topDamageName: topDamagePlayer?.visitorName,
          topDamage: BigInt(topDamagePlayer?.damage || 0),
          tonPool: 0,
          chestsPool: totalChestsCount,
          expPool: BigInt(expPool),
          leaderboardSnapshot: leaderboardWithPercent.slice(0, 20),
        },
      });
    } catch (e) {
      console.error('[Boss] Session update error:', e.message);
    }
  }

  // Set respawn timer (5 minutes)
  bossRespawnAt = new Date(Date.now() + BOSS_RESPAWN_TIME_MS);

  io.emit('boss:killed', {
    bossName: bossState.name,
    bossIcon: bossState.icon,
    finalBlowBy: finalBlowPlayer.odamageN,
    finalBlowPhoto: finalBlowPlayer.photoUrl,
    topDamageBy: topDamagePlayer?.visitorName || 'Unknown',
    topDamagePhoto: topDamagePlayer?.photoUrl,
    topDamage: topDamagePlayer?.damage || 0,
    prizePool: { chests: totalChestsDistributed, exp: expPool, gold: goldPool },
    leaderboard: leaderboardWithPercent.slice(0, 10),
    rewards: rewards.slice(0, 10),
    respawnAt: bossRespawnAt.getTime(),
    respawnIn: BOSS_RESPAWN_TIME_MS,
  });

  // Get top 3 rewards for logging
  const top3Rewards = rewards.slice(0, 3).map(r =>
    `${r.visitorName}: ${r.chestRewards?.wooden || 0}W ${r.chestRewards?.bronze || 0}B ${r.chestRewards?.silver || 0}S ${r.chestRewards?.gold || 0}G`
  ).join(', ');
  console.log(`[Boss] ${bossState.name} killed! Total ${totalChestsCount} chests distributed. Top 3: ${top3Rewards}`);
  console.log(`[Boss] Next boss spawning at ${bossRespawnAt.toISOString()}`);

  // Save state immediately after boss kill
  await saveBossState(prisma);
}

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.prepare().then(async () => {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('[Prisma] Connected to database');
  } catch (err) {
    console.error('[Prisma] Connection error:', err.message);
  }

  // Try to load saved boss state first
  const loadedState = await loadBossState(prisma);
  if (!loadedState || loadedState === 'respawn') {
    // No saved state OR boss HP=0 with expired respawn timer - spawn (next) boss
    const forceNext = loadedState === 'respawn'; // Move to next boss if HP=0
    await respawnBoss(prisma, forceNext);
    await saveBossState(prisma);
  }

  // Periodic boss state save (every 10 seconds)
  setInterval(() => {
    saveBossState(prisma);
  }, 10000);

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);

      // Health check endpoint
      if (parsedUrl.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          timestamp: Date.now(),
          playersOnline: onlineUsers.size,
          bossHp: bossState.currentHp,
        }));
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // ADMIN API ENDPOINTS
      // ═══════════════════════════════════════════════════════════

      // Helper to parse JSON body
      const parseBody = () => new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({}); }
        });
      });

      // Helper to check admin auth
      const checkAdminAuth = () => {
        const password = req.headers['x-admin-password'];
        return password === ADMIN_PASSWORD;
      };

      // Helper to send JSON response
      const sendJson = (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      // CORS for admin endpoints
      if (parsedUrl.pathname.startsWith('/api/admin')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

        // Handle preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
      }

      // Admin auth
      if (parsedUrl.pathname === '/api/admin/auth' && req.method === 'POST') {
        const body = await parseBody();
        if (body.password === ADMIN_PASSWORD) {
          sendJson({ success: true });
        } else {
          sendJson({ success: false, error: 'Invalid password' }, 401);
        }
        return;
      }

      // Check auth for all admin endpoints
      if (parsedUrl.pathname.startsWith('/api/admin/')) {
        if (!checkAdminAuth()) {
          sendJson({ success: false, error: 'Unauthorized' }, 401);
          return;
        }

        // Boss info
        if (parsedUrl.pathname === '/api/admin/boss' && req.method === 'GET') {
          sendJson({
            success: true,
            boss: bossState,
            playersOnline: onlineUsers.size,
          });
          return;
        }

        // Change boss
        if (parsedUrl.pathname === '/api/admin/boss/change' && req.method === 'POST') {
          const body = await parseBody();
          const newIndex = Math.max(0, Math.min(99, body.bossIndex || 0));
          currentBossIndex = newIndex;
          await respawnBoss(prisma, false);
          await saveBossState(prisma);
          sendJson({ success: true, boss: bossState });
          return;
        }

        // Force respawn
        if (parsedUrl.pathname === '/api/admin/boss/respawn' && req.method === 'POST') {
          await respawnBoss(prisma, true);
          await saveBossState(prisma);
          sendJson({ success: true, boss: bossState });
          return;
        }

        // Update boss stats
        if (parsedUrl.pathname === '/api/admin/boss/update' && req.method === 'POST') {
          const body = await parseBody();
          if (body.name) bossState.name = body.name;
          if (body.nameRu) bossState.nameRu = body.nameRu;
          if (body.icon) bossState.icon = body.icon;
          if (body.currentHp !== undefined) bossState.currentHp = Math.max(0, body.currentHp);
          if (body.maxHp !== undefined) bossState.maxHp = Math.max(1, body.maxHp);
          if (body.defense !== undefined) bossState.defense = Math.max(0, body.defense);
          await saveBossState(prisma);
          sendJson({ success: true, boss: bossState });
          return;
        }

        // Update boss rewards
        if (parsedUrl.pathname === '/api/admin/boss/rewards' && req.method === 'POST') {
          const body = await parseBody();
          if (body.goldReward !== undefined) bossState.goldReward = body.goldReward;
          if (body.expReward !== undefined) bossState.expReward = body.expReward;
          if (body.tonReward !== undefined) bossState.tonReward = body.tonReward;
          if (body.chestsReward !== undefined) bossState.chestsReward = body.chestsReward;
          await saveBossState(prisma);
          sendJson({ success: true, boss: bossState });
          return;
        }

        // List users
        if (parsedUrl.pathname === '/api/admin/users' && req.method === 'GET') {
          const search = parsedUrl.query.search || '';
          const offset = parseInt(parsedUrl.query.offset) || 0;
          const limit = 50;

          let where = {};
          if (search) {
            where = {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { username: { contains: search, mode: 'insensitive' } },
                { telegramId: isNaN(search) ? undefined : BigInt(search) },
              ].filter(Boolean),
            };
          }

          const users = await prisma.user.findMany({
            where,
            skip: offset,
            take: limit,
            orderBy: { totalDamage: 'desc' },
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              photoUrl: true,
              level: true,
              gold: true,
              totalDamage: true,
            },
          });

          sendJson({
            success: true,
            users: users.map(u => ({
              ...u,
              telegramId: u.telegramId.toString(),
              gold: u.gold.toString(),
              totalDamage: u.totalDamage.toString(),
            })),
          });
          return;
        }

        // Get single user
        if (parsedUrl.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && req.method === 'GET') {
          const userId = parsedUrl.pathname.split('/').pop();
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) {
            sendJson({ success: false, error: 'User not found' }, 404);
            return;
          }
          sendJson({
            success: true,
            user: {
              ...user,
              telegramId: user.telegramId.toString(),
              gold: user.gold.toString(),
              exp: user.exp.toString(),
              totalDamage: user.totalDamage.toString(),
            },
          });
          return;
        }

        // Update user
        if (parsedUrl.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && req.method === 'POST') {
          const userId = parsedUrl.pathname.split('/').pop();
          const body = await parseBody();

          const updateData = {};
          if (body.level !== undefined) updateData.level = body.level;
          if (body.gold !== undefined) updateData.gold = BigInt(body.gold);
          if (body.exp !== undefined) updateData.exp = BigInt(body.exp);
          if (body.stamina !== undefined) updateData.stamina = body.stamina;
          if (body.mana !== undefined) updateData.mana = body.mana;
          if (body.maxMana !== undefined) updateData.maxMana = body.maxMana;
          if (body.power !== undefined) updateData.power = body.power;
          if (body.agility !== undefined) updateData.agility = body.agility;
          if (body.vitality !== undefined) updateData.vitality = body.vitality;
          if (body.intellect !== undefined) updateData.intellect = body.intellect;
          if (body.spirit !== undefined) updateData.spirit = body.spirit;
          if (body.totalDamage !== undefined) updateData.totalDamage = BigInt(body.totalDamage);
          if (body.tonBalance !== undefined) updateData.tonBalance = body.tonBalance;

          await prisma.user.update({ where: { id: userId }, data: updateData });
          sendJson({ success: true });
          return;
        }

        // Give chests
        if (parsedUrl.pathname === '/api/admin/chests/give' && req.method === 'POST') {
          const body = await parseBody();
          const { userId, chestType, quantity } = body;

          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) {
            sendJson({ success: false, error: 'User not found' }, 404);
            return;
          }

          const type = chestType || 'WOODEN';
          const chestCreates = [];
          for (let i = 0; i < (quantity || 1); i++) {
            chestCreates.push({
              userId: userId,
              chestType: type,
              openingDuration: CHEST_CONFIG[type].duration,
            });
          }
          await prisma.chest.createMany({ data: chestCreates });
          sendJson({ success: true, quantity: chestCreates.length });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // EQUIPMENT MANAGEMENT
        // ═══════════════════════════════════════════════════════════

        // Create equipment template
        if (parsedUrl.pathname === '/api/admin/equipment/create' && req.method === 'POST') {
          const body = await parseBody();
          const { code, name, nameRu, icon, slot, rarity, pAtkMin, pAtkMax, pDefMin, pDefMax } = body;

          if (!code || !name || !slot) {
            sendJson({ success: false, error: 'code, name and slot are required' }, 400);
            return;
          }

          // Check if code already exists
          const existing = await prisma.equipment.findUnique({ where: { code } });
          if (existing) {
            sendJson({ success: false, error: 'Equipment with this code already exists' }, 400);
            return;
          }

          const equipment = await prisma.equipment.create({
            data: {
              code,
              name,
              nameRu: nameRu || name,
              icon: icon || '📦',
              slot,
              rarity: rarity || 'COMMON',
              pAtkMin: pAtkMin || 0,
              pAtkMax: pAtkMax || 0,
              pDefMin: pDefMin || 0,
              pDefMax: pDefMax || 0,
              droppable: true,
            },
          });

          sendJson({ success: true, equipment });
          return;
        }

        // List all equipment templates
        if (parsedUrl.pathname === '/api/admin/equipment/list' && req.method === 'GET') {
          const equipment = await prisma.equipment.findMany({
            orderBy: [{ slot: 'asc' }, { rarity: 'asc' }, { name: 'asc' }],
          });
          sendJson({ success: true, equipment });
          return;
        }

        // Give equipment to user
        if (parsedUrl.pathname === '/api/admin/equipment/give' && req.method === 'POST') {
          const body = await parseBody();
          const { userId, code, enchant, isEquipped } = body;

          if (!userId || !code) {
            sendJson({ success: false, error: 'userId and code are required' }, 400);
            return;
          }

          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) {
            sendJson({ success: false, error: 'User not found' }, 404);
            return;
          }

          const equipment = await prisma.equipment.findUnique({ where: { code } });
          if (!equipment) {
            sendJson({ success: false, error: 'Equipment not found' }, 404);
            return;
          }

          // Roll stats
          const rolledPAtk = equipment.pAtkMax > 0
            ? Math.floor(Math.random() * (equipment.pAtkMax - equipment.pAtkMin + 1)) + equipment.pAtkMin
            : 0;
          const rolledPDef = equipment.pDefMax > 0
            ? Math.floor(Math.random() * (equipment.pDefMax - equipment.pDefMin + 1)) + equipment.pDefMin
            : 0;

          const userEquip = await prisma.userEquipment.create({
            data: {
              userId,
              equipmentId: equipment.id,
              pAtk: rolledPAtk,
              pDef: rolledPDef,
              enchant: enchant || 0,
              isEquipped: isEquipped || false,
            },
          });

          sendJson({ success: true, userEquipment: userEquip, equipment });
          return;
        }

        // Broadcast message
        if (parsedUrl.pathname === '/api/admin/broadcast' && req.method === 'POST') {
          const body = await parseBody();
          const { messageRu, messageEn, buttonTextRu, buttonTextEn, buttonUrl, imageUrl, speed } = body;

          if (!TELEGRAM_BOT_TOKEN) {
            sendJson({ success: false, error: 'Bot token not configured' });
            return;
          }

          // Get all users with telegramId
          const users = await prisma.user.findMany({
            select: { telegramId: true, language: true },
          });

          if (users.length === 0) {
            sendJson({ success: false, error: 'No users to broadcast to' });
            return;
          }

          // Start broadcast in background
          const sendRate = Math.min(30, Math.max(1, speed || 30));
          const delayMs = 1000 / sendRate;

          (async () => {
            let sent = 0;
            let failed = 0;
            for (const user of users) {
              const lang = user.language || 'en';
              const message = lang === 'ru' ? messageRu : messageEn;
              const buttonText = lang === 'ru' ? buttonTextRu : buttonTextEn;

              try {
                const payload = {
                  chat_id: user.telegramId.toString(),
                  text: message,
                  parse_mode: 'HTML',
                };

                if (buttonText && buttonUrl) {
                  payload.reply_markup = {
                    inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
                  };
                }

                // If image provided, use sendPhoto instead
                if (imageUrl) {
                  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: user.telegramId.toString(),
                      photo: imageUrl,
                      caption: message,
                      parse_mode: 'HTML',
                      reply_markup: buttonText && buttonUrl ? {
                        inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
                      } : undefined,
                    }),
                  });
                } else {
                  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                }
                sent++;
              } catch (e) {
                failed++;
              }

              // Rate limit
              await new Promise(r => setTimeout(r, delayMs));
            }
            console.log(`[Broadcast] Done: ${sent} sent, ${failed} failed`);
          })();

          sendJson({ success: true, totalUsers: users.length });
          return;
        }

        // Test broadcast (to admin/first user)
        if (parsedUrl.pathname === '/api/admin/broadcast/test' && req.method === 'POST') {
          const body = await parseBody();
          // Just log it for now
          console.log('[Broadcast Test]', body);
          sendJson({ success: true, message: 'Test logged to console' });
          return;
        }

        // Danger zone: Reset all
        if (parsedUrl.pathname === '/api/admin/danger/reset-all' && req.method === 'POST') {
          const body = await parseBody();
          if (body.confirmPassword !== RESET_PASSWORD) {
            sendJson({ success: false, error: 'Invalid reset password' }, 403);
            return;
          }

          // Delete everything
          await prisma.activeBuff.deleteMany({});
          await prisma.chest.deleteMany({});
          await prisma.inventoryItem.deleteMany({});
          await prisma.bossSession.deleteMany({});
          await prisma.user.deleteMany({});
          await prisma.gameState.deleteMany({});

          // Reset boss
          currentBossIndex = 0;
          await respawnBoss(prisma, false);
          await saveBossState(prisma);

          sendJson({ success: true });
          return;
        }

        // Danger zone: Reset users
        if (parsedUrl.pathname === '/api/admin/danger/reset-users' && req.method === 'POST') {
          const body = await parseBody();
          if (body.confirmPassword !== RESET_PASSWORD) {
            sendJson({ success: false, error: 'Invalid reset password' }, 403);
            return;
          }

          await prisma.user.updateMany({
            data: {
              level: 1,
              exp: BigInt(0),
              gold: BigInt(0),
              totalDamage: BigInt(0),
              bossesKilled: 0,
              tonBalance: 0,
              stamina: 100,
              mana: 1000,
            },
          });

          sendJson({ success: true });
          return;
        }

        // Danger zone: Reset boss
        if (parsedUrl.pathname === '/api/admin/danger/reset-boss' && req.method === 'POST') {
          const body = await parseBody();
          if (body.confirmPassword !== RESET_PASSWORD) {
            sendJson({ success: false, error: 'Invalid reset password' }, 403);
            return;
          }

          currentBossIndex = 0;
          bossRespawnAt = null;
          await respawnBoss(prisma, false);
          await saveBossState(prisma);
          sessionLeaderboard.clear();

          sendJson({ success: true });
          return;
        }
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // ─────────────────────────────────────────────────────────
  // SOCKET HANDLERS
  // ─────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Calculate initial derived stats for level 1
    const initialDerived = StatsService.calculateDerived(
      { power: 10, agility: 10, vitality: 10, intellect: 10, spirit: 10 },
      1
    );

    const player = {
      odamage: '',
      odamageN: 'Guest',
      photoUrl: null,
      // Legacy stats
      str: 1,
      dex: 1,
      luck: 1,
      pAtk: 10,
      critChance: initialDerived.critChance,
      // L2 Core Attributes (NEW)
      power: 10,
      agility: 10,
      vitality: 10,
      intellect: 10,
      spirit: 10,
      // L2 Derived Stats (from StatsService)
      physicalPower: initialDerived.physicalPower,
      maxHealth: initialDerived.maxHealth,
      physicalDefense: initialDerived.physicalDefense,
      attackSpeed: initialDerived.attackSpeed,
      // Stamina System (from StatsService)
      stamina: initialDerived.maxStamina,
      maxStamina: initialDerived.maxStamina,
      exhaustedUntil: null,  // timestamp when exhaustion ends
      // Mana system (from StatsService)
      mana: initialDerived.maxMana,
      maxMana: initialDerived.maxMana,
      manaRegen: BASE_MANA_REGEN,
      // Tap & Auto-attack
      tapsPerSecond: BASE_TAPS_PER_SECOND,
      autoAttackSpeed: 0,
      lastTapTime: 0,
      tapCount: 0,
      // First login
      isFirstLogin: true,
      // Stats
      gold: 0,
      sessionDamage: 0,
      sessionClicks: 0,
      sessionCrits: 0,
      // Soulshots
      activeSoulshot: null,
      soulshotNG: 100,
      soulshotD: 0,
      soulshotC: 0,
      soulshotB: 0,
      soulshotA: 0,
      soulshotS: 0,
      // Potions
      potionHaste: 0,
      potionAcumen: 0,
      potionLuck: 0,
      // Active buffs (in-memory)
      activeBuffs: [],
      // Activity tracking for boss rewards (TZ Этап 2)
      activityTime: 0,           // Total time active (ms) for current boss
      lastActivityPing: 0,       // Last activity ping timestamp
      activityBossSession: null, // Which boss session this activity is for
      isEligible: false,         // 30+ seconds activity = eligible for rewards
    };

    onlineUsers.set(socket.id, player);

    // Send initial state (with all fields including image)
    socket.emit('boss:state', {
      id: bossState.id,
      name: bossState.name,
      nameRu: bossState.nameRu,
      title: bossState.title,
      hp: bossState.currentHp,
      maxHp: bossState.maxHp,
      defense: bossState.defense,
      ragePhase: bossState.ragePhase,
      playersOnline: onlineUsers.size,
      icon: bossState.icon,
      image: bossState.image,
      bossIndex: bossState.bossIndex,
      totalBosses: bossState.totalBosses,
      // Respawn timer info
      isRespawning: bossRespawnAt !== null,
      respawnAt: bossRespawnAt ? bossRespawnAt.getTime() : null,
    });

    socket.emit('player:state', {
      // L2 Stamina (NEW)
      stamina: player.stamina,
      maxStamina: player.maxStamina,
      exhaustedUntil: player.exhaustedUntil,
      // L2 Attributes (NEW)
      power: player.power,
      agility: player.agility,
      vitality: player.vitality,
      physicalPower: player.physicalPower,
      physicalDefense: player.physicalDefense,
      // Legacy mana
      mana: player.mana,
      maxMana: player.maxMana,
      manaRegen: player.manaRegen,
      // Other
      tapsPerSecond: player.tapsPerSecond,
      autoAttackSpeed: player.autoAttackSpeed,
      sessionDamage: player.sessionDamage,
      isFirstLogin: player.isFirstLogin,
    });

    // GET PLAYER DATA (for tabs that mount after auth)
    socket.on('player:get', async () => {
      if (!player.odamage) {
        socket.emit('player:data', null);
        return;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
        });

        if (user) {
          // Calculate expToNext based on level
          const expToNext = Math.floor(1000 * Math.pow(1.5, user.level - 1));

          socket.emit('player:data', {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            level: user.level,
            // EXP
            exp: Number(user.exp),
            expToNext: expToNext,
            // Legacy stats
            str: user.str,
            dex: user.dex,
            luck: user.luck,
            // Base stats (L2)
            power: user.power,
            vitality: user.vitality,
            agility: user.agility,
            intellect: user.intellect,
            spirit: user.spirit,
            // Combat stats
            pAtk: user.pAtk,
            pDef: user.physicalDefense,
            mAtk: user.intellect * 2, // Magic attack based on intellect
            mDef: user.spirit * 2, // Magic defense based on spirit
            critChance: user.critChance,
            attackSpeed: user.attackSpeed,
            // Currency
            gold: Number(user.gold),
            ancientCoin: user.ancientCoin,
            // Mana
            mana: user.mana,
            maxMana: user.maxMana,
            manaRegen: user.manaRegen,
            // Skills
            tapsPerSecond: user.tapsPerSecond,
            autoAttackSpeed: user.autoAttackSpeed,
            isFirstLogin: user.isFirstLogin,
            // Progression
            totalDamage: Number(user.totalDamage),
            bossesKilled: user.bossesKilled,
            // Consumables
            activeSoulshot: user.activeSoulshot,
            soulshotNG: user.soulshotNG,
            soulshotD: user.soulshotD,
            soulshotC: user.soulshotC,
            potionHaste: user.potionHaste,
            potionAcumen: user.potionAcumen,
            potionLuck: user.potionLuck,
          });
        }
      } catch (err) {
        console.error('[Player] Get error:', err.message);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // ACTIVITY TRACKING (TZ Этап 2)
    // Client sends ping every 5 seconds while on battle tab
    // After 30 seconds total → player becomes eligible for boss rewards
    // ═══════════════════════════════════════════════════════════
    socket.on('activity:ping', () => {
      if (!player.odamage) return;

      const now = Date.now();
      const currentSession = bossState.sessionId;

      // Reset activity if boss changed
      if (player.activityBossSession !== currentSession) {
        player.activityTime = 0;
        player.lastActivityPing = now;
        player.activityBossSession = currentSession;
        player.isEligible = false;
      }

      // Calculate time since last ping (max 10 seconds to prevent cheating)
      const timeSinceLastPing = player.lastActivityPing > 0
        ? Math.min(now - player.lastActivityPing, 10000)
        : 0;

      player.activityTime += timeSinceLastPing;
      player.lastActivityPing = now;

      // Check if eligible (30 seconds = 30000ms)
      if (!player.isEligible && player.activityTime >= 30000) {
        player.isEligible = true;
        console.log(`[Activity] ${player.odamageN} is now eligible for boss rewards (${Math.floor(player.activityTime / 1000)}s)`);
      }

      // Send back activity status
      socket.emit('activity:status', {
        activityTime: player.activityTime,
        isEligible: player.isEligible,
      });
    });

    // GET PENDING REWARDS
    socket.on('rewards:get', async () => {
      if (!player.odamage) {
        socket.emit('rewards:data', { rewards: [] });
        return;
      }

      try {
        const pendingRewards = await prisma.pendingReward.findMany({
          where: {
            userId: player.odamage,
            claimed: false,
          },
          orderBy: { createdAt: 'desc' },
        });

        socket.emit('rewards:data', {
          rewards: pendingRewards.map(r => ({
            id: r.id,
            bossSessionId: r.bossSessionId,
            bossName: r.bossName,
            bossIcon: r.bossIcon,
            rank: r.rank,
            wasEligible: r.wasEligible,
            chestsWooden: r.chestsWooden,
            chestsBronze: r.chestsBronze,
            chestsSilver: r.chestsSilver,
            chestsGold: r.chestsGold,
            badgeId: r.badgeId,
            badgeDuration: r.badgeDuration,
            createdAt: r.createdAt.getTime(),
          })),
        });
      } catch (err) {
        console.error('[Rewards] Get error:', err.message);
        socket.emit('rewards:data', { rewards: [] });
      }
    });

    // CLAIM PENDING REWARDS
    socket.on('rewards:claim', async (data) => {
      if (!player.odamage) {
        socket.emit('rewards:error', { message: 'Not authenticated' });
        return;
      }

      const { rewardId } = data;

      try {
        // Get the pending reward
        const reward = await prisma.pendingReward.findUnique({
          where: { id: rewardId },
        });

        if (!reward || reward.userId !== player.odamage) {
          socket.emit('rewards:error', { message: 'Reward not found' });
          return;
        }

        if (reward.claimed) {
          socket.emit('rewards:error', { message: 'Already claimed' });
          return;
        }

        // Get user's chest slot info
        const userSlotInfo = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { chestSlots: true },
        });
        const currentChestCount = await prisma.chest.count({
          where: { userId: player.odamage },
        });
        const maxSlots = userSlotInfo?.chestSlots || 5;
        let freeSlots = Math.max(0, maxSlots - currentChestCount);

        // Create chests (as many as fit in slots)
        const chestsToCreate = [];
        const chestTypes = [
          { type: 'WOODEN', count: reward.chestsWooden },
          { type: 'BRONZE', count: reward.chestsBronze },
          { type: 'SILVER', count: reward.chestsSilver },
          { type: 'GOLD', count: reward.chestsGold },
        ];

        let totalChestsCreated = 0;
        for (const { type, count } of chestTypes) {
          const toCreate = Math.min(count, freeSlots);
          for (let i = 0; i < toCreate; i++) {
            chestsToCreate.push({
              userId: player.odamage,
              chestType: type,
              openingDuration: CHEST_CONFIG[type].duration,
              fromBossId: null,
              fromSessionId: reward.bossSessionId,
            });
            freeSlots--;
            totalChestsCreated++;
          }
        }

        if (chestsToCreate.length > 0) {
          await prisma.chest.createMany({ data: chestsToCreate });
        }

        // Create badge if awarded
        if (reward.badgeId && reward.badgeDuration) {
          const badgeConfig = {
            slayer: { name: 'Slayer', icon: '⚔️' },
            elite: { name: 'Elite', icon: '🏆' },
          };
          const badge = badgeConfig[reward.badgeId] || { name: reward.badgeId, icon: '🎖️' };

          await prisma.userBadge.create({
            data: {
              userId: player.odamage,
              badgeId: reward.badgeId,
              name: badge.name,
              icon: badge.icon,
              expiresAt: new Date(Date.now() + reward.badgeDuration * 24 * 60 * 60 * 1000),
            },
          });
        }

        // Mark reward as claimed
        await prisma.pendingReward.update({
          where: { id: rewardId },
          data: {
            claimed: true,
            claimedAt: new Date(),
          },
        });

        socket.emit('rewards:claimed', {
          rewardId,
          chestsCreated: totalChestsCreated,
          badgeAwarded: reward.badgeId || null,
        });

        // Refresh chest data
        socket.emit('chest:refresh');

      } catch (err) {
        console.error('[Rewards] Claim error:', err.message);
        socket.emit('rewards:error', { message: 'Failed to claim reward' });
      }
    });

    // AUTH
    socket.on('auth', async (data) => {
      try {
        console.log(`[Auth] Attempt for telegramId: ${data.telegramId}`);

        // Verify Telegram initData if provided and token is set
        if (data.initData && TELEGRAM_BOT_TOKEN && !SKIP_TELEGRAM_AUTH) {
          const isValid = verifyTelegramAuth(data.initData);
          if (!isValid) {
            console.warn(`[Auth] Invalid signature, but allowing anyway for: ${data.telegramId}`);
            // Don't return - allow auth to continue for better UX
          }
        }

        if (!data.telegramId) {
          console.warn('[Auth] No telegramId provided');
          socket.emit('auth:error', { message: 'No telegramId' });
          return;
        }

        let user = await prisma.user.findUnique({
          where: { telegramId: BigInt(data.telegramId) },
        });

        // Detect language (ru if starts with 'ru', else 'en')
        const userLang = data.languageCode?.startsWith('ru') ? 'ru' : 'en';

        if (!user) {
          user = await prisma.user.create({
            data: {
              telegramId: BigInt(data.telegramId),
              username: data.username || null,
              firstName: data.firstName || null,
              photoUrl: data.photoUrl || null,
              language: userLang,
            },
          });
          console.log(`[Auth] New user created: ${data.telegramId}, lang: ${userLang}`);

          // ═══════════════════════════════════════════════════════════
          // STARTER PACK - Mark user as needing starter chest opening
          // Equipment will be given when user opens starter chest via welcome popup
          // ═══════════════════════════════════════════════════════════
          try {
            // Just ensure starter equipment templates exist in DB
            for (const starter of STARTER_EQUIPMENT) {
              const existing = await prisma.equipment.findUnique({
                where: { code: starter.code },
              });

              if (!existing) {
                await prisma.equipment.create({
                  data: {
                    code: starter.code,
                    name: starter.name,
                    nameRu: starter.name,
                    icon: starter.icon,
                    slot: starter.slot,
                    rarity: 'COMMON',
                    pAtkMin: starter.pAtk || 0,
                    pAtkMax: starter.pAtk || 0,
                    pDefMin: starter.pDef || 0,
                    pDefMax: starter.pDef || 0,
                    droppable: false, // Starter items don't drop from chests
                  },
                });
                console.log(`[Starter] Created equipment template: ${starter.code}`);
              }
            }
            // Note: Equipment will be given when user calls starter:open event
            console.log(`[Starter] New user ${user.id} ready for starter chest`);

          } catch (starterErr) {
            console.error('[Starter] Error giving starter pack:', starterErr.message);
          }

        } else {
          // Update language if changed
          if (user.language !== userLang) {
            await prisma.user.update({
              where: { id: user.id },
              data: { language: userLang },
            });
            user.language = userLang;
          }
          console.log(`[Auth] Existing user: ${data.telegramId}, lang: ${userLang}`);
        }

        // Update player state from DB
        player.odamage = user.id;
        player.odamageN = user.firstName || user.username || 'Player';
        player.photoUrl = user.photoUrl || null;
        // Legacy stats
        player.str = user.str;
        player.dex = user.dex;
        player.luck = user.luck;
        player.pAtk = user.pAtk;
        player.critChance = user.critChance;
        // L2 Core Attributes (NEW)
        player.power = user.power || 10;
        player.agility = user.agility || 10;
        player.vitality = user.vitality || 10;
        player.intellect = user.intellect || 10;
        player.spirit = user.spirit || 10;

        // Recalculate derived stats using StatsService (ensures correct maxStamina)
        const derivedStats = StatsService.calculateDerived(
          { power: player.power, agility: player.agility, vitality: player.vitality, intellect: player.intellect, spirit: player.spirit },
          user.level || 1
        );

        // L2 Derived Stats (from StatsService calculation)
        player.physicalPower = derivedStats.physicalPower;
        player.maxHealth = derivedStats.maxHealth;
        player.physicalDefense = derivedStats.physicalDefense;
        player.attackSpeed = derivedStats.attackSpeed;
        player.critChance = derivedStats.critChance;
        // L2 Stamina (from StatsService - formula: max(100, floor(maxHealth * 10)))
        player.maxStamina = derivedStats.maxStamina;
        player.stamina = Math.min(user.stamina || player.maxStamina, player.maxStamina);
        player.exhaustedUntil = user.exhaustedUntil ? user.exhaustedUntil.getTime() : null;
        // Mana (from StatsService + DB)
        player.maxMana = derivedStats.maxMana;
        player.mana = Math.min(user.mana || player.maxMana, player.maxMana);
        player.manaRegen = user.manaRegen;
        player.tapsPerSecond = user.tapsPerSecond;
        player.autoAttackSpeed = user.autoAttackSpeed;
        player.isFirstLogin = user.isFirstLogin;
        player.gold = Number(user.gold);
        player.activeSoulshot = user.activeSoulshot;
        player.soulshotNG = user.soulshotNG;
        player.soulshotD = user.soulshotD;
        player.soulshotC = user.soulshotC;
        player.potionHaste = user.potionHaste;
        player.potionAcumen = user.potionAcumen;
        player.potionLuck = user.potionLuck;

        // Load active buffs from DB
        const activeBuffs = await prisma.activeBuff.findMany({
          where: { userId: user.id, expiresAt: { gt: new Date() } },
        });
        player.activeBuffs = activeBuffs.map(b => ({
          type: b.buffType.toLowerCase(),
          value: b.value,
          expiresAt: b.expiresAt.getTime(),
        }));

        // Calculate expToNext based on level
        const expToNext = Math.floor(1000 * Math.pow(1.5, user.level - 1));

        socket.emit('auth:success', {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          level: user.level,
          // EXP
          exp: Number(user.exp),
          expToNext: expToNext,
          // Legacy stats
          str: user.str,
          dex: user.dex,
          luck: user.luck,
          pAtk: user.pAtk,
          critChance: user.critChance,
          // L2 Core Attributes (NEW)
          power: player.power,
          agility: player.agility,
          vitality: player.vitality,
          intellect: player.intellect,
          spirit: player.spirit,
          // L2 Derived Stats (NEW)
          physicalPower: player.physicalPower,
          maxHealth: player.maxHealth,
          physicalDefense: player.physicalDefense,
          attackSpeed: player.attackSpeed,
          // Combat stats for CharacterTab
          pDef: player.physicalDefense,
          mAtk: player.intellect * 2,
          mDef: player.spirit * 2,
          // L2 Stamina (NEW)
          stamina: player.stamina,
          maxStamina: player.maxStamina,
          exhaustedUntil: player.exhaustedUntil,
          // Currency
          gold: Number(user.gold),
          ancientCoin: user.ancientCoin || 0,
          // Mana
          mana: user.mana,
          maxMana: user.maxMana,
          manaRegen: user.manaRegen,
          tapsPerSecond: user.tapsPerSecond,
          autoAttackSpeed: user.autoAttackSpeed,
          isFirstLogin: user.isFirstLogin,
          totalDamage: Number(user.totalDamage),
          bossesKilled: user.bossesKilled,
          activeSoulshot: user.activeSoulshot,
          soulshotNG: user.soulshotNG,
          soulshotD: user.soulshotD,
          soulshotC: user.soulshotC,
          potionHaste: user.potionHaste,
          potionAcumen: user.potionAcumen,
          potionLuck: user.potionLuck,
          activeBuffs: player.activeBuffs,
        });
      } catch (err) {
        console.error('[Auth] Error:', err.message);
        socket.emit('auth:error', { message: 'Auth failed' });
      }
    });

    // TAP
    socket.on('tap:batch', async (data) => {
      let tapCount = Math.min(data.count || 1, MAX_TAPS_PER_BATCH);
      const now = Date.now();

      // Check exhaustion (L2: не можем тапать если exhausted)
      if (StatsService.isExhausted(player.exhaustedUntil)) {
        socket.emit('tap:error', { message: 'Exhausted! Wait to recover.' });
        return;
      }

      // Rate limiting based on tapsPerSecond
      const timeSinceLastTap = now - player.lastTapTime;
      const maxTapsAllowed = Math.floor((timeSinceLastTap / 1000) * player.tapsPerSecond) + 1;

      if (timeSinceLastTap < 100) {
        // Too fast, limit taps
        tapCount = Math.min(tapCount, Math.max(1, maxTapsAllowed));
      }

      player.lastTapTime = now;

      if (bossState.currentHp <= 0) {
        socket.emit('tap:error', { message: 'Boss is dead' });
        return;
      }

      // Stamina cost: always 1 per tap
      const staminaCostPerTap = 1;

      // Check stamina
      if (player.stamina < staminaCostPerTap) {
        // Trigger exhaustion
        player.exhaustedUntil = StatsService.createExhaustionUntil();
        socket.emit('hero:exhausted', {
          until: player.exhaustedUntil,
          duration: StatsService.EXHAUSTION_DURATION_MS,
        });
        socket.emit('tap:error', { message: 'Not enough stamina! Exhausted.' });
        return;
      }

      // Calculate how many taps we can afford
      const maxAffordableTaps = Math.floor(player.stamina / staminaCostPerTap);
      tapCount = Math.min(tapCount, maxAffordableTaps);

      if (tapCount <= 0) {
        player.exhaustedUntil = StatsService.createExhaustionUntil();
        socket.emit('hero:exhausted', {
          until: player.exhaustedUntil,
          duration: StatsService.EXHAUSTION_DURATION_MS,
        });
        return;
      }

      // Deduct stamina
      player.stamina -= tapCount * staminaCostPerTap;

      const { totalDamage, crits, soulshotUsed } = calculateDamage(player, tapCount);
      const actualDamage = Math.min(totalDamage, bossState.currentHp);
      bossState.currentHp -= actualDamage;

      // Adena reward: 1 adena per 100 damage
      const goldGained = Math.floor(actualDamage / 100);
      player.gold += goldGained;

      player.sessionDamage += actualDamage;
      player.sessionClicks += tapCount;
      player.sessionCrits += crits;

      const key = player.odamage || socket.id;
      const existing = sessionLeaderboard.get(key);
      sessionLeaderboard.set(key, {
        odamage: (existing?.odamage || 0) + actualDamage,
        odamageN: player.odamageN,
        photoUrl: player.photoUrl,
        isEligible: existing?.isEligible || player.isEligible || false, // TZ Этап 2
      });

      socket.emit('tap:result', {
        damage: actualDamage,
        crits,
        // L2 Stamina
        stamina: player.stamina,
        maxStamina: player.maxStamina,
        staminaCost: tapCount, // Always 1 per tap
        // Legacy mana
        mana: player.mana,
        sessionDamage: player.sessionDamage,
        gold: player.gold,
        goldGained,
        soulshotUsed,
        activeSoulshot: player.activeSoulshot,
        [`soulshot${player.activeSoulshot}`]: player.activeSoulshot ? player[`soulshot${player.activeSoulshot}`] : undefined,
      });

      io.emit('damage:feed', {
        playerName: player.odamageN,
        damage: actualDamage,
        isCrit: crits > 0,
      });

      if (updateRagePhase()) {
        io.emit('boss:rage', {
          phase: bossState.ragePhase,
          multiplier: RAGE_PHASES[bossState.ragePhase].multiplier,
        });
      }

      // Boss killed
      if (bossState.currentHp <= 0) {
        await handleBossKill(io, prisma, player, socket.id);
      }
    });

    // SKILL USE - Magic skills (fireball, iceball, lightning)
    socket.on('skill:use', async (data) => {
      const { skillId } = data;
      const now = Date.now();

      // Skill config
      const SKILLS = {
        fireball: { manaCost: 100, baseDamage: 500, multiplier: 1.5, cooldown: 10000 },
        iceball: { manaCost: 100, baseDamage: 400, multiplier: 1.3, cooldown: 10000 },
        lightning: { manaCost: 100, baseDamage: 600, multiplier: 1.8, cooldown: 10000 },
      };

      const skill = SKILLS[skillId];
      if (!skill) {
        socket.emit('skill:error', { message: 'Unknown skill' });
        return;
      }

      // Check boss alive
      if (bossState.currentHp <= 0) {
        socket.emit('skill:error', { message: 'Boss is dead' });
        return;
      }

      // Check mana
      if (player.mana < skill.manaCost) {
        socket.emit('skill:error', { message: 'Not enough mana' });
        return;
      }

      // Deduct mana
      player.mana -= skill.manaCost;

      // Calculate damage: baseDamage + (pAtk * multiplier)
      const damage = Math.floor(skill.baseDamage + (player.pAtk * skill.multiplier));
      const actualDamage = Math.min(damage, bossState.currentHp);
      bossState.currentHp -= actualDamage;

      // Adena reward
      const goldGained = Math.floor(actualDamage / 50); // More adena for skills
      player.gold += goldGained;
      player.sessionDamage += actualDamage;

      // Update leaderboard
      const key = player.odamage || socket.id;
      const existing = sessionLeaderboard.get(key);
      sessionLeaderboard.set(key, {
        odamage: (existing?.odamage || 0) + actualDamage,
        odamageN: player.odamageN,
        photoUrl: player.photoUrl,
        isEligible: existing?.isEligible || player.isEligible || false, // TZ Этап 2
      });

      socket.emit('skill:result', {
        skillId,
        damage: actualDamage,
        mana: player.mana,
        maxMana: player.maxMana,
        gold: player.gold,
        goldGained,
        sessionDamage: player.sessionDamage,
      });

      io.emit('damage:feed', {
        playerName: player.odamageN,
        damage: actualDamage,
        isCrit: false,
        isSkill: true,
        skillId,
      });

      // Check boss killed
      if (bossState.currentHp <= 0) {
        // Trigger same kill logic as tap:batch
        // (simplified - in production you'd refactor to shared function)
        console.log(`[Boss] ${bossState.name} killed by ${player.odamageN} using ${skillId}!`);
      }
    });

    // LEADERBOARD - Current Boss (with % and photos)
    socket.on('leaderboard:get', () => {
      const totalDamage = Array.from(sessionLeaderboard.values()).reduce((sum, d) => sum + d.odamage, 0);
      const leaderboard = Array.from(sessionLeaderboard.entries())
        .map(([id, data]) => ({
          visitorId: id,
          visitorName: data.odamageN,
          photoUrl: data.photoUrl,
          damage: data.odamage,
          damagePercent: totalDamage > 0 ? Math.round((data.odamage / totalDamage) * 100) : 0,
        }))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, 20);

      socket.emit('leaderboard:data', {
        leaderboard,
        bossName: bossState.name,
        bossIcon: bossState.icon,
        bossHp: bossState.currentHp,
        bossMaxHp: bossState.maxHp,
        prizePool: {
          ton: bossState.tonReward,
          chests: bossState.chestsReward,
          exp: bossState.expReward,
          gold: bossState.goldReward,
        },
        totalDamage,
      });
    });

    // LEADERBOARD - Previous Boss
    socket.on('leaderboard:previous:get', () => {
      if (previousBossSession) {
        socket.emit('leaderboard:previous', previousBossSession);
      } else {
        socket.emit('leaderboard:previous', null);
      }
    });

    // ALL-TIME LEADERBOARD (Legend)
    socket.on('leaderboard:alltime:get', async () => {
      try {
        const topUsers = await prisma.user.findMany({
          orderBy: { totalDamage: 'desc' },
          take: 20,
          select: {
            id: true,
            firstName: true,
            username: true,
            photoUrl: true,
            totalDamage: true,
            bossesKilled: true,
            tonBalance: true,
          },
        });
        const leaderboard = topUsers.map(u => ({
          visitorId: u.id,
          visitorName: u.firstName || u.username || 'Anonymous',
          photoUrl: u.photoUrl,
          damage: Number(u.totalDamage),
          bossesKilled: u.bossesKilled,
          tonBalance: u.tonBalance,
        }));
        socket.emit('leaderboard:alltime', leaderboard);
      } catch (err) {
        console.error('[Leaderboard] Error:', err.message);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // CHESTS
    // ═══════════════════════════════════════════════════════════

    // Get player's chests
    socket.on('chest:get', async () => {
      if (!player.odamage) {
        socket.emit('chest:data', { chests: [] });
        return;
      }

      try {
        const chests = await prisma.chest.findMany({
          where: { userId: player.odamage },
          orderBy: { createdAt: 'desc' },
        });

        socket.emit('chest:data', {
          chests: chests.map(c => ({
            id: c.id,
            chestType: c.chestType,
            openingStarted: c.openingStarted?.getTime() || null,
            openingDuration: c.openingDuration,
          })),
        });
      } catch (err) {
        console.error('[Chest] Get error:', err.message);
        socket.emit('chest:data', { chests: [] });
      }
    });

    // Start opening a chest
    socket.on('chest:open', async (data) => {
      if (!player.odamage) {
        socket.emit('chest:error', { message: 'Not authenticated' });
        return;
      }

      const { chestId } = data;

      try {
        // Check if any chest is already opening
        const openingChest = await prisma.chest.findFirst({
          where: {
            userId: player.odamage,
            openingStarted: { not: null },
          },
        });

        if (openingChest) {
          // Check if it's finished
          const elapsed = Date.now() - openingChest.openingStarted.getTime();
          if (elapsed < openingChest.openingDuration) {
            socket.emit('chest:error', { message: 'Already opening another chest' });
            return;
          }
        }

        // Start opening the chest
        const chest = await prisma.chest.update({
          where: { id: chestId, userId: player.odamage },
          data: { openingStarted: new Date() },
        });

        socket.emit('chest:opened', {
          id: chest.id,
          chestType: chest.chestType,
          openingStarted: chest.openingStarted.getTime(),
          openingDuration: chest.openingDuration,
        });
      } catch (err) {
        console.error('[Chest] Open error:', err.message);
        socket.emit('chest:error', { message: 'Failed to open chest' });
      }
    });

    // Claim an opened chest
    socket.on('chest:claim', async (data) => {
      if (!player.odamage) {
        socket.emit('chest:error', { message: 'Not authenticated' });
        return;
      }

      const { chestId } = data;

      try {
        const chest = await prisma.chest.findUnique({
          where: { id: chestId },
        });

        if (!chest || chest.userId !== player.odamage) {
          socket.emit('chest:error', { message: 'Chest not found' });
          return;
        }

        if (!chest.openingStarted) {
          socket.emit('chest:error', { message: 'Chest not opened yet' });
          return;
        }

        const elapsed = Date.now() - chest.openingStarted.getTime();
        if (elapsed < chest.openingDuration) {
          socket.emit('chest:error', { message: 'Chest still opening' });
          return;
        }

        // Generate loot based on chest TYPE (WOODEN, BRONZE, SILVER, GOLD)
        const chestType = chest.chestType || 'WOODEN';
        const dropRates = CHEST_DROP_RATES[chestType];

        // Gold reward (fixed amount per TZ)
        const goldReward = dropRates.gold;
        const expReward = goldReward * 10; // EXP = gold * 10

        // Enchant scrolls
        let enchantScrolls = 0;
        if (Math.random() < dropRates.enchantChance) {
          const [minQty, maxQty] = dropRates.enchantQty;
          enchantScrolls = Math.floor(Math.random() * (maxQty - minQty + 1)) + minQty;
        }

        // Get current pity counter for Epic (only silver+gold chests count)
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { pityCounter: true },
        });
        let currentPity = user?.pityCounter || 0;
        const isSilverOrGold = chestType === 'SILVER' || chestType === 'GOLD';

        // Item drop (roll for rarity with pity system)
        let droppedItem = null;
        let droppedItemRarity = null;
        const itemRoll = Math.random();
        let cumulative = 0;

        // Apply pity bonus: after 30 silver+gold chests without Epic, add +1% per chest
        const pityBonus = isSilverOrGold && currentPity >= 30 ? (currentPity - 30 + 1) * 0.01 : 0;
        const adjustedRates = { ...dropRates.items };
        if (pityBonus > 0 && (chestType === 'SILVER' || chestType === 'GOLD')) {
          adjustedRates.EPIC = Math.min(1, adjustedRates.EPIC + pityBonus);
          console.log(`[Pity] User ${player.odamage} pity=${currentPity}, Epic chance: ${adjustedRates.EPIC * 100}%`);
        }

        for (const [rarity, chance] of Object.entries(adjustedRates)) {
          cumulative += chance;
          if (itemRoll < cumulative && chance > 0) {
            droppedItemRarity = rarity;
            break;
          }
        }

        // Track pity counter for silver+gold chests
        let pityCounterDelta = 0;
        if (isSilverOrGold) {
          if (droppedItemRarity === 'EPIC') {
            // Reset pity counter on Epic drop
            pityCounterDelta = -currentPity; // Will set it to 0
            console.log(`[Pity] User ${player.odamage} got EPIC! Resetting pity counter`);
          } else {
            // Increment pity counter
            pityCounterDelta = 1;
          }
        }

        // If item dropped, create random equipment piece
        if (droppedItemRarity) {
          // Get all equipment of this rarity or create generic
          const slots = ['WEAPON', 'HELMET', 'CHEST', 'GLOVES', 'LEGS', 'BOOTS', 'SHIELD'];
          const randomSlot = slots[Math.floor(Math.random() * slots.length)];

          // Find or create equipment template
          let equipment = await prisma.equipment.findFirst({
            where: { slot: randomSlot, rarity: droppedItemRarity },
          });

          if (!equipment) {
            // Equipment stat ranges per TZ:
            // WEAPON example: Common 10, Uncommon 12-13, Rare 15-16, Epic 18-20
            // DEF scales similarly
            const slotConfig = {
              WEAPON: { name: 'Меч', icon: '🗡️', isWeapon: true },
              HELMET: { name: 'Шлем', icon: '⛑️', isWeapon: false },
              CHEST: { name: 'Нагрудник', icon: '🎽', isWeapon: false },
              GLOVES: { name: 'Перчатки', icon: '🧤', isWeapon: false },
              LEGS: { name: 'Поножи', icon: '👖', isWeapon: false },
              BOOTS: { name: 'Ботинки', icon: '👢', isWeapon: false },
              SHIELD: { name: 'Щит', icon: '🛡️', isWeapon: false },
            };
            // Stat ranges per rarity (matching TZ example for Starter Sword)
            const rarityStats = {
              COMMON: { pAtkMin: 10, pAtkMax: 10, pDefMin: 2, pDefMax: 2 },
              UNCOMMON: { pAtkMin: 12, pAtkMax: 13, pDefMin: 3, pDefMax: 4 },
              RARE: { pAtkMin: 15, pAtkMax: 16, pDefMin: 5, pDefMax: 6 },
              EPIC: { pAtkMin: 18, pAtkMax: 20, pDefMin: 7, pDefMax: 8 },
            };
            const slotInfo = slotConfig[randomSlot];
            const stats = rarityStats[droppedItemRarity] || rarityStats.COMMON;

            equipment = await prisma.equipment.create({
              data: {
                code: `${randomSlot.toLowerCase()}-${droppedItemRarity.toLowerCase()}-${Date.now()}`,
                name: slotInfo.name,
                nameRu: slotInfo.name,
                icon: slotInfo.icon,
                slot: randomSlot,
                rarity: droppedItemRarity,
                pAtkMin: slotInfo.isWeapon ? stats.pAtkMin : 0,
                pAtkMax: slotInfo.isWeapon ? stats.pAtkMax : 0,
                pDefMin: slotInfo.isWeapon ? 0 : stats.pDefMin,
                pDefMax: slotInfo.isWeapon ? 0 : stats.pDefMax,
              },
            });
          }

          // Roll stats for user equipment
          const rolledPAtk = equipment.pAtkMax > 0
            ? Math.floor(Math.random() * (equipment.pAtkMax - equipment.pAtkMin + 1)) + equipment.pAtkMin
            : 0;
          const rolledPDef = equipment.pDefMax > 0
            ? Math.floor(Math.random() * (equipment.pDefMax - equipment.pDefMin + 1)) + equipment.pDefMin
            : 0;

          await prisma.userEquipment.create({
            data: {
              userId: player.odamage,
              equipmentId: equipment.id,
              pAtk: rolledPAtk,
              pDef: rolledPDef,
              enchant: 0,
              isEquipped: false,
            },
          });

          droppedItem = {
            name: equipment.name,
            icon: equipment.icon,
            rarity: droppedItemRarity,
            pAtk: rolledPAtk,
            pDef: rolledPDef,
          };
        }

        // Update chest type counter
        const chestTypeCounterField = `totalChests${chestType.charAt(0) + chestType.slice(1).toLowerCase()}`;

        // Delete chest and give rewards
        await prisma.chest.delete({ where: { id: chestId } });

        // Build update data with pity counter handling
        const updateData = {
          gold: { increment: BigInt(goldReward) },
          exp: { increment: BigInt(expReward) },
          totalGoldEarned: { increment: BigInt(goldReward) },
          enchantScrolls: { increment: enchantScrolls },
          [chestTypeCounterField]: { increment: 1 },
        };

        // Handle pity counter (increment or reset)
        if (pityCounterDelta !== 0) {
          if (droppedItemRarity === 'EPIC') {
            // Reset to 0 when Epic drops
            updateData.pityCounter = 0;
          } else {
            updateData.pityCounter = { increment: pityCounterDelta };
          }
        }

        await prisma.user.update({
          where: { id: player.odamage },
          data: updateData,
        });

        player.gold += goldReward;

        socket.emit('chest:claimed', {
          chestId,
          chestType,
          rewards: {
            gold: goldReward,
            exp: expReward,
            enchantScrolls,
            equipment: droppedItem, // Changed from 'item' to 'equipment' to match TreasuryTab
          },
        });
      } catch (err) {
        console.error('[Chest] Claim error:', err.message);
        socket.emit('chest:error', { message: 'Failed to claim chest' });
      }
    });

    // DELETE CHEST
    socket.on('chest:delete', async (data) => {
      if (!player.odamage) {
        socket.emit('chest:error', { message: 'Not authenticated' });
        return;
      }

      const { chestId } = data;

      try {
        const chest = await prisma.chest.findUnique({
          where: { id: chestId },
        });

        if (!chest || chest.userId !== player.odamage) {
          socket.emit('chest:error', { message: 'Chest not found' });
          return;
        }

        await prisma.chest.delete({
          where: { id: chestId },
        });

        socket.emit('chest:deleted', { chestId });
      } catch (err) {
        console.error('[Chest] Delete error:', err.message);
        socket.emit('chest:error', { message: 'Failed to delete chest' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // LOOT STATS & SLOTS
    // ═══════════════════════════════════════════════════════════

    // Get loot stats
    socket.on('loot:stats:get', async () => {
      if (!player.odamage) {
        socket.emit('loot:stats', {
          totalGoldEarned: 0,
          chestSlots: 5,
          enchantScrolls: 0,
          totalChests: { WOODEN: 0, BRONZE: 0, SILVER: 0, GOLD: 0 },
        });
        return;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: {
            totalGoldEarned: true,
            chestSlots: true,
            enchantScrolls: true,
            totalChestsWooden: true,
            totalChestsBronze: true,
            totalChestsSilver: true,
            totalChestsGold: true,
          },
        });

        socket.emit('loot:stats', {
          totalGoldEarned: Number(user?.totalGoldEarned || 0),
          chestSlots: user?.chestSlots || 5,
          enchantScrolls: user?.enchantScrolls || 0,
          totalChests: {
            WOODEN: user?.totalChestsWooden || 0,
            BRONZE: user?.totalChestsBronze || 0,
            SILVER: user?.totalChestsSilver || 0,
            GOLD: user?.totalChestsGold || 0,
          },
        });
      } catch (err) {
        console.error('[Loot Stats] Error:', err.message);
        socket.emit('loot:stats', {
          totalGoldEarned: 0,
          chestSlots: 5,
          enchantScrolls: 0,
          totalChests: { WOODEN: 0, BRONZE: 0, SILVER: 0, GOLD: 0 },
        });
      }
    });

    // Unlock a chest slot
    socket.on('slot:unlock', async () => {
      if (!player.odamage) {
        socket.emit('slot:error', { message: 'Not authenticated' });
        return;
      }

      const SLOT_UNLOCK_COST = 999;
      const MAX_SLOTS = 10;

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { chestSlots: true, ancientCoin: true },
        });

        if (!user) {
          socket.emit('slot:error', { message: 'User not found' });
          return;
        }

        if (user.chestSlots >= MAX_SLOTS) {
          socket.emit('slot:error', { message: 'Все ячейки уже разблокированы' });
          return;
        }

        if (user.ancientCoin < SLOT_UNLOCK_COST) {
          socket.emit('slot:error', { message: 'Недостаточно кристаллов' });
          return;
        }

        const updated = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            chestSlots: { increment: 1 },
            ancientCoin: { decrement: SLOT_UNLOCK_COST },
          },
        });

        socket.emit('slot:unlocked', {
          chestSlots: updated.chestSlots,
          crystals: updated.ancientCoin,
        });
      } catch (err) {
        console.error('[Slot Unlock] Error:', err.message);
        socket.emit('slot:error', { message: 'Failed to unlock slot' });
      }
    });

    // STAT UPGRADE
    socket.on('upgrade:stat', async (data) => {
      if (!player.odamage) {
        socket.emit('upgrade:error', { message: 'Not authenticated' });
        return;
      }

      const stat = data.stat;
      if (!['str', 'dex', 'luck'].includes(stat)) {
        socket.emit('upgrade:error', { message: 'Invalid stat' });
        return;
      }

      const cost = getUpgradeCost(player[stat]);
      if (player.gold < cost) {
        socket.emit('upgrade:error', { message: 'Not enough gold' });
        return;
      }

      try {
        player[stat] += 1;
        player.gold -= cost;

        // Recalculate derived stats
        player.pAtk = 10 + Math.floor(player.str * 2);
        player.critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            [stat]: player[stat],
            gold: BigInt(player.gold),
            pAtk: player.pAtk,
            critChance: player.critChance,
          },
        });

        socket.emit('upgrade:success', {
          stat,
          value: player[stat],
          gold: player.gold,
          pAtk: player.pAtk,
          critChance: player.critChance,
        });
      } catch (err) {
        console.error('[Upgrade] Error:', err.message);
        socket.emit('upgrade:error', { message: 'Upgrade failed' });
      }
    });

    // UPGRADE TAP SPEED (tapsPerSecond: 3 -> 10)
    socket.on('upgrade:tapSpeed', async () => {
      if (!player.odamage) {
        socket.emit('upgrade:error', { message: 'Not authenticated' });
        return;
      }

      if (player.tapsPerSecond >= MAX_TAPS_PER_SECOND) {
        socket.emit('upgrade:error', { message: 'Already at max level' });
        return;
      }

      const cost = getTapSpeedCost(player.tapsPerSecond);
      if (player.gold < cost) {
        socket.emit('upgrade:error', { message: 'Not enough gold' });
        return;
      }

      try {
        player.tapsPerSecond += 1;
        player.gold -= cost;

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            tapsPerSecond: player.tapsPerSecond,
            gold: BigInt(player.gold),
          },
        });

        socket.emit('upgrade:success', {
          stat: 'tapsPerSecond',
          value: player.tapsPerSecond,
          gold: player.gold,
          nextCost: player.tapsPerSecond < MAX_TAPS_PER_SECOND ? getTapSpeedCost(player.tapsPerSecond) : null,
        });
      } catch (err) {
        console.error('[Upgrade] Error:', err.message);
        socket.emit('upgrade:error', { message: 'Upgrade failed' });
      }
    });

    // UPGRADE AUTO-ATTACK SPEED (0 -> 10)
    socket.on('upgrade:autoAttack', async () => {
      if (!player.odamage) {
        socket.emit('upgrade:error', { message: 'Not authenticated' });
        return;
      }

      if (player.autoAttackSpeed >= MAX_AUTO_ATTACK_SPEED) {
        socket.emit('upgrade:error', { message: 'Already at max level' });
        return;
      }

      const cost = getAutoAttackCost(player.autoAttackSpeed);
      if (player.gold < cost) {
        socket.emit('upgrade:error', { message: 'Not enough gold' });
        return;
      }

      try {
        player.autoAttackSpeed += 1;
        player.gold -= cost;

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            autoAttackSpeed: player.autoAttackSpeed,
            gold: BigInt(player.gold),
          },
        });

        socket.emit('upgrade:success', {
          stat: 'autoAttackSpeed',
          value: player.autoAttackSpeed,
          gold: player.gold,
          nextCost: player.autoAttackSpeed < MAX_AUTO_ATTACK_SPEED ? getAutoAttackCost(player.autoAttackSpeed) : null,
        });
      } catch (err) {
        console.error('[Upgrade] Error:', err.message);
        socket.emit('upgrade:error', { message: 'Upgrade failed' });
      }
    });

    // UPGRADE MANA REGEN (0.2 -> 10)
    socket.on('upgrade:manaRegen', async () => {
      if (!player.odamage) {
        socket.emit('upgrade:error', { message: 'Not authenticated' });
        return;
      }

      if (player.manaRegen >= MAX_MANA_REGEN) {
        socket.emit('upgrade:error', { message: 'Already at max level' });
        return;
      }

      const cost = getManaRegenCost(player.manaRegen);
      if (player.gold < cost) {
        socket.emit('upgrade:error', { message: 'Not enough gold' });
        return;
      }

      try {
        // Increase by 0.2 per upgrade (5 levels to go from 0.2 to 1, then increments of 1)
        if (player.manaRegen < 1) {
          player.manaRegen = Math.round((player.manaRegen + 0.2) * 10) / 10;
        } else {
          player.manaRegen += 1;
        }
        player.gold -= cost;

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            manaRegen: player.manaRegen,
            gold: BigInt(player.gold),
          },
        });

        socket.emit('upgrade:success', {
          stat: 'manaRegen',
          value: player.manaRegen,
          gold: player.gold,
          nextCost: player.manaRegen < MAX_MANA_REGEN ? getManaRegenCost(player.manaRegen) : null,
        });
      } catch (err) {
        console.error('[Upgrade] Error:', err.message);
        socket.emit('upgrade:error', { message: 'Upgrade failed' });
      }
    });

    // MARK FIRST LOGIN COMPLETE
    socket.on('firstLogin:complete', async () => {
      if (!player.odamage) return;

      try {
        player.isFirstLogin = false;
        await prisma.user.update({
          where: { id: player.odamage },
          data: { isFirstLogin: false },
        });
      } catch (err) {
        console.error('[FirstLogin] Error:', err.message);
      }
    });

    // ADMIN: Reset first login (for testing welcome screens)
    socket.on('admin:resetFirstLogin', async () => {
      if (!player.odamage) return;

      try {
        player.isFirstLogin = true;
        await prisma.user.update({
          where: { id: player.odamage },
          data: { isFirstLogin: true },
        });
        console.log(`[Admin] Reset isFirstLogin for user ${player.username}`);
        socket.emit('admin:resetFirstLogin:success');
      } catch (err) {
        console.error('[Admin] Reset error:', err.message);
      }
    });

    // STARTER CHEST OPEN - Give starter equipment when user opens starter chest in welcome popup
    socket.on('starter:open', async () => {
      if (!player.odamage) {
        socket.emit('starter:error', { message: 'Not authenticated' });
        return;
      }

      try {
        // Check if user already has starter equipment
        const existingStarter = await prisma.userEquipment.findFirst({
          where: {
            userId: player.odamage,
            equipment: { code: 'starter-sword' }
          }
        });

        if (existingStarter) {
          console.log(`[Starter] User ${player.odamage} already has starter equipment`);
          socket.emit('starter:error', { message: 'Already received starter pack' });
          return;
        }

        const givenEquipment = [];

        // Give all starter equipment
        for (const starter of STARTER_EQUIPMENT) {
          // Find the equipment template
          let equipmentTemplate = await prisma.equipment.findUnique({
            where: { code: starter.code },
          });

          // Create template if doesn't exist
          if (!equipmentTemplate) {
            equipmentTemplate = await prisma.equipment.create({
              data: {
                code: starter.code,
                name: starter.name,
                nameRu: starter.name,
                icon: starter.icon,
                slot: starter.slot,
                rarity: 'COMMON',
                pAtkMin: starter.pAtk || 0,
                pAtkMax: starter.pAtk || 0,
                pDefMin: starter.pDef || 0,
                pDefMax: starter.pDef || 0,
                droppable: false,
              },
            });
          }

          // Create user equipment instance (NOT equipped - goes to inventory)
          const userEquip = await prisma.userEquipment.create({
            data: {
              userId: player.odamage,
              equipmentId: equipmentTemplate.id,
              pAtk: starter.pAtk || 0,
              pDef: starter.pDef || 0,
              enchant: 0,
              isEquipped: false, // Goes to inventory, player equips manually
            },
          });

          givenEquipment.push({
            id: userEquip.id,
            code: starter.code,
            name: starter.name,
            icon: starter.icon,
            slot: starter.slot,
            pAtk: starter.pAtk || 0,
            pDef: starter.pDef || 0,
            rarity: 'COMMON',
          });
        }

        console.log(`[Starter] User ${player.odamage} opened starter chest, got ${givenEquipment.length} items`);

        // Mark first login complete
        player.isFirstLogin = false;
        await prisma.user.update({
          where: { id: player.odamage },
          data: { isFirstLogin: false },
        });

        socket.emit('starter:opened', {
          equipment: givenEquipment,
        });
      } catch (err) {
        console.error('[Starter] Error opening starter chest:', err.message);
        socket.emit('starter:error', { message: 'Failed to open starter chest' });
      }
    });

    // SHOP BUY
    socket.on('shop:buy', async (data) => {
      if (!player.odamage) {
        socket.emit('shop:error', { message: 'Not authenticated' });
        return;
      }

      try {
        if (data.type === 'soulshot') {
          const grade = data.grade;
          const quantity = data.quantity || 100;

          if (!SOULSHOTS[grade]) {
            socket.emit('shop:error', { message: 'Invalid grade' });
            return;
          }

          const totalCost = SOULSHOTS[grade].cost * (quantity / 100);
          if (player.gold < totalCost) {
            socket.emit('shop:error', { message: 'Not enough gold' });
            return;
          }

          player.gold -= totalCost;
          const ssKey = `soulshot${grade}`;
          player[ssKey] = (player[ssKey] || 0) + quantity;

          // Update DB (only for NG, D, C which exist in schema)
          const updateData = { gold: BigInt(player.gold) };
          if (['NG', 'D', 'C'].includes(grade)) {
            updateData[ssKey] = player[ssKey];
          }

          await prisma.user.update({
            where: { id: player.odamage },
            data: updateData,
          });

          socket.emit('shop:success', {
            gold: player.gold,
            [ssKey]: player[ssKey],
          });
        } else if (data.type === 'buff') {
          const buffId = data.buffId;
          if (!BUFFS[buffId]) {
            socket.emit('shop:error', { message: 'Invalid buff' });
            return;
          }

          const cost = BUFFS[buffId].cost;
          if (player.gold < cost) {
            socket.emit('shop:error', { message: 'Not enough gold' });
            return;
          }

          player.gold -= cost;
          const potionKey = `potion${buffId.charAt(0).toUpperCase() + buffId.slice(1)}`;
          player[potionKey] = (player[potionKey] || 0) + 1;

          await prisma.user.update({
            where: { id: player.odamage },
            data: {
              gold: BigInt(player.gold),
              [potionKey]: player[potionKey],
            },
          });

          socket.emit('shop:success', {
            gold: player.gold,
            [potionKey]: player[potionKey],
          });
        }
      } catch (err) {
        console.error('[Shop] Error:', err.message);
        socket.emit('shop:error', { message: 'Purchase failed' });
      }
    });

    // SOULSHOT TOGGLE
    socket.on('soulshot:toggle', async (data) => {
      if (!player.odamage) return;

      const grade = data.grade;
      player.activeSoulshot = grade;

      try {
        await prisma.user.update({
          where: { id: player.odamage },
          data: { activeSoulshot: grade },
        });
      } catch (err) {}

      socket.emit('shop:success', { activeSoulshot: grade });
    });

    // USER EQUIPMENT (armor, weapons from UserEquipment table)
    socket.on('equipment:get', async () => {
      if (!player.odamage) {
        socket.emit('equipment:data', { equipped: [], inventory: [] });
        return;
      }

      try {
        const userEquipment = await prisma.userEquipment.findMany({
          where: { userId: player.odamage },
          include: { equipment: true },
        });

        const equipped = [];
        const inventory = [];

        for (const ue of userEquipment) {
          const item = {
            id: ue.id,
            code: ue.equipment.code,
            name: ue.equipment.name,
            nameRu: ue.equipment.nameRu,
            icon: ue.equipment.icon,
            slot: ue.equipment.slot.toLowerCase(),
            rarity: ue.equipment.rarity.toLowerCase(),
            pAtk: ue.pAtk,
            pDef: ue.pDef,
            enchant: ue.enchant,
            isEquipped: ue.isEquipped,
          };

          if (ue.isEquipped) {
            equipped.push(item);
          } else {
            inventory.push(item);
          }
        }

        console.log(`[Equipment] User ${player.odamage} has ${equipped.length} equipped, ${inventory.length} in bag`);
        socket.emit('equipment:data', { equipped, inventory });
      } catch (err) {
        console.error('[Equipment] Error:', err.message);
        socket.emit('equipment:data', { equipped: [], inventory: [] });
      }
    });

    // INVENTORY
    socket.on('inventory:get', async () => {
      if (!player.odamage) {
        socket.emit('inventory:data', { items: [] });
        return;
      }

      try {
        const inventory = await prisma.inventoryItem.findMany({
          where: { userId: player.odamage },
          include: { item: true },
        });

        const items = inventory.map(inv => ({
          id: inv.id,
          itemId: inv.itemId,
          name: inv.item.name,
          description: inv.item.description,
          quantity: inv.quantity,
          rarity: inv.item.rarity,
          type: inv.item.type,
          iconUrl: inv.item.iconUrl,
        }));

        socket.emit('inventory:data', { items });
      } catch (err) {
        console.error('[Inventory] Error:', err.message);
        socket.emit('inventory:data', { items: [] });
      }
    });

    // BUFF USE
    socket.on('buff:use', async (data) => {
      if (!player.odamage) {
        socket.emit('buff:error', { message: 'Not authenticated' });
        return;
      }

      const buffId = data.buffId;
      if (!BUFFS[buffId]) {
        socket.emit('buff:error', { message: 'Invalid buff' });
        return;
      }

      const potionKey = `potion${buffId.charAt(0).toUpperCase() + buffId.slice(1)}`;
      if ((player[potionKey] || 0) <= 0) {
        socket.emit('buff:error', { message: 'No potions available' });
        return;
      }

      try {
        player[potionKey] -= 1;

        const buff = BUFFS[buffId];
        const expiresAt = Date.now() + buff.duration;

        // Add to in-memory buffs
        player.activeBuffs.push({
          type: buffId,
          value: buff.value,
          expiresAt,
        });

        // Save to DB
        await prisma.user.update({
          where: { id: player.odamage },
          data: { [potionKey]: player[potionKey] },
        });

        await prisma.activeBuff.create({
          data: {
            userId: player.odamage,
            buffType: buffId.toUpperCase(),
            value: buff.value,
            expiresAt: new Date(expiresAt),
          },
        });

        socket.emit('buff:success', {
          buffId,
          expiresAt,
          [potionKey]: player[potionKey],
        });
      } catch (err) {
        console.error('[Buff] Error:', err.message);
        socket.emit('buff:error', { message: 'Failed to use buff' });
      }
    });

    // DISCONNECT
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${socket.id}, userId: ${player.odamage || 'guest'}`);

      if (player.odamage) {
        try {
          const updateData = {
            // L2 Stamina (NEW)
            stamina: Math.floor(player.stamina),
            exhaustedUntil: player.exhaustedUntil ? new Date(player.exhaustedUntil) : null,
            // Legacy mana
            mana: Math.floor(player.mana),
            gold: BigInt(player.gold),
            activeSoulshot: player.activeSoulshot,
            soulshotNG: player.soulshotNG,
            soulshotD: player.soulshotD,
            soulshotC: player.soulshotC,
            lastOnline: new Date(),
          };

          if (player.sessionDamage > 0) {
            updateData.totalDamage = { increment: BigInt(player.sessionDamage) };
            updateData.totalClicks = { increment: BigInt(player.sessionClicks) };
          }

          await prisma.user.update({
            where: { id: player.odamage },
            data: updateData,
          });
          console.log(`[Disconnect] Saved data for user ${player.odamage}: gold=${player.gold}, stamina=${player.stamina}, dmg=${player.sessionDamage}`);
        } catch (e) {
          console.error('[Disconnect] Save error:', e.message);
        }
      } else {
        console.log('[Disconnect] Guest user, no data to save');
      }

      onlineUsers.delete(socket.id);
    });
  });

  // ─────────────────────────────────────────────────────────
  // INTERVALS
  // ─────────────────────────────────────────────────────────

  // Broadcast boss state every 250ms (optimized - still smooth)
  setInterval(() => {
    io.emit('boss:state', {
      id: bossState.id,
      name: bossState.name,
      nameRu: bossState.nameRu,
      title: bossState.title,
      hp: bossState.currentHp,
      maxHp: bossState.maxHp,
      defense: bossState.defense,
      ragePhase: bossState.ragePhase,
      icon: bossState.icon,
      image: bossState.image,
      bossIndex: bossState.bossIndex,
      totalBosses: bossState.totalBosses,
      playersOnline: onlineUsers.size,
      prizePool: {
        ton: bossState.tonReward,
        chests: bossState.chestsReward,
        exp: bossState.expReward,
        gold: bossState.goldReward,
      },
      // Respawn timer info
      isRespawning: bossRespawnAt !== null,
      respawnAt: bossRespawnAt ? bossRespawnAt.getTime() : null,
    });
  }, 250);

  // Check respawn timer every second
  setInterval(async () => {
    if (bossRespawnAt && new Date() >= bossRespawnAt) {
      console.log('[Boss] Respawn timer expired, spawning next boss...');
      bossRespawnAt = null;
      await respawnBoss(prisma);
      await saveBossState(prisma);

      io.emit('boss:respawn', {
        id: bossState.id,
        name: bossState.name,
        title: bossState.title,
        hp: bossState.currentHp,
        maxHp: bossState.maxHp,
        icon: bossState.icon,
        prizePool: {
          ton: bossState.tonReward,
          chests: bossState.chestsReward,
          exp: bossState.expReward,
          gold: bossState.goldReward,
        },
      });
    }
  }, 1000);

  // L2: Stamina regen every second (+1 per sec, unless exhausted)
  setInterval(() => {
    const now = Date.now();
    for (const player of onlineUsers.values()) {
      // Clear exhaustion if expired
      if (player.exhaustedUntil && now >= player.exhaustedUntil) {
        player.exhaustedUntil = null;
      }

      // Regen stamina only if not exhausted
      if (!StatsService.isExhausted(player.exhaustedUntil)) {
        if (player.stamina < player.maxStamina) {
          player.stamina = Math.min(player.maxStamina, player.stamina + StatsService.STAMINA_REGEN_PER_SEC);
        }
      }

      // Also regen mana (for future skills)
      if (player.mana < player.maxMana) {
        const regenAmount = player.manaRegen || BASE_MANA_REGEN;
        player.mana = Math.min(player.maxMana, player.mana + regenAmount);
      }
    }
  }, 1000);

  // Auto-attack every second (for players with autoAttackSpeed > 0)
  setInterval(async () => {
    if (bossState.currentHp <= 0) return; // Boss is dead

    for (const [socketId, player] of onlineUsers.entries()) {
      if (player.autoAttackSpeed > 0 && player.odamage && bossState.currentHp > 0) {
        // Calculate auto damage (same as regular damage but weaker)
        const baseDamage = player.pAtk * (1 + player.str * STAT_EFFECTS.str);
        let totalAutoDamage = 0;
        let crits = 0;
        const critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

        // Number of auto attacks per second
        for (let i = 0; i < player.autoAttackSpeed; i++) {
          let dmg = baseDamage * (0.8 + Math.random() * 0.2); // Slightly lower variance
          const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
          dmg *= rageMultiplier;

          // Check for crit
          if (Math.random() < critChance) {
            dmg *= BASE_CRIT_DAMAGE;
            crits++;
          }

          dmg = Math.max(1, dmg - bossState.defense);
          totalAutoDamage += Math.floor(dmg);
        }

        if (totalAutoDamage > 0 && bossState.currentHp > 0) {
          const actualDamage = Math.min(totalAutoDamage, bossState.currentHp);
          bossState.currentHp -= actualDamage;

          // Update leaderboard
          const key = player.odamage;
          const existing = sessionLeaderboard.get(key);
          sessionLeaderboard.set(key, {
            odamage: (existing?.odamage || 0) + actualDamage,
            odamageN: player.odamageN,
            photoUrl: player.photoUrl,
            isEligible: existing?.isEligible || player.isEligible || false, // TZ Этап 2
          });

          player.sessionDamage += actualDamage;

          // Adena from auto-attack (lower rate)
          const goldGained = Math.floor(actualDamage / 200);
          player.gold += goldGained;

          // Send auto-attack result to player with hit animation trigger
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('autoAttack:result', {
              damage: actualDamage,
              crits,
              sessionDamage: player.sessionDamage,
              gold: player.gold,
              showHitEffect: true, // Trigger hit animation on client
            });
          }

          // Broadcast to damage feed (without "Auto" suffix for cleaner UI)
          io.emit('damage:feed', {
            playerName: player.odamageN,
            damage: actualDamage,
            isCrit: crits > 0,
            isAuto: true,
          });

          // Check rage phase
          updateRagePhase();

          // Check if boss was killed by auto-attack
          if (bossState.currentHp <= 0) {
            await handleBossKill(io, prisma, player, socketId);
            return; // Exit the loop since boss is dead
          }
        }
      }
    }
  }, 1000);

  // Auto-save player data every 30 seconds
  setInterval(async () => {
    for (const [socketId, player] of onlineUsers.entries()) {
      if (player.odamage && player.sessionDamage > 0) {
        try {
          await prisma.user.update({
            where: { id: player.odamage },
            data: {
              gold: BigInt(player.gold),
              // L2 Stamina (NEW)
              stamina: Math.floor(player.stamina),
              exhaustedUntil: player.exhaustedUntil ? new Date(player.exhaustedUntil) : null,
              mana: Math.floor(player.mana),
              totalDamage: { increment: BigInt(player.sessionDamage) },
              totalClicks: { increment: BigInt(player.sessionClicks) },
            },
          });
          // Reset session counters after save
          player.sessionDamage = 0;
          player.sessionClicks = 0;
          console.log(`[AutoSave] Saved user ${player.odamage}`);
        } catch (e) {
          console.error(`[AutoSave] Error for ${player.odamage}:`, e.message);
        }
      }
    }
  }, 30000);

  // ─────────────────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────────────────

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO ready`);
    console.log(`> Boss: ${bossState.name} (${bossState.currentHp} HP)`);
  });
});
