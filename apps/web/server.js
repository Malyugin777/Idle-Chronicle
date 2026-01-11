const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { exec } = require('child_process');

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

// ═══════════════════════════════════════════════════════════
// BOSS DAMPENING SYSTEM - ensures boss lives at least 24 hours
// ═══════════════════════════════════════════════════════════
const BOSS_MIN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours minimum
const DAMPENING_MIN_MULT = 0.15; // Minimum damage multiplier
const DAMPENING_MAX_MULT = 1.0; // Maximum (no dampening)
const DPS_EMA_ALPHA = 0.10; // Smoothing factor for DPS EMA
const DPS_SAMPLE_INTERVAL_MS = 60 * 1000; // Sample DPS every 60 seconds
const DAMPENING_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // Update multiplier every 5 minutes

// Game finished flag
let gameFinished = false;

// Debug mode: after boss 4, always spawn boss 1 (Serpent)
let debugMode = false;

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
  totalBosses: 4, // 4 уникальных босса, потом debug mode
  // Rewards
  goldReward: 1000,
  expReward: 1000000,
  tonReward: 10,
  chestsReward: 10,
  // Dampening state
  bossStartAt: Date.now(),
  bossTargetEndAt: Date.now() + BOSS_MIN_DURATION_MS,
  bossDamageMultiplier: 1.0,
  dpsEma: 0,
  lastDpsSampleAt: Date.now(),
  lastTotalDamageSample: 0,
  totalDamageDealt: 0, // Track total damage for dampening
};

// Previous boss session data for leaderboard
let previousBossSession = null;

// Respawn timer (null = boss alive, Date = respawning)
let bossRespawnAt = null;
const BOSS_RESPAWN_TIME_MS = 30 * 1000; // 30 секунд (TZ: респавн 30 сек)

const onlineUsers = new Map();
const sessionLeaderboard = new Map();

// FIX: Track last heartbeat by userId (not just socket) to prevent false offline
const userLastHeartbeat = new Map(); // userId -> timestamp

// ═══════════════════════════════════════════════════════════
// ADMIN LOG BUFFER (for viewing logs without Railway access)
// ═══════════════════════════════════════════════════════════

const LOG_BUFFER_SIZE = 1000;
const logBuffer = [];

// Stats counters for admin dashboard
const gameStats = {
  // Forge stats
  forge: {
    totalSalvaged: 0,
    dustGenerated: 0,
    fusionCommon: 0,
    fusionUncommon: 0,
    fusionRare: 0,
    itemsBroken: 0,
    itemsRestored: 0,
    itemsExpired: 0,
  },
  // Enchant stats
  enchant: {
    attempts: {},      // { '+1': { success: 0, fail: 0 }, ... }
    protectionUsed: 0,
    highestEnchant: 0,
    topItems: [],      // [{ item, level, owner }]
  },
  // Ether stats
  ether: {
    totalInGame: 0,
    usedToday: 0,
    craftedToday: 0,
    dustGenerated: 0,
    lastReset: Date.now(),
  },
};

function addLog(level, category, message, data = null) {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    timestamp: Date.now(),
    time: new Date().toISOString(),
    level,      // 'info' | 'warn' | 'error' | 'debug'
    category,   // 'auth' | 'boss' | 'reward' | 'forge' | 'enchant' | 'ether' | 'system'
    message,
    data
  };

  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Also log to console with color
  const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
  const color = colors[level] || '\x1b[0m';
  console.log(`${color}[${category.toUpperCase()}]\x1b[0m ${message}`, data ? JSON.stringify(data) : '');
}

// Reset daily stats at midnight
function resetDailyStats() {
  const now = Date.now();
  const lastReset = gameStats.ether.lastReset;
  const dayMs = 24 * 60 * 60 * 1000;

  if (now - lastReset > dayMs) {
    gameStats.ether.usedToday = 0;
    gameStats.ether.craftedToday = 0;
    gameStats.ether.lastReset = now;
    addLog('info', 'system', 'Daily stats reset');
  }
}

// ═══════════════════════════════════════════════════════════
// BOSS STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════

async function loadBossState(prisma) {
  try {
    console.log('[Boss] Loading state from DB...');
    const state = await prisma.gameState.findUnique({ where: { id: 'singleton' } });
    if (!state) {
      console.log('[Boss] ⚠️ No gameState record found in DB! Will spawn fresh boss.');
      addLog('warn', 'boss', 'No gameState found - spawning fresh boss');
      return false;
    }

    // Debug: Log ALL GameState values
    console.log('[Boss] === GameState from DB ===');
    console.log(`[Boss]   currentBossIndex: ${state.currentBossIndex}`);
    console.log(`[Boss]   bossCurrentHp: ${state.bossCurrentHp} (type: ${typeof state.bossCurrentHp})`);
    console.log(`[Boss]   bossMaxHp: ${state.bossMaxHp} (type: ${typeof state.bossMaxHp})`);
    console.log(`[Boss]   respawnAt: ${state.respawnAt} (type: ${typeof state.respawnAt})`);
    console.log(`[Boss]   bossName: ${state.bossName}`);
    console.log('[Boss] ========================');

    // Check if boss is respawning
    const now = new Date();
    const respawnAtDate = state.respawnAt ? new Date(state.respawnAt) : null;
    const isRespawnInFuture = respawnAtDate && respawnAtDate > now;

    // FIX: Ignore old respawn timers > 5 minutes (leftover from old 5-hour code)
    const MAX_VALID_RESPAWN_MS = 5 * 60 * 1000; // 5 minutes max
    const respawnTooFar = respawnAtDate && (respawnAtDate.getTime() - now.getTime()) > MAX_VALID_RESPAWN_MS;

    console.log(`[Boss] Respawn check: respawnAt=${respawnAtDate?.toISOString()}, now=${now.toISOString()}, inFuture=${isRespawnInFuture}, tooFar=${respawnTooFar}`);

    if (isRespawnInFuture && !respawnTooFar) {
      bossRespawnAt = respawnAtDate;
      console.log(`[Boss] ⏰ Boss is in respawn phase until ${bossRespawnAt.toISOString()}`);
      addLog('info', 'boss', 'Loaded respawn timer', { respawnAt: bossRespawnAt.toISOString() });
    } else if (respawnTooFar) {
      console.log(`[Boss] ⚠️ Ignoring old respawn timer (${Math.round((respawnAtDate.getTime() - now.getTime()) / 60000)} min in future) - respawning CURRENT boss`);
      addLog('warn', 'boss', 'Cleared old respawn timer', { was: respawnAtDate.toISOString() });
      return 'respawn_current'; // Respawn current boss (NOT next!) to clear old state
    }

    // Load boss state
    const boss = DEFAULT_BOSSES[state.currentBossIndex] || DEFAULT_BOSSES[0];
    currentBossIndex = state.currentBossIndex;

    // Check if boss HP is 0 and respawn timer expired - need to spawn next boss
    const savedHp = Number(state.bossCurrentHp);
    const needsRespawn = savedHp <= 0 && !bossRespawnAt;

    console.log(`[Boss] HP Decision: savedHp=${savedHp}, bossRespawnAt=${bossRespawnAt ? 'SET' : 'NULL'}, needsRespawn=${needsRespawn}`);

    if (needsRespawn) {
      console.log('[Boss] ⚠️ Boss HP=0 and respawn timer expired, will respawn on startup');
      addLog('warn', 'boss', 'Boss HP=0 with no respawn timer - forcing respawn');
      return 'respawn'; // Signal to respawn
    }

    // Determine which HP to use
    const finalHp = bossRespawnAt ? Number(state.bossMaxHp) : savedHp;
    console.log(`[Boss] HP Assignment: Using ${bossRespawnAt ? 'maxHp (respawn phase)' : 'savedHp'} = ${finalHp}`);

    // ВСЕГДА используем данные из шаблона по currentBossIndex для синхронизации
    const nowMs = Date.now();
    bossState = {
      id: `default-${state.currentBossIndex}`,
      name: boss.name,           // Из шаблона (не из БД!)
      nameRu: boss.nameRu || boss.name,
      title: 'World Boss',
      maxHp: Number(state.bossMaxHp) || boss.hp || 500000,
      currentHp: finalHp || 0,  // Uses savedHp or maxHp based on respawn state
      defense: boss.defense,
      thornsDamage: boss.thornsDamage || 0,
      ragePhase: 0,
      sessionId: null,
      icon: boss.icon,           // Из шаблона (не из БД!)
      image: boss.image || null, // Из шаблона
      bossIndex: state.currentBossIndex + 1,
      totalBosses: 4,
      goldReward: boss.goldReward,
      expReward: boss.expReward,
      tonReward: boss.tonReward || 10,
      chestsReward: boss.chestsReward || 10,
      // v1.3.0: Dampening state (initialize with defaults when loading)
      bossStartAt: nowMs,
      bossTargetEndAt: nowMs + BOSS_MIN_DURATION_MS,
      bossDamageMultiplier: 1.0,
      dpsEma: 0,
      lastDpsSampleAt: nowMs,
      lastTotalDamageSample: 0,
      totalDamageDealt: 0,
    };

    // Load session leaderboard (with backward compatibility + PS fields)
    if (state.sessionLeaderboard && !bossRespawnAt) {
      const saved = state.sessionLeaderboard;
      if (Array.isArray(saved)) {
        sessionLeaderboard.clear();
        for (const entry of saved) {
          // New format: { userId, damage, visitorName, photoUrl, isEligible, ps, lastActionAt, ... }
          if (entry.userId && typeof entry.userId === 'string') {
            sessionLeaderboard.set(entry.userId, {
              damage: entry.damage || 0,
              visitorName: entry.visitorName || 'Unknown',
              photoUrl: entry.photoUrl || null,
              isEligible: entry.isEligible || false,
              // PS fields (new)
              ps: entry.ps || 0,
              lastActionAt: entry.lastActionAt || null,
              lastDamageSnapshot: entry.lastDamageSnapshot || 0,
              skillsUsed: entry.skillsUsed ? new Set(entry.skillsUsed) : new Set(),
            });
          }
          // Old format backward compat: { odamage (was damage), odamageN, ... }
          // Skip corrupted entries where odamage is a number (was damage value)
          else if (entry.odamage && typeof entry.odamage === 'string' && entry.odamage.length > 10) {
            // Looks like a cuid, use as userId
            sessionLeaderboard.set(entry.odamage, {
              damage: entry.damage || entry.odamage_value || 0,
              visitorName: entry.odamageN || entry.visitorName || 'Unknown',
              photoUrl: entry.photoUrl || null,
              isEligible: entry.isEligible || false,
              // PS fields (new, default values for old format)
              ps: 0,
              lastActionAt: null,
              lastDamageSnapshot: 0,
              skillsUsed: new Set(),
            });
          }
          // else: corrupted entry with numeric odamage, skip it
        }
        console.log(`[Boss] Loaded ${sessionLeaderboard.size} leaderboard entries`);
      }
    }

    // Load previous boss session
    if (state.previousBossSession) {
      previousBossSession = state.previousBossSession;
      console.log('[Boss] Loaded previous boss session');
    }

    const hpPercent = ((bossState.currentHp / bossState.maxHp) * 100).toFixed(1);
    console.log(`[Boss] ✅ Loaded state: ${bossState.name} HP=${bossState.currentHp}/${bossState.maxHp} (${hpPercent}%)`);
    addLog('info', 'boss', `Loaded from DB: ${bossState.name} HP ${hpPercent}%`, {
      currentHp: bossState.currentHp,
      maxHp: bossState.maxHp,
      bossIndex: currentBossIndex,
      hadRespawnTimer: !!bossRespawnAt,
    });
    return true;
  } catch (err) {
    console.error('[Boss] ❌ Load state error:', err.message);
    addLog('error', 'boss', 'Load state failed', { error: err.message });
    return false;
  }
}

// Debounced save - сохраняем через 500ms после последнего урона
let bossSaveTimeout = null;
let lastBossSaveTime = 0;

function scheduleBossSave(prisma) {
  // Если уже запланировано - не добавляем новый таймер
  if (bossSaveTimeout) return;

  // Ограничиваем частоту - не чаще раз в 500ms
  const now = Date.now();
  const timeSinceLastSave = now - lastBossSaveTime;
  const delay = Math.max(0, 500 - timeSinceLastSave);

  bossSaveTimeout = setTimeout(async () => {
    bossSaveTimeout = null;
    lastBossSaveTime = Date.now();
    await saveBossState(prisma);
  }, delay);
}

async function saveBossState(prisma) {
  try {
    const hpPercent = ((bossState.currentHp / bossState.maxHp) * 100).toFixed(1);
    // Убираем спам логов - показываем только раз в 30 секунд
    if (!saveBossState.lastLogTime || Date.now() - saveBossState.lastLogTime > 30000) {
      console.log(`[Boss] 💾 Saving: HP=${bossState.currentHp}/${bossState.maxHp} (${hpPercent}%)`);
      saveBossState.lastLogTime = Date.now();
    }

    // Serialize leaderboard with explicit userId field (avoid collision with damage)
    // Includes PS fields for participation-based XP system
    const leaderboardArray = Array.from(sessionLeaderboard.entries()).map(([userId, data]) => ({
      userId,
      damage: data.damage || 0,
      visitorName: data.visitorName || data.odamageN || 'Unknown',
      photoUrl: data.photoUrl || null,
      isEligible: data.isEligible || false,
      // PS fields
      ps: data.ps || 0,
      lastActionAt: data.lastActionAt || null,
      lastDamageSnapshot: data.lastDamageSnapshot || 0,
      skillsUsed: data.skillsUsed ? Array.from(data.skillsUsed) : [], // Set → Array for JSON
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
        previousBossSession: previousBossSession, // Сохраняем предыдущего босса
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
        previousBossSession: previousBossSession, // Сохраняем предыдущего босса
      },
    });
  } catch (err) {
    console.error('[Boss] ❌ Save state FAILED:', err.message);
    addLog('error', 'boss', 'Save state failed', { error: err.message, hp: bossState.currentHp });
  }
}

// ═══════════════════════════════════════════════════════════
// GAME CONSTANTS
// ═══════════════════════════════════════════════════════════

const STAT_EFFECTS = { str: 0.08, dex: 0.05, luck: 0.03 };
const BASE_CRIT_CHANCE = 0.05;
const BASE_CRIT_DAMAGE = 2.0;
const MANA_COST_PER_TAP = 1;
const BASE_MANA_REGEN = 5; // 5 mana per second (100 MP за 20 сек)
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

// Chest slot pricing (SSOT - Single Source of Truth)
// Base 5 slots free, additional slots cost crystals
const CHEST_SLOT_PRICES = [50, 150, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
const getNextSlotPrice = (purchasedSlots) => CHEST_SLOT_PRICES[purchasedSlots] || (purchasedSlots + 1) * 500;

// Ether config - x2 damage, 1 per tap
const ETHER = {
  multiplier: 2.0,
  cost: 200, // gold per 100
};

// Meditation config (Offline Ether Dust accumulation)
const MEDITATION = {
  dustPerMinute: 10,           // 10 пыли за минуту оффлайна
  maxOfflineMinutes: 480,      // 8 часов = 480 минут
  maxDust: 4800,               // Лимит накопления (480 * 10)
  craftRecipe: {
    dustCost: 5,               // 5 пыли
    goldCost: 5,               // 5 золота
    etherOutput: 1,            // = 1 эфир
  },
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

// Получить длительность открытия сундука
function getChestDuration(chestType) {
  return CHEST_CONFIG[chestType]?.duration || CHEST_CONFIG.WOODEN.duration;
}

// ═══════════════════════════════════════════════════════════
// CHEST DROP CONFIG — v1.6 Economy (crystals/tickets/keys)
// Gold сбалансирован: суммарно с daily ~50-100k/сутки
// ═══════════════════════════════════════════════════════════
const CHEST_DROP_RATES = {
  WOODEN: {
    // 55% шмот (93% Common, 7% Uncommon)
    goldRange: [200, 600],        // Снижено для баланса
    itemChance: 0.55,
    rarityWeights: { COMMON: 93, UNCOMMON: 7 },
    // Бонусные дропы
    crystalsChance: 0.08,         // 8%
    crystalsRange: [1, 5],
    ticketsChance: 0.05,          // 5%
    ticketsRange: [1, 1],
    keyChance: 0.002,             // 0.2% (очень редко)
  },
  BRONZE: {
    // 80% шмот (70% C, 27% U, 3% R)
    goldRange: [1000, 4000],
    itemChance: 0.80,
    rarityWeights: { COMMON: 70, UNCOMMON: 27, RARE: 3 },
    // Бонусные дропы
    crystalsChance: 0.10,         // 10%
    crystalsRange: [5, 20],
    ticketsChance: 0.07,          // 7%
    ticketsRange: [1, 2],
    keyChance: 0.005,             // 0.5%
  },
  SILVER: {
    // 100% шмот (75% U, 24% R, 1% E)
    goldRange: [5000, 12000],
    itemChance: 1.0,
    rarityWeights: { UNCOMMON: 75, RARE: 24, EPIC: 1 },
    // Бонусные дропы
    crystalsChance: 0.12,         // 12%
    crystalsRange: [20, 60],
    ticketsChance: 0.10,          // 10%
    ticketsRange: [2, 4],
    keyChance: 0.01,              // 1%
  },
  GOLD: {
    // 100% шмот (92% R, 8% E)
    goldRange: [12000, 30000],
    itemChance: 1.0,
    rarityWeights: { RARE: 92, EPIC: 8 },
    // Бонусные дропы
    crystalsChance: 0.15,         // 15%
    crystalsRange: [60, 150],
    ticketsChance: 0.12,          // 12%
    ticketsRange: [4, 8],
    keyChance: 0.02,              // 2%
  },
};

// ═══════════════════════════════════════════════════════════
// DROP SET/SLOT WEIGHTS — веса для выбора сета и слота при дропе
// Сначала выбирается сет (по рарности), затем слот
// ═══════════════════════════════════════════════════════════

// Веса сетов внутри каждой рарности (более ранние сеты чаще)
const DROP_SET_WEIGHTS = {
  COMMON: { adventurer: 60, leather: 40 },
  UNCOMMON: { scout: 60, hunter: 40 },
  RARE: { soldier: 60, knight: 40 },
  EPIC: { guardian: 40, warlord: 30, champion: 20, immortal: 10 },
};

// Веса слотов (перчатки реже всего)
const DROP_SLOT_WEIGHTS = {
  helmet: 22,
  chest: 22,
  legs: 22,
  boots: 22,
  gloves: 12,
};

// Helper: выбрать элемент по весам
function weightedRandom(weights) {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0][0]; // fallback
}

// ═══════════════════════════════════════════════════════════
// TASK SYSTEM v2.0 — Daily/Weekly with server-side SSOT
// ═══════════════════════════════════════════════════════════

// Helper: get "game day" date adjusted for 06:00 MSK reset (03:00 UTC)
// Before 03:00 UTC = still "yesterday", after 03:00 UTC = "today"
function getGameDay(date = new Date()) {
  const utcHours = date.getUTCHours();
  const adjusted = new Date(date);
  // If before 03:00 UTC (06:00 MSK), consider it previous day
  if (utcHours < 3) {
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  }
  return adjusted;
}

// Helper: get date key (YYYY-MM-DD) with 06:00 MSK reset
function getDateKey(date = new Date()) {
  return getGameDay(date).toISOString().split('T')[0];
}

// Helper: get week key (YYYY-WNN) with 06:00 MSK reset
function getWeekKey(date = new Date()) {
  const gameDay = getGameDay(date);
  const d = new Date(Date.UTC(gameDay.getUTCFullYear(), gameDay.getUTCMonth(), gameDay.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

// Helper: get rotation index (0, 1, or 2) for grind tasks with 06:00 MSK reset
function getGrindRotationIndex(date = new Date()) {
  const gameDay = getGameDay(date);
  const daysSinceEpoch = Math.floor(gameDay.getTime() / 86400000);
  return daysSinceEpoch % 3;
}

// ─────────────────────────────────────────────────────────
// DAILY BASE TASKS (5 tasks, always active)
// Total: 5+6+6+8+10 = 35k gold + 5 crystals
// ─────────────────────────────────────────────────────────
const DAILY_BASE_TASKS = [
  {
    id: 'D1_login',
    nameRu: 'Ежедневный вход',
    nameEn: 'Daily Login',
    descRu: 'Зайди в игру',
    descEn: 'Log into the game',
    icon: '🎮',
    condition: { type: 'login', target: 1 },
    rewards: [{ type: 'crystals', amount: 5 }],
  },
  {
    id: 'D2_bossDamage',
    nameRu: 'Разминка',
    nameEn: 'Boss Warm-up',
    descRu: 'Нанеси 10,000 урона боссу',
    descEn: 'Deal 10,000 damage to boss',
    icon: '👊',
    condition: { type: 'bossDamage', target: 10000 },
    rewards: [{ type: 'gold', amount: 6000 }],
  },
  {
    id: 'D3_taps',
    nameRu: 'Тапалка',
    nameEn: 'Tap Session',
    descRu: 'Сделай 100 тапов',
    descEn: 'Make 100 taps',
    icon: '👆',
    condition: { type: 'taps', target: 100 },
    rewards: [{ type: 'gold', amount: 6000 }],
  },
  {
    id: 'D4_skills',
    nameRu: 'Практика',
    nameEn: 'Skill Practice',
    descRu: 'Используй умения 20 раз',
    descEn: 'Use skills 20 times',
    icon: '✨',
    condition: { type: 'skillUses', target: 20 },
    rewards: [{ type: 'gold', amount: 8000 }],
  },
  {
    id: 'D5_chest',
    nameRu: 'Открыватель',
    nameEn: 'Chest Opener',
    descRu: 'Открой 1 сундук',
    descEn: 'Open 1 chest',
    icon: '📦',
    condition: { type: 'chestsOpened', target: 1 },
    rewards: [{ type: 'gold', amount: 10000 }],
  },
];

// ─────────────────────────────────────────────────────────
// GRIND TASK POOL (6 tasks, 2 active per day via rotation)
// Rewards are chests (требуют свободных слотов!)
// ─────────────────────────────────────────────────────────
const GRIND_TASK_POOL = [
  // Pair 0
  {
    id: 'G1_bossGrind',
    nameRu: 'Босс-гринд',
    nameEn: 'Boss Grind',
    descRu: 'Нанеси 50,000 урона боссу',
    descEn: 'Deal 50,000 damage to boss',
    icon: '💀',
    condition: { type: 'bossDamage', target: 50000 },
    rewards: [{ type: 'woodenChest', amount: 3 }],
    pairIndex: 0,
  },
  {
    id: 'G5_enchant',
    nameRu: 'Попытка заточки',
    nameEn: 'Enchant Attempt',
    descRu: 'Попробуй заточить 1 раз',
    descEn: 'Try to enchant 1 time',
    icon: '🔮',
    condition: { type: 'enchantAttempts', target: 1 },
    rewards: [{ type: 'woodenChest', amount: 2 }],
    pairIndex: 0,
  },
  // Pair 1
  {
    id: 'G2_tapGrind',
    nameRu: 'Тап-гринд',
    nameEn: 'Tap Grind',
    descRu: 'Сделай 300 тапов',
    descEn: 'Make 300 taps',
    icon: '👆',
    condition: { type: 'taps', target: 300 },
    rewards: [{ type: 'woodenChest', amount: 3 }],
    pairIndex: 1,
  },
  {
    id: 'G4_openChests',
    nameRu: 'Охотник за сундуками',
    nameEn: 'Chest Hunter',
    descRu: 'Открой 5 сундуков',
    descEn: 'Open 5 chests',
    icon: '🎁',
    condition: { type: 'chestsOpened', target: 5 },
    rewards: [
      { type: 'bronzeChest', amount: 1 },
      { type: 'woodenChest', amount: 2 },
    ],
    pairIndex: 1,
  },
  // Pair 2
  {
    id: 'G3_skillGrind',
    nameRu: 'Скилл-гринд',
    nameEn: 'Skill Grind',
    descRu: 'Используй умения 60 раз',
    descEn: 'Use skills 60 times',
    icon: '🔥',
    condition: { type: 'skillUses', target: 60 },
    rewards: [{ type: 'woodenChest', amount: 3 }],
    pairIndex: 2,
  },
  {
    id: 'G6_dismantle',
    nameRu: 'Утилизатор',
    nameEn: 'Dismantler',
    descRu: 'Разбери 3 предмета',
    descEn: 'Dismantle 3 items',
    icon: '🔧',
    condition: { type: 'dismantleCount', target: 3 },
    rewards: [{ type: 'bronzeChest', amount: 1 }],
    pairIndex: 2,
  },
];

// ─────────────────────────────────────────────────────────
// INVITE TASK (always visible, 1 task)
// Requires invited user to meet minAction requirement
// ─────────────────────────────────────────────────────────
const DAILY_INVITE_TASK = {
  id: 'I1_invite',
  nameRu: 'Пригласи друга',
  nameEn: 'Invite a Friend',
  descRu: 'Пригласи друга (он должен нанести 1,000 урона)',
  descEn: 'Invite a friend (they must deal 1,000 damage)',
  icon: '👥',
  condition: { type: 'inviteValid', target: 1 },
  rewards: [
    { type: 'silverChest', amount: 1 },
    { type: 'tickets', amount: 3 },
    { type: 'crystals', amount: 40 },
  ],
};

// ─────────────────────────────────────────────────────────
// WEEKLY TASKS (5 tasks)
// ─────────────────────────────────────────────────────────
const WEEKLY_TASKS = [
  {
    id: 'W1_baseDays',
    nameRu: 'Стабильность',
    nameEn: 'Consistency',
    descRu: 'Выполни базовые задачи 5 дней из 7',
    descEn: 'Complete base tasks 5 out of 7 days',
    icon: '📅',
    condition: { type: 'baseDaysCompleted', target: 5 },
    rewards: [{ type: 'goldChest', amount: 1 }],
  },
  {
    id: 'W2_weeklyDamage',
    nameRu: 'Недельный урон',
    nameEn: 'Weekly Damage',
    descRu: 'Нанеси 500,000 урона за неделю',
    descEn: 'Deal 500,000 damage this week',
    icon: '💥',
    condition: { type: 'weeklyBossDamage', target: 500000 },
    rewards: [{ type: 'silverChest', amount: 2 }],
  },
  {
    id: 'W3_weeklyChests',
    nameRu: 'Коллекционер',
    nameEn: 'Collector',
    descRu: 'Открой 40 сундуков за неделю',
    descEn: 'Open 40 chests this week',
    icon: '📦',
    condition: { type: 'weeklyChestsOpened', target: 40 },
    rewards: [
      { type: 'protectionCharges', amount: 2 },
      { type: 'enchantCharges', amount: 10 },
    ],
  },
  {
    id: 'W4_weeklyEnchants',
    nameRu: 'Заточник',
    nameEn: 'Enchanter',
    descRu: 'Попробуй заточить 20 раз за неделю',
    descEn: 'Try to enchant 20 times this week',
    icon: '🔮',
    condition: { type: 'weeklyEnchantAttempts', target: 20 },
    rewards: [{ type: 'tickets', amount: 10 }],
  },
  {
    id: 'W5_weeklyInvites',
    nameRu: 'Рекрутер',
    nameEn: 'Recruiter',
    descRu: 'Пригласи 3 друзей за неделю',
    descEn: 'Invite 3 friends this week',
    icon: '👥',
    condition: { type: 'weeklyInvitesValid', target: 3 },
    rewards: [
      { type: 'goldChest', amount: 1 },
      { type: 'crystals', amount: 150 },
    ],
  },
];

// ─────────────────────────────────────────────────────────
// ACTIVITY POINTS (AP) — awarded when tasks are completed
// Base: 80 AP, Grind: 50 AP, Invite: 30 AP = Max 160 AP
// ─────────────────────────────────────────────────────────
const AP_VALUES = {
  // Base tasks (80 AP total)
  D1_login: 10,
  D2_bossDamage: 20,
  D3_taps: 15,
  D4_skills: 15,
  D5_chest: 20,
  // Grind tasks (50 AP for active pair)
  G1_bossGrind: 30,   // Pair 0 - harder
  G5_enchant: 20,     // Pair 0 - easier
  G2_tapGrind: 20,    // Pair 1 - easier
  G4_openChests: 30,  // Pair 1 - harder
  G3_skillGrind: 20,  // Pair 2 - easier
  G6_dismantle: 30,   // Pair 2 - harder
  // Invite task (30 AP)
  I1_invite: 30,
};

// AP Milestone rewards
const AP_MILESTONES = {
  30: { type: 'gold', amount: 5000 },
  60: { type: 'tickets', amount: 2 },
  100: { type: 'bronzeChest', amount: 1 },
};

// ─────────────────────────────────────────────────────────
// 14-DAY CHECK-IN CALENDAR (streak ladder)
// ─────────────────────────────────────────────────────────
const CHECK_IN_REWARDS = [
  // Day 1-7
  { day: 1, type: 'crystals', amount: 5, icon: '💎' },
  { day: 2, type: 'tickets', amount: 1, icon: '🎟️' },
  { day: 3, type: 'woodenChest', amount: 2, icon: '🪵' },
  { day: 4, type: 'protectionCharges', amount: 1, icon: '🛡️' },
  { day: 5, type: 'crystals', amount: 10, icon: '💎' },
  { day: 6, type: 'enchantCharges', amount: 2, icon: '⚡' },
  { day: 7, type: 'bronzeChest', amount: 1, icon: '🟫' },
  // Day 8-14
  { day: 8, type: 'crystals', amount: 20, icon: '💎' },
  { day: 9, type: 'woodenChest', amount: 4, icon: '🪵' },
  { day: 10, type: 'tickets', amount: 5, icon: '🎟️' },
  { day: 11, type: 'protectionCharges', amount: 2, icon: '🛡️' },
  { day: 12, type: 'silverChest', amount: 1, icon: '🪙' },
  { day: 13, type: 'crystals', amount: 30, icon: '💎' },
  { day: 14, type: 'goldChest', amount: 1, icon: '🟨' },
];

// Helper: Get today's active grind tasks (2 tasks based on rotation)
function getTodaysGrindTasks() {
  const pairIndex = getGrindRotationIndex();
  return GRIND_TASK_POOL.filter(t => t.pairIndex === pairIndex);
}

// Helper: Get all active daily tasks for today
function getAllTodaysDailyTasks() {
  return [
    ...DAILY_BASE_TASKS,
    ...getTodaysGrindTasks(),
    DAILY_INVITE_TASK,
  ];
}

// Helper: Get or create daily progress for a user
async function getOrCreateDailyProgress(prisma, odamage, dateKey = getDateKey()) {
  let progress = await prisma.dailyTaskProgress.findUnique({
    where: { odamage_dateKey: { odamage, dateKey } },
  });

  if (!progress) {
    progress = await prisma.dailyTaskProgress.create({
      data: {
        odamage,
        dateKey,
        loginDone: true, // Auto-mark login on first access of the day
        claimedTasks: {},
        completedTasks: {},
        ap: 10, // D1_login is auto-completed, so start with 10 AP
      },
    });
    console.log(`[Tasks] Created daily progress for ${odamage} on ${dateKey} (login AP: +10)`);
  }

  return progress;
}

// Helper: Get or create weekly progress for a user
async function getOrCreateWeeklyProgress(prisma, odamage, weekKey = getWeekKey()) {
  let progress = await prisma.weeklyTaskProgress.findUnique({
    where: { odamage_weekKey: { odamage, weekKey } },
  });

  if (!progress) {
    progress = await prisma.weeklyTaskProgress.create({
      data: {
        odamage,
        weekKey,
        claimedTasks: {},
      },
    });
    console.log(`[Tasks] Created weekly progress for ${odamage} on ${weekKey}`);
  }

  return progress;
}

// Helper: Increment daily task counter
async function incrementDailyCounter(prisma, odamage, counterName, amount = 1) {
  const dateKey = getDateKey();
  const weekKey = getWeekKey();

  // Ensure progress exists
  await getOrCreateDailyProgress(prisma, odamage, dateKey);

  // Update daily counter
  const dailyUpdate = {};
  dailyUpdate[counterName] = { increment: amount };

  const updatedDaily = await prisma.dailyTaskProgress.update({
    where: { odamage_dateKey: { odamage, dateKey } },
    data: dailyUpdate,
  });

  // Also update weekly counters where applicable
  const weeklyCounterMap = {
    bossDamage: 'weeklyBossDamage',
    chestsOpened: 'weeklyChestsOpened',
    enchantAttempts: 'weeklyEnchantAttempts',
  };

  if (weeklyCounterMap[counterName]) {
    await getOrCreateWeeklyProgress(prisma, odamage, weekKey);
    const weeklyUpdate = {};
    weeklyUpdate[weeklyCounterMap[counterName]] = { increment: amount };
    await prisma.weeklyTaskProgress.update({
      where: { odamage_weekKey: { odamage, weekKey } },
      data: weeklyUpdate,
    });
  }

  // Check and award AP for newly completed tasks
  try {
    await checkAndAwardAP(prisma, odamage, updatedDaily);
  } catch (e) {
    console.error('[AP] Error awarding AP:', e.message);
  }

  return updatedDaily;
}

// Helper: Check if all base tasks (D1-D5) are claimed
function checkBaseDayCompleted(claimedTasks) {
  const baseTasks = ['D1_login', 'D2_bossDamage', 'D3_taps', 'D4_skills', 'D5_chest'];
  return baseTasks.every(id => claimedTasks[id] === true);
}

// Helper: Count chest rewards in a task
function countChestRewardsInTask(task) {
  let count = 0;
  for (const reward of task.rewards) {
    if (reward.type.includes('Chest')) {
      count += reward.amount;
    }
  }
  return count;
}

// Helper: Check task completion and award AP (called after counter updates)
async function checkAndAwardAP(prisma, odamage, dailyProgress) {
  const dateKey = getDateKey();
  const completedTasks = dailyProgress.completedTasks || {};
  const todaysTasks = getAllTodaysDailyTasks();

  let apGained = 0;
  const newlyCompleted = [];

  for (const task of todaysTasks) {
    // Skip if already awarded AP for this task
    if (completedTasks[task.id]) continue;

    // Check if task is now completed
    const { type, target } = task.condition;
    let progress = 0;

    switch (type) {
      case 'login':
        progress = dailyProgress.loginDone ? 1 : 0;
        break;
      case 'taps':
        progress = dailyProgress.taps;
        break;
      case 'bossDamage':
        progress = dailyProgress.bossDamage;
        break;
      case 'skillUses':
        progress = dailyProgress.skillUses;
        break;
      case 'chestsOpened':
        progress = dailyProgress.chestsOpened;
        break;
      case 'enchantAttempts':
        progress = dailyProgress.enchantAttempts;
        break;
      case 'dismantleCount':
        progress = dailyProgress.dismantleCount;
        break;
      // inviteValid is handled separately (not in daily counters)
    }

    if (progress >= target) {
      const apValue = AP_VALUES[task.id] || 0;
      if (apValue > 0) {
        apGained += apValue;
        newlyCompleted.push(task.id);
        console.log(`[AP] ${odamage} completed ${task.id} -> +${apValue} AP`);
      }
    }
  }

  // Update if any AP was gained
  if (apGained > 0 || newlyCompleted.length > 0) {
    const newCompletedTasks = { ...completedTasks };
    for (const taskId of newlyCompleted) {
      newCompletedTasks[taskId] = true;
    }

    await prisma.dailyTaskProgress.update({
      where: { odamage_dateKey: { odamage, dateKey } },
      data: {
        ap: { increment: apGained },
        completedTasks: newCompletedTasks,
      },
    });

    return apGained;
  }

  return 0;
}

// Helper: Get yesterday's date key
function getYesterdayDateKey() {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Starter equipment set (Novice Set)
// Синхронизировано с packages/shared/src/data/items.ts (novice set)
// TODO: После сборки shared импортировать оттуда напрямую
const STARTER_EQUIPMENT = [
  { code: 'starter-sword', slot: 'WEAPON', name: 'Меч новичка', icon: '🗡️', pAtk: 8, setId: 'starter' },
  { code: 'starter-helmet', slot: 'HELMET', name: 'Шлем новичка', icon: '⛑️', pDef: 2, setId: 'starter' },
  { code: 'starter-chest', slot: 'CHEST', name: 'Нагрудник новичка', icon: '🎽', pDef: 3, setId: 'starter' },
  { code: 'starter-gloves', slot: 'GLOVES', name: 'Перчатки новичка', icon: '🧤', pDef: 1, setId: 'starter' },
  { code: 'starter-legs', slot: 'LEGS', name: 'Поножи новичка', icon: '👖', pDef: 2, setId: 'starter' },
  { code: 'starter-boots', slot: 'BOOTS', name: 'Ботинки новичка', icon: '👢', pDef: 1, setId: 'starter' },
  { code: 'starter-shield', slot: 'SHIELD', name: 'Щит новичка', icon: '🛡️', pDef: 2, setId: 'starter' },
];

// DEBUG EQUIPMENT (для тестирования)
const DEBUG_EQUIPMENT = {
  code: 'debug-sword',
  slot: 'WEAPON',
  name: '[DEBUG] Меч разработчика',
  icon: '⚔️',
  pAtk: 1500,
  rarity: 'EPIC',
  setId: 'debug',
};

// Map item codes to set IDs
const ITEM_SET_MAP = {
  'starter-sword': 'starter',
  'starter-helmet': 'starter',
  'starter-chest': 'starter',
  'starter-gloves': 'starter',
  'starter-legs': 'starter',
  'starter-boots': 'starter',
  'starter-shield': 'starter',
};

// ═══════════════════════════════════════════════════════════
// PARTICIPATION SCORE (PS) SYSTEM - XP/SP без привязки к урону
// ═══════════════════════════════════════════════════════════
// PARTICIPATION SCORE (PS) CONSTANTS
// ═══════════════════════════════════════════════════════════

// PS tick interval (5 минут)
const PS_TICK_MS = 5 * 60 * 1000;
// Окно активности: игрок считается активным если lastActionAt < ACTIVE_WINDOW_MS назад
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 минут
// Капа PS за одного босса (24 тика = 2 часа активности)
const PS_CAP_PER_BOSS = 24;
// Полный вес участия (6 тиков = 30 минут для 100% базового веса)
const BASE_PS_FULL = 6;
// Соотношение SP к XP (SP = XP / SP_RATIO)
const SP_RATIO = 8;

// ═══════════════════════════════════════════════════════════
// BOSS XP TABLE (per-player baseline, NOT pool!)
// Точная таблица: к боссу 100 игрок с full participation выходит на lvl 20
// Сумма: 835,862 XP = Classic L2 lvl 20 (cumulative)
// ═══════════════════════════════════════════════════════════
const BOSS_XP = [
  0, // index 0 unused
  // Boss 1 (target: lvl 3)
  363,
  // Bosses 2-5 (target: lvl 6 by boss 5)
  1277, 1348, 1419, 1490,
  // Bosses 6-15 (target: lvl 10 by boss 15)
  3817, 3930, 4043, 4156, 4269, 4382, 4495, 4608, 4721, 4834,
  // Bosses 16-30 (target: lvl 13 by boss 30)
  5359, 5541, 5723, 5905, 6087, 6269, 6451, 6633, 6815, 6997, 7179, 7361, 7543, 7725, 7907,
  // Bosses 31-60 (target: lvl 16 by boss 60)
  5690, 5812, 5934, 6056, 6178, 6300, 6422, 6544, 6666, 6788,
  6910, 7032, 7154, 7276, 7398, 7520, 7642, 7764, 7886, 8008,
  8130, 8252, 8374, 8496, 8618, 8740, 8862, 8984, 9106, 9228,
  // Bosses 61-85 (target: lvl 18 by boss 85)
  7253, 7430, 7607, 7784, 7961, 8138, 8315, 8492, 8669, 8846,
  9023, 9200, 9377, 9554, 9731, 9908, 10085, 10262, 10439, 10616,
  10793, 10970, 11147, 11324, 11501,
  // Bosses 86-100 (target: lvl 20 by boss 100)
  17310, 17616, 17923, 18229, 18536, 18842, 19149, 19455, 19762, 20068,
  20375, 20681, 20988, 21294, 21601,
];

// Get XP per player for boss (NOT a pool, each player gets this baseline)
function getBossXpPerPlayer(bossIndex) {
  if (bossIndex < 1) return BOSS_XP[1];
  if (bossIndex > 100) return BOSS_XP[100];
  return BOSS_XP[bossIndex];
}

// ═══════════════════════════════════════════════════════════
// CHEST XP FACTORS (multipliers for XP from chests)
// xpFromChest = floor(BOSS_XP[bossIndex] * ChestXPFactor[chestType])
// ═══════════════════════════════════════════════════════════
const CHEST_XP_FACTOR = {
  WOODEN: 0.10,   // 10% of boss XP
  BRONZE: 0.25,   // 25% of boss XP
  SILVER: 0.60,   // 60% of boss XP
  GOLD: 1.50,     // 150% of boss XP
};
// SP_RATIO уже объявлен выше (line 638)

// ═══════════════════════════════════════════════════════════
// CHEST OPERATION MUTEX (anti-exploit protection)
// Prevents double-claim exploit via concurrent requests
// ═══════════════════════════════════════════════════════════
const chestClaimLocks = new Set(); // Set of chestIds currently being processed

// ═══════════════════════════════════════════════════════════
// XP → LEVEL THRESHOLDS (Cumulative XP для уровней 1-20)
// ═══════════════════════════════════════════════════════════
// Классическая L2-style прогрессия
const LEVEL_THRESHOLDS = [
  0,        // Level 1 (start)
  500,      // Level 2
  1500,     // Level 3
  3000,     // Level 4
  5500,     // Level 5
  9000,     // Level 6
  14000,    // Level 7
  21000,    // Level 8
  30000,    // Level 9
  42000,    // Level 10
  58000,    // Level 11
  78000,    // Level 12
  103000,   // Level 13
  135000,   // Level 14
  175000,   // Level 15
  225000,   // Level 16
  290000,   // Level 17
  370000,   // Level 18
  470000,   // Level 19
  600000,   // Level 20 (max)
];
const MAX_LEVEL = 20;

// ═══════════════════════════════════════════════════════════
// SKILLS PROGRESSION SYSTEM v1.4
// ═══════════════════════════════════════════════════════════

// MASTERY SYSTEM (ranks 0-10, +3% skill dmg per rank)
const MASTERY_MAX_RANK = 10;
const MASTERY_BONUS_PER_RANK = 0.03; // +3% dmg per rank
const MASTERY_COSTS = {
  gold: [5000, 8000, 12000, 18000, 26000, 38000, 55000, 80000, 120000, 180000],
  sp:   [80, 120, 180, 260, 380, 540, 760, 1050, 1450, 2000],
};

// PROFICIENCY TIERS (unlock by casts, activate with Gold+SP)
const TIER_COUNT = 4;
const TIER_THRESHOLDS = [50, 200, 500, 1000]; // Casts to UNLOCK tier
const TIER_BONUSES = [0.03, 0.07, 0.15, 0.25]; // +3%, +7%, +15%, +25%
const TIER_ACTIVATION_COSTS = {
  gold: [8000, 18000, 45000, 120000],
  sp:   [120, 280, 700, 1800],
};

// PASSIVE SKILLS costs (ranks 1-10)
const PASSIVE_COSTS = {
  gold: [4000, 6000, 9000, 13000, 19000, 28000, 41000, 60000, 90000, 135000],
  sp:   [60, 90, 130, 190, 280, 400, 560, 780, 1100, 1550],
};
const ETHER_EFFICIENCY_COSTS = {
  gold: [12000, 20000, 32000, 50000, 80000],
  sp:   [200, 320, 520, 820, 1300],
};

// PASSIVE EFFECTS
const PASSIVE_EFFECTS = {
  arcanePower: { effectPerRank: 0.02, maxRank: 10 },      // +2% final P.Atk
  critFocus: { effectPerRank: 0.006, maxRank: 10, cap: 0.6 }, // +0.6% crit chance (cap 60%)
  critPower: { effectPerRank: 0.06, maxRank: 10 },        // +6% crit damage
  staminaTraining: { effectPerRank: 50, maxRank: 10 },    // +50 max stamina
  manaFlow: { effectPerRank: 30, maxRank: 10 },           // +30 max mana
  etherEfficiency: { effectPerRank: 0.06, maxRank: 5 },   // -6% ether cost (max 5 ranks)
};

// LEVEL CAPS (restrict upgrades by hero level)
const SKILL_LEVEL_CAPS = {
  1:  { activeMastery: 3, passiveRank: 0, tierMax: 1, etherMax: 0 },
  5:  { activeMastery: 5, passiveRank: 3, tierMax: 1, etherMax: 0 },
  10: { activeMastery: 7, passiveRank: 6, tierMax: 2, etherMax: 0 },
  15: { activeMastery: 9, passiveRank: 8, tierMax: 3, etherMax: 3 },
  20: { activeMastery: 10, passiveRank: 10, tierMax: 4, etherMax: 5 },
};

function getSkillLevelCaps(level) {
  if (level >= 20) return SKILL_LEVEL_CAPS[20];
  if (level >= 15) return SKILL_LEVEL_CAPS[15];
  if (level >= 10) return SKILL_LEVEL_CAPS[10];
  if (level >= 5) return SKILL_LEVEL_CAPS[5];
  return SKILL_LEVEL_CAPS[1];
}

function getMasteryMultiplier(rank) {
  return 1 + rank * MASTERY_BONUS_PER_RANK;
}

function getUnlockedTierByCasts(casts) {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (casts >= TIER_THRESHOLDS[i]) return i + 1; // tier 1-4
  }
  return 0;
}

function isTierActivated(tierBitmask, tier) {
  if (tier < 1 || tier > 4) return false;
  return (tierBitmask & (1 << (tier - 1))) !== 0;
}

function activateTier(tierBitmask, tier) {
  if (tier < 1 || tier > 4) return tierBitmask;
  return tierBitmask | (1 << (tier - 1));
}

function getTierBonusMultiplier(tierBitmask) {
  let bonus = 0;
  for (let i = 0; i < TIER_COUNT; i++) {
    if (tierBitmask & (1 << i)) {
      bonus += TIER_BONUSES[i];
    }
  }
  return 1 + bonus;
}

// Получить уровень по cumulative XP
function getLevelFromXp(totalXp) {
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (totalXp >= LEVEL_THRESHOLDS[lvl - 1]) {
      return lvl;
    }
  }
  return 1;
}

// ═══════════════════════════════════════════════════════════
// MENTOR BOOST (Catch-up для отставших)
// ═══════════════════════════════════════════════════════════

// Milestone кривая: boss index → target level
const MENTOR_MILESTONES = [
  { boss: 1, level: 3 },
  { boss: 5, level: 6 },
  { boss: 15, level: 10 },
  { boss: 30, level: 13 },
  { boss: 60, level: 16 },
  { boss: 85, level: 18 },
  { boss: 100, level: 20 },
];

// Интерполяция целевого уровня по bossIndex
function getTargetLevel(bossIndex) {
  // Найти между какими milestone'ами находится bossIndex
  for (let i = 0; i < MENTOR_MILESTONES.length - 1; i++) {
    const curr = MENTOR_MILESTONES[i];
    const next = MENTOR_MILESTONES[i + 1];
    if (bossIndex >= curr.boss && bossIndex < next.boss) {
      // Линейная интерполяция
      const progress = (bossIndex - curr.boss) / (next.boss - curr.boss);
      return Math.floor(curr.level + progress * (next.level - curr.level));
    }
  }
  // После последнего milestone
  return MENTOR_MILESTONES[MENTOR_MILESTONES.length - 1].level;
}

// Рассчитать Mentor Boost для игрока
function getMentorBoost(playerLevel, bossIndex) {
  const targetLevel = getTargetLevel(bossIndex);
  // Буст только если игрок отстаёт на 3+ уровня
  if (playerLevel < targetLevel - 2) {
    const delta = targetLevel - playerLevel;
    const boost = 1 + 0.25 * delta;
    return Math.min(boost, 3.0); // Cap at 3x
  }
  return 1.0;
}

// ═══════════════════════════════════════════════════════════
// DROPPABLE EQUIPMENT (50 предметов, 10 сетов × 5 частей)
// Синхронизировано с packages/shared/src/data/items.ts
// ═══════════════════════════════════════════════════════════
const DROPPABLE_EQUIPMENT = [
  // ADVENTURER SET (Common)
  { code: 'adventurer-helmet', slot: 'HELMET', name: 'Шлем искателя', icon: '⛑️', pDef: 3, staminaMax: 10, rarity: 'COMMON', setId: 'adventurer' },
  { code: 'adventurer-gloves', slot: 'GLOVES', name: 'Перчатки искателя', icon: '🧤', pDef: 2, staminaMax: 5, rarity: 'COMMON', setId: 'adventurer' },
  { code: 'adventurer-boots', slot: 'BOOTS', name: 'Ботинки искателя', icon: '👢', pDef: 2, staminaMax: 10, rarity: 'COMMON', setId: 'adventurer' },
  { code: 'adventurer-chest', slot: 'CHEST', name: 'Нагрудник искателя', icon: '🎽', pDef: 4, staminaMax: 15, rarity: 'COMMON', setId: 'adventurer' },
  { code: 'adventurer-legs', slot: 'LEGS', name: 'Поножи искателя', icon: '👖', pDef: 3, staminaMax: 10, rarity: 'COMMON', setId: 'adventurer' },

  // LEATHER SET (Common)
  { code: 'leather-helmet', slot: 'HELMET', name: 'Кожаный шлем', icon: '⛑️', pDef: 4, staminaMax: 12, rarity: 'COMMON', setId: 'leather' },
  { code: 'leather-gloves', slot: 'GLOVES', name: 'Кожаные перчатки', icon: '🧤', pDef: 2, staminaMax: 8, rarity: 'COMMON', setId: 'leather' },
  { code: 'leather-boots', slot: 'BOOTS', name: 'Кожаные ботинки', icon: '👢', pDef: 3, staminaMax: 12, rarity: 'COMMON', setId: 'leather' },
  { code: 'leather-chest', slot: 'CHEST', name: 'Кожаный нагрудник', icon: '🎽', pDef: 5, staminaMax: 18, rarity: 'COMMON', setId: 'leather' },
  { code: 'leather-legs', slot: 'LEGS', name: 'Кожаные поножи', icon: '👖', pDef: 3, staminaMax: 12, rarity: 'COMMON', setId: 'leather' },

  // SCOUT SET (Uncommon)
  { code: 'scout-helmet', slot: 'HELMET', name: 'Шлем разведчика', icon: '⛑️', pDef: 5, staminaMax: 20, rarity: 'UNCOMMON', setId: 'scout' },
  { code: 'scout-gloves', slot: 'GLOVES', name: 'Перчатки разведчика', icon: '🧤', pDef: 3, staminaMax: 12, rarity: 'UNCOMMON', setId: 'scout' },
  { code: 'scout-boots', slot: 'BOOTS', name: 'Ботинки разведчика', icon: '👢', pDef: 4, staminaMax: 18, rarity: 'UNCOMMON', setId: 'scout' },
  { code: 'scout-chest', slot: 'CHEST', name: 'Нагрудник разведчика', icon: '🎽', pDef: 7, staminaMax: 28, rarity: 'UNCOMMON', setId: 'scout' },
  { code: 'scout-legs', slot: 'LEGS', name: 'Поножи разведчика', icon: '👖', pDef: 5, staminaMax: 22, rarity: 'UNCOMMON', setId: 'scout' },

  // HUNTER SET (Uncommon)
  { code: 'hunter-helmet', slot: 'HELMET', name: 'Шлем охотника', icon: '⛑️', pDef: 6, staminaMax: 24, rarity: 'UNCOMMON', setId: 'hunter' },
  { code: 'hunter-gloves', slot: 'GLOVES', name: 'Перчатки охотника', icon: '🧤', pDef: 4, staminaMax: 14, rarity: 'UNCOMMON', setId: 'hunter' },
  { code: 'hunter-boots', slot: 'BOOTS', name: 'Ботинки охотника', icon: '👢', pDef: 5, staminaMax: 20, rarity: 'UNCOMMON', setId: 'hunter' },
  { code: 'hunter-chest', slot: 'CHEST', name: 'Нагрудник охотника', icon: '🎽', pDef: 8, staminaMax: 32, rarity: 'UNCOMMON', setId: 'hunter' },
  { code: 'hunter-legs', slot: 'LEGS', name: 'Поножи охотника', icon: '👖', pDef: 6, staminaMax: 26, rarity: 'UNCOMMON', setId: 'hunter' },

  // SOLDIER SET (Rare)
  { code: 'soldier-helmet', slot: 'HELMET', name: 'Шлем солдата', icon: '⛑️', pDef: 8, staminaMax: 35, rarity: 'RARE', setId: 'soldier' },
  { code: 'soldier-gloves', slot: 'GLOVES', name: 'Перчатки солдата', icon: '🧤', pDef: 5, staminaMax: 22, rarity: 'RARE', setId: 'soldier' },
  { code: 'soldier-boots', slot: 'BOOTS', name: 'Ботинки солдата', icon: '👢', pDef: 6, staminaMax: 28, rarity: 'RARE', setId: 'soldier' },
  { code: 'soldier-chest', slot: 'CHEST', name: 'Нагрудник солдата', icon: '🎽', pDef: 10, staminaMax: 45, rarity: 'RARE', setId: 'soldier' },
  { code: 'soldier-legs', slot: 'LEGS', name: 'Поножи солдата', icon: '👖', pDef: 8, staminaMax: 38, rarity: 'RARE', setId: 'soldier' },

  // KNIGHT SET (Rare)
  { code: 'knight-helmet', slot: 'HELMET', name: 'Шлем рыцаря', icon: '⛑️', pDef: 10, staminaMax: 40, rarity: 'RARE', setId: 'knight' },
  { code: 'knight-gloves', slot: 'GLOVES', name: 'Перчатки рыцаря', icon: '🧤', pDef: 6, staminaMax: 25, rarity: 'RARE', setId: 'knight' },
  { code: 'knight-boots', slot: 'BOOTS', name: 'Ботинки рыцаря', icon: '👢', pDef: 8, staminaMax: 32, rarity: 'RARE', setId: 'knight' },
  { code: 'knight-chest', slot: 'CHEST', name: 'Нагрудник рыцаря', icon: '🎽', pDef: 12, staminaMax: 50, rarity: 'RARE', setId: 'knight' },
  { code: 'knight-legs', slot: 'LEGS', name: 'Поножи рыцаря', icon: '👖', pDef: 10, staminaMax: 42, rarity: 'RARE', setId: 'knight' },

  // GUARDIAN SET (Epic)
  { code: 'guardian-helmet', slot: 'HELMET', name: 'Шлем стража', icon: '⛑️', pDef: 12, staminaMax: 50, rarity: 'EPIC', setId: 'guardian' },
  { code: 'guardian-gloves', slot: 'GLOVES', name: 'Перчатки стража', icon: '🧤', pDef: 8, staminaMax: 32, rarity: 'EPIC', setId: 'guardian' },
  { code: 'guardian-boots', slot: 'BOOTS', name: 'Ботинки стража', icon: '👢', pDef: 10, staminaMax: 42, rarity: 'EPIC', setId: 'guardian' },
  { code: 'guardian-chest', slot: 'CHEST', name: 'Нагрудник стража', icon: '🎽', pDef: 15, staminaMax: 65, rarity: 'EPIC', setId: 'guardian' },
  { code: 'guardian-legs', slot: 'LEGS', name: 'Поножи стража', icon: '👖', pDef: 12, staminaMax: 55, rarity: 'EPIC', setId: 'guardian' },

  // WARLORD SET (Epic)
  { code: 'warlord-helmet', slot: 'HELMET', name: 'Шлем полководца', icon: '⛑️', pDef: 14, staminaMax: 60, rarity: 'EPIC', setId: 'warlord' },
  { code: 'warlord-gloves', slot: 'GLOVES', name: 'Перчатки полководца', icon: '🧤', pDef: 9, staminaMax: 38, rarity: 'EPIC', setId: 'warlord' },
  { code: 'warlord-boots', slot: 'BOOTS', name: 'Ботинки полководца', icon: '👢', pDef: 12, staminaMax: 50, rarity: 'EPIC', setId: 'warlord' },
  { code: 'warlord-chest', slot: 'CHEST', name: 'Нагрудник полководца', icon: '🎽', pDef: 18, staminaMax: 75, rarity: 'EPIC', setId: 'warlord' },
  { code: 'warlord-legs', slot: 'LEGS', name: 'Поножи полководца', icon: '👖', pDef: 14, staminaMax: 62, rarity: 'EPIC', setId: 'warlord' },

  // CHAMPION SET (Epic)
  { code: 'champion-helmet', slot: 'HELMET', name: 'Шлем чемпиона', icon: '⛑️', pDef: 16, staminaMax: 70, rarity: 'EPIC', setId: 'champion' },
  { code: 'champion-gloves', slot: 'GLOVES', name: 'Перчатки чемпиона', icon: '🧤', pDef: 10, staminaMax: 45, rarity: 'EPIC', setId: 'champion' },
  { code: 'champion-boots', slot: 'BOOTS', name: 'Ботинки чемпиона', icon: '👢', pDef: 13, staminaMax: 55, rarity: 'EPIC', setId: 'champion' },
  { code: 'champion-chest', slot: 'CHEST', name: 'Нагрудник чемпиона', icon: '🎽', pDef: 20, staminaMax: 88, rarity: 'EPIC', setId: 'champion' },
  { code: 'champion-legs', slot: 'LEGS', name: 'Поножи чемпиона', icon: '👖', pDef: 16, staminaMax: 72, rarity: 'EPIC', setId: 'champion' },

  // IMMORTAL SET (Epic)
  { code: 'immortal-helmet', slot: 'HELMET', name: 'Шлем бессмертного', icon: '⛑️', pDef: 18, staminaMax: 80, rarity: 'EPIC', setId: 'immortal' },
  { code: 'immortal-gloves', slot: 'GLOVES', name: 'Перчатки бессмертного', icon: '🧤', pDef: 12, staminaMax: 52, rarity: 'EPIC', setId: 'immortal' },
  { code: 'immortal-boots', slot: 'BOOTS', name: 'Ботинки бессмертного', icon: '👢', pDef: 15, staminaMax: 65, rarity: 'EPIC', setId: 'immortal' },
  { code: 'immortal-chest', slot: 'CHEST', name: 'Нагрудник бессмертного', icon: '🎽', pDef: 22, staminaMax: 100, rarity: 'EPIC', setId: 'immortal' },
  { code: 'immortal-legs', slot: 'LEGS', name: 'Поножи бессмертного', icon: '👖', pDef: 18, staminaMax: 82, rarity: 'EPIC', setId: 'immortal' },
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

// ═══════════════════════════════════════════════════════════
// EQUIPMENT STATS CALCULATION
// ═══════════════════════════════════════════════════════════

async function recalculateEquipmentStats(player, prisma) {
  if (!player.odamage) return;

  try {
    // Get all equipped items with their equipment template (for slot info)
    const equippedItems = await prisma.userEquipment.findMany({
      where: {
        userId: player.odamage,
        isEquipped: true,
        isBroken: false,  // Broken items don't give stats
      },
      include: { equipment: true },
    });

    // Sum up equipment bonuses
    let equipPAtk = 0;
    let equipPDef = 0;
    let enchantPAtk = 0;
    let enchantPDef = 0;

    // Enchant bonus per level (weapons get pAtk, armor gets pDef)
    const ENCHANT_PATK_PER_LEVEL = 2;  // +2 pAtk per enchant level on weapons
    const ENCHANT_PDEF_PER_LEVEL = 1;  // +1 pDef per enchant level on armor

    const WEAPON_SLOTS = ['WEAPON'];
    const ARMOR_SLOTS = ['HELMET', 'CHEST', 'GLOVES', 'LEGS', 'BOOTS', 'SHIELD'];

    for (const item of equippedItems) {
      // Base stats from item
      equipPAtk += item.pAtk || 0;
      equipPDef += item.pDef || 0;

      // Enchant bonus based on slot type
      const slot = item.equipment?.slot;
      const enchantLevel = item.enchant || 0;

      if (WEAPON_SLOTS.includes(slot)) {
        enchantPAtk += enchantLevel * ENCHANT_PATK_PER_LEVEL;
      } else if (ARMOR_SLOTS.includes(slot)) {
        enchantPDef += enchantLevel * ENCHANT_PDEF_PER_LEVEL;
      }
    }

    // Store equipment bonuses separately
    player.equipmentPAtk = equipPAtk + enchantPAtk;
    player.equipmentPDef = equipPDef + enchantPDef;

    // Update total pAtk (base + equipment + enchant)
    // Base pAtk is stored in user.pAtk in DB (default 10)
    player.pAtk = (player.basePAtk || 10) + equipPAtk + enchantPAtk;
    player.pDef = (player.basePDef || 0) + equipPDef + enchantPDef;

    console.log(`[Equipment] Recalculated stats for ${player.odamage}: pAtk=${player.pAtk} (base=${player.basePAtk}, equip=${equipPAtk}, enchant=+${enchantPAtk}), pDef=${player.pDef} (equip=${equipPDef}, enchant=+${enchantPDef})`);
  } catch (err) {
    console.error('[Equipment] Recalculate stats error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// DAMAGE CALCULATION
// ═══════════════════════════════════════════════════════════

function calculateDamage(player, tapCount) {
  let totalDamage = 0;
  let crits = 0;
  let etherUsed = 0;

  const baseDamage = player.pAtk * (1 + player.str * STAT_EFFECTS.str);
  let critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

  // Level multiplier: +2% per level (1.02^(level-1))
  const levelMultiplier = Math.pow(1.02, (player.level || 1) - 1);

  // Check active buffs
  const now = Date.now();
  player.activeBuffs = player.activeBuffs.filter(b => b.expiresAt > now);

  let damageBonus = 1.0;
  for (const buff of player.activeBuffs) {
    if (buff.type === 'acumen') damageBonus += buff.value;
    if (buff.type === 'luck') critChance = Math.min(0.75, critChance + buff.value);
  }

  // Ether multiplier (x2 damage, 1 per tap)
  let etherMultiplier = 1.0;
  if (player.autoEther && player.ether > 0) {
    etherMultiplier = ETHER.multiplier;
    // Consume ether (1 per tap)
    const consumed = Math.min(player.ether, tapCount);
    player.ether -= consumed;
    player.dirty = true;  // SSOT: mark for flush
    etherUsed = consumed;
    // Auto-deactivate if ran out
    if (player.ether <= 0) {
      player.autoEther = false;
    }
  }

  for (let i = 0; i < tapCount; i++) {
    let dmg = baseDamage * (0.9 + Math.random() * 0.2);

    // Apply level multiplier (+2% per level)
    dmg *= levelMultiplier;

    // Apply ether (only for taps that had ether)
    if (i < etherUsed) {
      dmg *= etherMultiplier;
    }

    // Apply damage buff
    dmg *= damageBonus;

    if (Math.random() < critChance) {
      dmg *= BASE_CRIT_DAMAGE;
      crits++;
    }

    const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
    dmg *= rageMultiplier;
    // Defense из шаблона по currentBossIndex
    const bossDefense = (DEFAULT_BOSSES[currentBossIndex] || DEFAULT_BOSSES[0]).defense;
    dmg = Math.max(1, dmg - bossDefense);
    totalDamage += Math.floor(dmg);
  }

  return { totalDamage, crits, etherUsed };
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
    defense: template.pDef ?? Math.floor(index * 5), // pDef из шаблона или по умолчанию
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
    if (prop === 'length') return 4; // 4 bosses (then debug mode)
    const index = parseInt(prop, 10);
    if (!isNaN(index) && index >= 0 && index < 4) {
      return getBossStats(index);
    }
    return undefined;
  }
});

// Respawn timer: 30 seconds (see BOSS_RESPAWN_TIME_MS)

let currentBossIndex = 0;

async function respawnBoss(prisma, forceNext = true) {
  // Check if game is finished
  if (gameFinished) {
    console.log('[Boss] Game finished - no more bosses to spawn');
    return false;
  }

  console.log(`[Boss] respawnBoss called with forceNext=${forceNext}, currentIndex=${currentBossIndex}, debugMode=${debugMode}`);

  // Check if this is boss 4 transition → enable debug mode
  const nextBossIndex = forceNext ? currentBossIndex + 1 : currentBossIndex;
  if (nextBossIndex >= 4 && !debugMode) {
    debugMode = true;
    console.log('[Boss] 🔧 DEBUG MODE ENABLED! All 4 bosses defeated. Spawning boss 1 forever.');
    addLog('info', 'boss', '🔧 DEBUG MODE: All 4 bosses defeated, now spawning boss 1');
    // Reset to boss 0 (Serpent)
    currentBossIndex = -1; // Will become 0 after increment
  }

  const now = Date.now();

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

      // FIX: Use BOSS_TEMPLATES image for DB bosses (matched by index % templates.length)
      const dbBossTemplate = BOSS_TEMPLATES[currentBossIndex % BOSS_TEMPLATES.length];
      bossState = {
        id: boss.id,
        name: boss.name,
        nameRu: dbBossTemplate?.nameRu || boss.name, // Use template nameRu
        title: boss.title || 'World Boss',
        maxHp: Number(boss.baseHp),
        currentHp: Number(boss.baseHp),
        defense: boss.defense,
        thornsDamage: boss.thornsDamage || 0,  // L2: обратка
        ragePhase: 0,
        sessionId: session?.id || null,
        icon: boss.iconUrl || dbBossTemplate?.icon || '👹',
        image: dbBossTemplate?.image || null, // FIX: Set image from template
        bossIndex: currentBossIndex + 1,
        totalBosses: 4,
        // Dampening state - reset for new boss
        bossStartAt: now,
        bossTargetEndAt: now + BOSS_MIN_DURATION_MS,
        bossDamageMultiplier: 1.0,
        dpsEma: 0,
        lastDpsSampleAt: now,
        lastTotalDamageSample: 0,
        totalDamageDealt: 0,
      };
      console.log(`[Boss] Loaded from DB: ${boss.name} (${boss.baseHp} HP, thorns: ${boss.thornsDamage || 0}), image: ${bossState.image}`);
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
        totalBosses: 4,
        goldReward: boss.goldReward,
        expReward: boss.expReward,
        tonReward: boss.tonReward || 10,
        chestsReward: boss.chestsReward || 10,
        // Dampening state - reset for new boss
        bossStartAt: now,
        bossTargetEndAt: now + BOSS_MIN_DURATION_MS,
        bossDamageMultiplier: 1.0,
        dpsEma: 0,
        lastDpsSampleAt: now,
        lastTotalDamageSample: 0,
        totalDamageDealt: 0,
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
      totalBosses: 4,
      goldReward: boss.goldReward,
      expReward: boss.expReward,
      tonReward: boss.tonReward || 10,
      chestsReward: boss.chestsReward || 10,
      // Dampening state - reset for new boss
      bossStartAt: now,
      bossTargetEndAt: now + BOSS_MIN_DURATION_MS,
      bossDamageMultiplier: 1.0,
      dpsEma: 0,
      lastDpsSampleAt: now,
      lastTotalDamageSample: 0,
      totalDamageDealt: 0,
    };
  }

  sessionLeaderboard.clear();
  console.log(`[Boss] Respawned: ${bossState.name} (${bossState.bossIndex}/${bossState.totalBosses}) with ${bossState.maxHp} HP`);
  console.log(`[Boss] Dampening: targetEnd=${new Date(bossState.bossTargetEndAt).toISOString()}, mult=${bossState.bossDamageMultiplier}`);
  addLog('info', 'boss', `Respawned: ${bossState.name} #${bossState.bossIndex}`, { hp: bossState.maxHp });
  return true;
}

// ═══════════════════════════════════════════════════════════
// BOSS KILL HANDLER (shared between tap and auto-attack)
// TZ Этап 2: New reward system based on activity and ranking
// ═══════════════════════════════════════════════════════════

async function handleBossKill(io, prisma, killerPlayer, killerSocketId) {
  console.log(`[Boss] ${bossState.name} killed by ${killerPlayer.odamageN}!`);
  addLog('info', 'boss', `${bossState.name} killed by ${killerPlayer.odamageN}!`, { bossIndex: bossState.bossIndex });

  // Build leaderboard with photoUrl, activity status, and PS data
  const leaderboard = Array.from(sessionLeaderboard.entries())
    .map(([userId, data]) => ({
      odamage: userId,  // Keep for backward compat
      visitorId: userId,
      visitorName: data.visitorName || 'Unknown',
      photoUrl: data.photoUrl,
      damage: data.damage || 0,
      isEligible: data.isEligible || false,
      // PS fields for XP distribution
      ps: data.ps || 0,
      skillsUsed: data.skillsUsed || new Set(),
    }))
    .sort((a, b) => b.damage - a.damage);

  const totalDamageDealt = leaderboard.reduce((sum, p) => sum + p.damage, 0);
  const topDamagePlayer = leaderboard[0];
  const finalBlowPlayer = killerPlayer;

  // Prize pool from boss config (for adena/exp distribution)
  const expPool = bossState.expReward || 1000000;
  const goldPool = bossState.goldReward || 5000;

  // ═══════════════════════════════════════════════════════════
  // PER-PLAYER XP/SP DISTRIBUTION (NOT pool-based!)
  // Each player gets bossXpPerPlayer * (0.90*weight + 0.10*psBonus) * mentorBoost
  // NO dependency on participantsCount - 50k online doesn't dilute XP
  // ═══════════════════════════════════════════════════════════
  const bossXpPerPlayer = getBossXpPerPlayer(bossState.bossIndex);

  // Participants: isEligible AND ps >= 1 (at least 1 active tick)
  const participants = leaderboard.filter(p => p.isEligible && p.ps >= 1);

  // Pre-calculate XP for each participant (per-player baseline, NOT pool division!)
  const xpDistribution = new Map(); // userId -> { xpRaw, participationWeight, psBonus }
  for (const p of participants) {
    // participationWeight = clamp(ps / BASE_PS_FULL, 0..1)
    const participationWeight = Math.min(p.ps / BASE_PS_FULL, 1);
    // psBonus = ps / PS_CAP_PER_BOSS (reward for longer participation)
    const psBonus = p.ps / PS_CAP_PER_BOSS;
    // XP formula: bossXpPerPlayer * (0.90 * participationWeight + 0.10 * psBonus)
    const xpRaw = bossXpPerPlayer * (0.90 * participationWeight + 0.10 * psBonus);
    xpDistribution.set(p.odamage, { xpRaw, participationWeight, psBonus, ps: p.ps });
  }

  // Diagnostic: Calculate average XP gain (should NOT depend on participantsCount)
  const avgXpRaw = participants.length > 0
    ? Array.from(xpDistribution.values()).reduce((sum, d) => sum + d.xpRaw, 0) / participants.length
    : 0;
  console.log(`[XP] Boss #${bossState.bossIndex} per-player baseline: ${bossXpPerPlayer} XP`);
  console.log(`[XP] Participants: ${participants.length}, avgXpGain (before mentor): ${avgXpRaw.toFixed(0)}`);

  // ═══════════════════════════════════════════════════════════
  // TZ ЭТАП 2: NEW REWARD SYSTEM
  // A) Base: 2 Wooden if eligible (30 sec activity)
  // B) Top-100 rewards by rank
  // C) Top-3 special rewards with badges
  // ═══════════════════════════════════════════════════════════

  // Helper: Calculate chest + lottery ticket rewards based on rank (per TZ)
  // Participation: 2 Wooden + 1 Ticket for all eligible
  // Ranking: additional chests + tickets for top players
  const getChestRewardsByRank = (rank, isEligible) => {
    if (!isEligible) return { wooden: 0, bronze: 0, silver: 0, gold: 0, crystals: 0, lotteryTickets: 0, badge: null, badgeDays: null };

    let wooden = 2;        // Base participation reward
    let bronze = 0;
    let silver = 0;
    let gold = 0;
    let lotteryTickets = 1; // Base 1 ticket for all eligible
    let badge = null;
    let badgeDays = null;

    if (rank === 1) {
      // #1: 1 Gold + 2 Silver + 2 Bronze + 10 extra tickets + "Slayer" badge (7 days)
      gold += 1;
      silver += 2;
      bronze += 2;
      lotteryTickets += 10;
      badge = 'slayer';
      badgeDays = 7;
    } else if (rank === 2) {
      // #2: 1 Gold + 1 Silver + 2 Bronze + 6 extra tickets + "Elite" badge (7 days)
      gold += 1;
      silver += 1;
      bronze += 2;
      lotteryTickets += 6;
      badge = 'elite';
      badgeDays = 7;
    } else if (rank === 3) {
      // #3: 1 Gold + 1 Silver + 1 Bronze + 4 extra tickets + "Elite" badge (3 days)
      gold += 1;
      silver += 1;
      bronze += 1;
      lotteryTickets += 4;
      badge = 'elite';
      badgeDays = 3;
    } else if (rank >= 4 && rank <= 10) {
      // Top 4-10: 1 Silver + 1 Bronze + 2 extra tickets
      silver += 1;
      bronze += 1;
      lotteryTickets += 2;
    } else if (rank >= 11 && rank <= 25) {
      // Top 11-25: 1 Silver + 1 extra ticket
      silver += 1;
      lotteryTickets += 1;
    } else if (rank >= 26 && rank <= 50) {
      // Top 26-50: 1 Bronze + 1 Wooden + 1 extra ticket
      bronze += 1;
      wooden += 1;
      lotteryTickets += 1;
    } else if (rank >= 51 && rank <= 100) {
      // Top 51-100: 1 Bronze + 1 extra ticket
      bronze += 1;
      lotteryTickets += 1;
    }
    // 101+: only base reward (2 wooden + 1 ticket)

    // Crystal bonus: Gold +10, Silver +5
    const crystals = (gold * 10) + (silver * 5);

    return { wooden, bronze, silver, gold, crystals, lotteryTickets, badge, badgeDays };
  };

  // Distribute rewards to all participants
  const rewards = [];

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const rank = i + 1;
    const damagePercent = totalDamageDealt > 0 ? entry.damage / totalDamageDealt : 0;

    // Gold/EXP убраны - награда только сундуками
    const goldReward = 0;
    const expReward = 0;

    const isFinalBlow = entry.odamage === finalBlowPlayer.odamage;
    const isTopDamage = entry.odamage === topDamagePlayer?.odamage;

    // Eligibility: entry.isEligible already set by activity tracking (60s OR 20 actions)
    // Anti-AFK: новичок с маленьким уроном но активный - eligible
    const isEligibleForReward = entry.isEligible;

    // Calculate chest rewards (includes lottery tickets)
    const chestRewards = getChestRewardsByRank(rank, isEligibleForReward);

    rewards.push({
      odamage: entry.odamage,
      visitorName: entry.visitorName,
      photoUrl: entry.photoUrl,
      damage: entry.damage,
      damagePercent: Math.round(damagePercent * 100),
      rank,
      isEligible: isEligibleForReward,
      goldReward,
      expReward,
      chestRewards,
      isFinalBlow,
      isTopDamage,
      // PS/XP fields (populated after XP calculation)
      ps: entry.ps || 0,
      xpGain: 0,
      spGain: 0,
      mentorBoost: 1.0,
    });

    // ═══════════════════════════════════════════════════════════
    // UPDATE PLAYER STATS: XP/SP (participation-based), level, skills
    // ═══════════════════════════════════════════════════════════
    try {
      // Fetch current user data for level/skill calculations
      const currentUser = await prisma.user.findUnique({
        where: { id: entry.odamage },
        select: { level: true, exp: true, sp: true, skillFireball: true, skillIceball: true, skillLightning: true },
      });

      if (!currentUser) continue;

      // Get XP distribution for this player (if participant)
      const xpData = xpDistribution.get(entry.odamage);
      let xpGain = 0;
      let spGain = 0;
      let mentorBoost = 1.0;

      if (xpData) {
        // Apply Mentor Boost for catch-up
        mentorBoost = getMentorBoost(currentUser.level, bossState.bossIndex);
        xpGain = Math.floor(xpData.xpRaw * mentorBoost);
        spGain = Math.floor(xpGain / SP_RATIO);

        // Add to rewards for logging
        rewards[rewards.length - 1].xpGain = xpGain;
        rewards[rewards.length - 1].spGain = spGain;
        rewards[rewards.length - 1].mentorBoost = mentorBoost;
      }

      // Calculate new exp and level
      const newExp = Number(currentUser.exp) + xpGain;
      const newLevel = Math.min(MAX_LEVEL, getLevelFromXp(newExp));
      const newSp = (currentUser.sp || 0) + spGain;

      // Get skills used by this player
      const skillsUsed = entry.skillsUsed || new Set();

      // Calculate new skill levels
      let newSkillFireball = currentUser.skillFireball;
      let newSkillIceball = currentUser.skillIceball;
      let newSkillLightning = currentUser.skillLightning;

      // Unlock skills based on NEW level
      if (newLevel >= 1 && newSkillFireball === 0) newSkillFireball = 1;
      if (newLevel >= 2 && newSkillIceball === 0) newSkillIceball = 1;
      if (newLevel >= 3 && newSkillLightning === 0) newSkillLightning = 1;

      // +1 skill level for each skill used (only if unlocked)
      if (skillsUsed.has('fireball') && newSkillFireball > 0) newSkillFireball++;
      if (skillsUsed.has('iceball') && newSkillIceball > 0) newSkillIceball++;
      if (skillsUsed.has('lightning') && newSkillLightning > 0) newSkillLightning++;

      // Update user in DB with new XP-based progression
      await prisma.user.update({
        where: { id: entry.odamage },
        data: {
          exp: BigInt(newExp),
          sp: newSp,
          level: newLevel,
          bossesKilled: { increment: isEligibleForReward ? 1 : 0 },
          skillFireball: newSkillFireball,
          skillIceball: newSkillIceball,
          skillLightning: newSkillLightning,
        },
      });

      // Log XP gain and level-up
      if (xpGain > 0) {
        const boostStr = mentorBoost > 1 ? ` (boost: ${mentorBoost.toFixed(2)}x)` : '';
        console.log(`[XP] ${entry.visitorName}: +${xpGain} XP, +${spGain} SP${boostStr}`);
      }
      if (newLevel > currentUser.level) {
        console.log(`[Level] ${entry.visitorName} leveled up: ${currentUser.level} → ${newLevel}`);
      }
      if (skillsUsed.size > 0) {
        console.log(`[Skills] ${entry.visitorName} skills used: ${[...skillsUsed].join(', ')}`);
      }

      // Create PendingReward for eligible players (TZ Этап 2)
      // Includes: chests + lottery tickets + crystals + badges
      if (entry.isEligible) {
        const totalChests = chestRewards.wooden + chestRewards.bronze + chestRewards.silver + chestRewards.gold;
        const hasReward = totalChests > 0 || chestRewards.lotteryTickets > 0 || chestRewards.badge;
        if (hasReward) {
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
                crystals: chestRewards.crystals,
                lotteryTickets: chestRewards.lotteryTickets,
                badgeId: chestRewards.badge,
                badgeDuration: chestRewards.badgeDays,
              },
            });
            console.log(`[Reward] Created pending reward for ${entry.visitorName} (rank ${rank}): ${chestRewards.wooden}W ${chestRewards.bronze}B ${chestRewards.silver}S ${chestRewards.gold}G +${chestRewards.lotteryTickets}🎟️ +${chestRewards.crystals}💎`);
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
          // Reset session counters for new boss
          p.sessionDamage = 0;
          p.sessionClicks = 0;
          p.savedSessionDamage = 0;
          p.savedSessionClicks = 0;
          // Reset activity for next boss
          p.activityTime = 0;
          p.isEligible = false;
          p.activityBossSession = null;
          // Update level, exp, sp and skills in memory
          p.level = newLevel;
          p.exp = newExp;
          p.sp = newSp;
          p.skillFireball = newSkillFireball;
          p.skillIceball = newSkillIceball;
          p.skillLightning = newSkillLightning;
          // Emit level:up to this player's socket (includes xp/sp gains)
          const playerSocket = io.sockets.sockets.get(sid);
          if (playerSocket) {
            playerSocket.emit('level:up', {
              level: newLevel,
              exp: newExp,
              sp: newSp,
              xpGain,
              spGain,
              skillFireball: newSkillFireball,
              skillIceball: newSkillIceball,
              skillLightning: newSkillLightning,
            });
          }
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
    bossNameRu: bossState.nameRu,
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

  // Set respawn timer (30 seconds)
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

  // ═══════════════════════════════════════════════════════════
  // DIAGNOSTIC LOGS: Top 5 by XP, average mentor boost
  // ═══════════════════════════════════════════════════════════
  const rewardsWithXp = rewards.filter(r => r.xpGain > 0).sort((a, b) => b.xpGain - a.xpGain);
  const top5XpRecipients = rewardsWithXp.slice(0, 5).map(r =>
    `${r.visitorName}: ${r.xpGain} XP (PS:${r.ps || 0}, boost:${(r.mentorBoost || 1).toFixed(2)})`
  );
  console.log(`[XP Distribution] Boss #${bossState.bossIndex}, Pool: ${bossXpPool} XP, Recipients: ${rewardsWithXp.length}`);
  console.log(`[XP Distribution] Top 5 by XP: ${top5XpRecipients.join(' | ')}`);

  // Calculate average mentor boost
  const boostValues = rewardsWithXp.map(r => r.mentorBoost || 1);
  const avgBoost = boostValues.length > 0 ? boostValues.reduce((a, b) => a + b, 0) / boostValues.length : 1;
  if (avgBoost > 1) {
    console.log(`[Mentor Boost] Average boost: ${avgBoost.toFixed(2)}x among ${boostValues.filter(b => b > 1).length} players`);
  }

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
    addLog('info', 'system', 'Server started, database connected');
  } catch (err) {
    console.error('[Prisma] Connection error:', err.message);
  }

  // ═══════════════════════════════════════════════════════════
  // ONE-TIME MIGRATION: Convert generic equipment to novice set
  // ═══════════════════════════════════════════════════════════
  try {
    // Check if there are any non-starter equipment templates
    const genericEquipment = await prisma.equipment.findMany({
      where: {
        code: { not: { startsWith: 'starter-' } },
      },
    });

    if (genericEquipment.length > 0) {
      console.log(`[Migration] Found ${genericEquipment.length} generic equipment items to migrate`);

      // Map slot to starter code
      const slotToStarter = {
        WEAPON: 'starter-sword',
        HELMET: 'starter-helmet',
        CHEST: 'starter-chest',
        GLOVES: 'starter-gloves',
        LEGS: 'starter-legs',
        BOOTS: 'starter-boots',
        SHIELD: 'starter-shield',
      };

      for (const generic of genericEquipment) {
        const starterCode = slotToStarter[generic.slot];
        if (!starterCode) continue;

        // Find starter equipment for this slot
        const starter = await prisma.equipment.findUnique({
          where: { code: starterCode },
        });

        if (starter) {
          // Reassign all UserEquipment from generic to starter
          const updated = await prisma.userEquipment.updateMany({
            where: { equipmentId: generic.id },
            data: { equipmentId: starter.id },
          });

          if (updated.count > 0) {
            console.log(`[Migration] Moved ${updated.count} items from ${generic.code} to ${starterCode}`);
          }

          // Delete the generic equipment template
          await prisma.equipment.delete({ where: { id: generic.id } });
          console.log(`[Migration] Deleted generic equipment: ${generic.code}`);
        }
      }

      console.log('[Migration] Generic equipment migration complete');
    }

    // Starter items are NOT droppable (они выдаются только новичкам)
    await prisma.equipment.updateMany({
      where: { code: { startsWith: 'starter-' } },
      data: { droppable: false },
    });

    // ═══════════════════════════════════════════════════════════
    // SEED DROPPABLE EQUIPMENT (50 items)
    // ═══════════════════════════════════════════════════════════
    let seededCount = 0;
    for (const item of DROPPABLE_EQUIPMENT) {
      const existing = await prisma.equipment.findUnique({
        where: { code: item.code },
      });

      if (!existing) {
        await prisma.equipment.create({
          data: {
            code: item.code,
            name: item.name,
            nameRu: item.name,
            icon: item.icon,
            slot: item.slot,
            rarity: item.rarity,
            pAtkMin: 0,
            pAtkMax: 0,
            pDefMin: item.pDef || 0,
            pDefMax: item.pDef || 0,
            droppable: true,
          },
        });
        seededCount++;
      } else if (!existing.droppable) {
        // Ensure droppable is true for existing items
        await prisma.equipment.update({
          where: { code: item.code },
          data: { droppable: true },
        });
      }
    }
    if (seededCount > 0) {
      console.log(`[Seed] Created ${seededCount} new equipment templates`);
    }
    console.log(`[Seed] Total droppable equipment: ${DROPPABLE_EQUIPMENT.length}`);
  } catch (err) {
    console.error('[Migration] Error:', err.message);
  }

  // Try to load saved boss state first
  const loadedState = await loadBossState(prisma);
  console.log(`[Startup] loadBossState returned: ${loadedState}`);
  if (!loadedState || loadedState === 'respawn' || loadedState === 'respawn_current') {
    // No saved state OR boss HP=0 with expired respawn timer - spawn boss
    // 'respawn' = boss was killed, advance to NEXT boss
    // 'respawn_current' = old timer cleared, stay on CURRENT boss
    const forceNext = loadedState === 'respawn'; // Only advance if HP=0 (was killed)
    console.log(`[Startup] Calling respawnBoss with forceNext=${forceNext} (state: ${loadedState})`);
    await respawnBoss(prisma, forceNext);
    await saveBossState(prisma);
  } else {
    console.log(`[Startup] Boss loaded from DB: ${bossState.name} HP=${bossState.currentHp}/${bossState.maxHp}`);
  }

  // Periodic boss state save (every 1 second - frequent saves prevent data loss on deploy)
  setInterval(() => {
    saveBossState(prisma);
  }, 1000);

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

      // Debug endpoint - shows boss state and startup info
      if (parsedUrl.pathname === '/api/debug') {
        const uptime = process.uptime();
        const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          server: {
            uptime: uptimeStr,
            uptimeSeconds: Math.floor(uptime),
            startedAt: new Date(Date.now() - uptime * 1000).toISOString(),
            memoryMB: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
          },
          boss: {
            name: bossState.name,
            nameRu: bossState.nameRu,
            currentHp: bossState.currentHp,
            maxHp: bossState.maxHp,
            hpPercent: ((bossState.currentHp / bossState.maxHp) * 100).toFixed(1) + '%',
            bossIndex: currentBossIndex,
            respawnAt: bossRespawnAt ? bossRespawnAt.toISOString() : null,
            isRespawning: bossRespawnAt && bossRespawnAt > new Date(),
          },
          session: {
            playersOnline: onlineUsers.size,
            leaderboardSize: sessionLeaderboard.size,
            topDamage: sessionLeaderboard.size > 0
              ? Math.max(...Array.from(sessionLeaderboard.values()).map(v => v.damage))
              : 0,
          },
          debug: {
            startupLogs: global.startupLogs || [],
            lastSave: global.lastSaveTime ? new Date(global.lastSaveTime).toISOString() : null,
          }
        }, null, 2));
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
          if (body.thorns !== undefined) bossState.thornsDamage = Math.max(0, body.thorns);
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
              _count: { select: { chests: true } },
            },
          });

          const total = await prisma.user.count({ where });
          sendJson({
            success: true,
            total,
            users: users.map(u => ({
              id: u.id,
              telegramId: u.telegramId.toString(),
              username: u.username,
              firstName: u.firstName,
              photoUrl: u.photoUrl,
              level: u.level,
              gold: Number(u.gold),
              totalDamage: Number(u.totalDamage),
              _count: u._count,
            })),
          });
          return;
        }

        // Get single user by ID
        if (parsedUrl.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && req.method === 'GET') {
          const userId = parsedUrl.pathname.split('/').pop();
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) {
            sendJson({ success: false, error: 'User not found' }, 404);
            return;
          }
          // Convert ALL BigInt fields to Number for JSON serialization
          sendJson({
            success: true,
            user: {
              id: user.id,
              telegramId: user.telegramId.toString(),
              username: user.username,
              firstName: user.firstName,
              photoUrl: user.photoUrl,
              language: user.language,
              level: user.level,
              exp: Number(user.exp),
              // Legacy stats
              str: user.str,
              dex: user.dex,
              luck: user.luck,
              // L2 Core Attributes
              power: user.power,
              agility: user.agility,
              vitality: user.vitality,
              intellect: user.intellect,
              spirit: user.spirit,
              // Derived stats
              pAtk: user.pAtk,
              critChance: user.critChance,
              critDamage: user.critDamage,
              attackSpeed: user.attackSpeed,
              physicalPower: user.physicalPower,
              maxHealth: user.maxHealth,
              physicalDefense: user.physicalDefense,
              // Stamina
              stamina: user.stamina,
              maxStamina: user.maxStamina,
              // Mana
              mana: user.mana,
              maxMana: user.maxMana,
              manaRegen: user.manaRegen,
              // Currencies
              gold: Number(user.gold),
              ancientCoin: user.ancientCoin,
              tonBalance: user.tonBalance,
              // Chests
              chestSlots: user.chestSlots,
              totalGoldEarned: Number(user.totalGoldEarned || 0),
              // Consumables
              enchantScrolls: user.enchantScrolls,
              ether: user.ether,
              // Progress
              totalDamage: Number(user.totalDamage),
              totalClicks: Number(user.totalClicks || 0),
              bossesKilled: user.bossesKilled,
              isFirstLogin: user.isFirstLogin,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
          });
          return;
        }

        // Get user stats by username (for debugging damage)
        if (parsedUrl.pathname === '/api/admin/user-stats' && req.method === 'GET') {
          const username = parsedUrl.query.username;
          if (!username) {
            sendJson({ success: false, error: 'Username required' }, 400);
            return;
          }
          const user = await prisma.user.findFirst({
            where: { username: { equals: username, mode: 'insensitive' } },
            include: { equipment: true },
          });
          if (!user) {
            sendJson({ success: false, error: 'User not found' }, 404);
            return;
          }
          // Calculate damage formula
          const baseDamage = user.pAtk * (1 + user.str * 0.08);
          sendJson({
            success: true,
            username: user.username,
            firstName: user.firstName,
            // Combat stats
            pAtk: user.pAtk,
            str: user.str,
            dex: user.dex,
            luck: user.luck,
            critChance: user.critChance,
            // L2 attributes
            power: user.power,
            agility: user.agility,
            vitality: user.vitality,
            intellect: user.intellect,
            spirit: user.spirit,
            // Consumables
            ether: user.ether,
            autoEther: user.autoEther,
            potionHaste: user.potionHaste,
            potionAcumen: user.potionAcumen,
            potionLuck: user.potionLuck,
            // Progress
            totalDamage: user.totalDamage.toString(),
            bossesKilled: user.bossesKilled,
            // Equipment
            equipment: user.equipment,
            // Calculated
            baseDamagePerTap: Math.floor(baseDamage),
            damageWithCrit: Math.floor(baseDamage * 2),
            damageWithEther: Math.floor(baseDamage * 2),
            maxDamagePerTap: Math.floor(baseDamage * 2 * 1.5 * 2 * 2), // Ether + Acumen + Rage + Crit
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

        // Give crystals (ancientCoin)
        if (parsedUrl.pathname === '/api/admin/crystals/give' && req.method === 'POST') {
          const body = await parseBody();
          const { username, amount } = body;

          const user = await prisma.user.findFirst({ where: { username: username } });
          if (!user) {
            sendJson({ success: false, error: 'User not found' }, 404);
            return;
          }

          const updated = await prisma.user.update({
            where: { id: user.id },
            data: { ancientCoin: { increment: amount || 0 } },
          });

          console.log(`[Admin] Gave ${amount} crystals to ${username}`);
          sendJson({ success: true, username, newBalance: updated.ancientCoin });
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

          // Delete everything in correct order (foreign keys)
          await prisma.damageLog.deleteMany({});
          await prisma.pendingReward.deleteMany({});
          await prisma.userBadge.deleteMany({});
          await prisma.userEquipment.deleteMany({});
          await prisma.userTask.deleteMany({});
          await prisma.activeBuff.deleteMany({});
          await prisma.chest.deleteMany({});
          await prisma.inventoryItem.deleteMany({});
          await prisma.bossSession.deleteMany({});
          await prisma.user.deleteMany({});
          await prisma.gameState.deleteMany({});

          // Clear in-memory state
          onlineUsers.clear();
          sessionLeaderboard.clear();
          previousBossSession = null;

          // Reset boss
          currentBossIndex = 0;
          bossRespawnAt = null;
          await respawnBoss(prisma, false);
          await saveBossState(prisma);

          addLog('warn', 'system', 'DATABASE RESET by admin');
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

        // Danger zone: Delete single user completely
        if (parsedUrl.pathname === '/api/admin/danger/delete-user' && req.method === 'POST') {
          try {
            const body = await parseBody();
            if (body.confirmPassword !== RESET_PASSWORD) {
              sendJson({ success: false, error: 'Invalid reset password' }, 403);
              return;
            }

            const { odamage, telegramId } = body;
            if (!odamage && !telegramId) {
              sendJson({ success: false, error: 'Provide odamage or telegramId' }, 400);
              return;
            }

            // Find user
            const user = odamage
              ? await prisma.user.findUnique({ where: { id: odamage } })
              : await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });

            if (!user) {
              sendJson({ success: false, error: 'User not found' }, 404);
              return;
            }

            const userId = user.id;

            // Delete all related data (cascade should handle most, but be explicit)
            await prisma.dailyTaskProgress.deleteMany({ where: { odamage: userId } });
            await prisma.weeklyTaskProgress.deleteMany({ where: { odamage: userId } });
            await prisma.pendingReward.deleteMany({ where: { userId } });
            await prisma.userBadge.deleteMany({ where: { userId } });
            await prisma.userEquipment.deleteMany({ where: { userId } });
            await prisma.userTask.deleteMany({ where: { odamage: userId } });
            await prisma.chest.deleteMany({ where: { userId } });
            await prisma.activeBuff.deleteMany({ where: { userId } });
            await prisma.inventoryItem.deleteMany({ where: { userId } });
            await prisma.damageLog.deleteMany({ where: { odamage: userId } });

            // Delete user
            await prisma.user.delete({ where: { id: userId } });

            // Remove from online users
            for (const [socketId, player] of onlineUsers.entries()) {
              if (player.odamage === userId) {
                onlineUsers.delete(socketId);
              }
            }

            // Remove from session leaderboard
            sessionLeaderboard.delete(userId);

            addLog('warn', 'system', `User ${user.username || user.telegramId} DELETED by admin`);
            sendJson({ success: true, deleted: { odamage: userId, telegramId: user.telegramId.toString(), username: user.username } });
          } catch (err) {
            console.error('[Admin] Delete user error:', err);
            addLog('error', 'system', 'Delete user failed', { error: err.message });
            sendJson({ success: false, error: err.message }, 500);
          }
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

        // Danger zone: Prisma DB Push (sync schema)
        if (parsedUrl.pathname === '/api/admin/danger/db-push' && req.method === 'POST') {
          const body = await parseBody();
          if (body.confirmPassword !== RESET_PASSWORD) {
            sendJson({ success: false, error: 'Invalid reset password' }, 403);
            return;
          }

          const forceAcceptDataLoss = body.force === true;
          const command = forceAcceptDataLoss
            ? 'npx prisma db push --accept-data-loss'
            : 'npx prisma db push';

          console.log(`[Admin] Running: ${command}`);
          addLog('warn', 'system', `DB Push initiated by admin (force=${forceAcceptDataLoss})`);

          exec(command, { cwd: process.cwd(), timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
              console.error('[Admin] DB Push error:', error.message);
              console.error('[Admin] stderr:', stderr);
              addLog('error', 'system', 'DB Push failed', { error: error.message, stderr });
            } else {
              console.log('[Admin] DB Push success:', stdout);
              addLog('info', 'system', 'DB Push completed successfully', { stdout });
            }
          });

          // Return immediately, command runs async
          sendJson({
            success: true,
            message: `DB Push started (force=${forceAcceptDataLoss}). Check logs for result.`,
            command
          });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // NEW ADMIN ENDPOINTS
        // ═══════════════════════════════════════════════════════════

        // Online Players - real-time list
        if (parsedUrl.pathname === '/api/admin/online' && req.method === 'GET') {
          const onlinePlayers = [];
          for (const [socketId, player] of onlineUsers.entries()) {
            if (player.odamage) {
              onlinePlayers.push({
                odamage: player.odamage,
                odamageN: player.odamageN,
                odamageU: player.odamageU,
                photoUrl: player.photoUrl,
                sessionDamage: player.sessionDamage || 0,
                isEligible: player.isEligible || false,
                activityTime: player.activityTime || 0,
                lastActivity: player.lastActivityPing || 0,
              });
            }
          }
          sendJson({
            success: true,
            count: onlinePlayers.length,
            players: onlinePlayers.sort((a, b) => b.sessionDamage - a.sessionDamage),
          });
          return;
        }

        // Pending Rewards - list all unclaimed
        if (parsedUrl.pathname === '/api/admin/rewards' && req.method === 'GET') {
          const rewards = await prisma.pendingReward.findMany({
            where: { claimed: false },
            include: { user: { select: { firstName: true, username: true, photoUrl: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });
          sendJson({
            success: true,
            rewards: rewards.map(r => ({
              id: r.id,
              odamage: r.userId,
              playerName: r.user.firstName || r.user.username || 'Anonymous',
              photoUrl: r.user.photoUrl,
              bossName: r.bossName,
              bossIcon: r.bossIcon,
              rank: r.rank,
              chestsWooden: r.chestsWooden,
              chestsBronze: r.chestsBronze,
              chestsSilver: r.chestsSilver,
              chestsGold: r.chestsGold,
              badgeId: r.badgeId,
              createdAt: r.createdAt,
            })),
          });
          return;
        }

        // Give pending reward manually
        if (parsedUrl.pathname === '/api/admin/rewards/give' && req.method === 'POST') {
          const body = await parseBody();
          const { odamage, bossName, rank, chestsWooden, chestsBronze, chestsSilver, chestsGold, badgeId, badgeDuration } = body;

          if (!odamage) {
            sendJson({ success: false, error: 'userId required' }, 400);
            return;
          }

          const reward = await prisma.pendingReward.create({
            data: {
              userId: odamage,
              bossSessionId: 'admin-' + Date.now(),
              bossName: bossName || 'Admin Gift',
              bossIcon: '🎁',
              rank: rank || null,
              wasEligible: true,
              chestsWooden: chestsWooden || 0,
              chestsBronze: chestsBronze || 0,
              chestsSilver: chestsSilver || 0,
              chestsGold: chestsGold || 0,
              badgeId: badgeId || null,
              badgeDuration: badgeDuration || null,
            },
          });

          sendJson({ success: true, reward });
          return;
        }

        // Delete pending reward
        if (parsedUrl.pathname === '/api/admin/rewards/delete' && req.method === 'POST') {
          const body = await parseBody();
          await prisma.pendingReward.delete({ where: { id: body.rewardId } });
          sendJson({ success: true });
          return;
        }

        // Boss Sessions history
        if (parsedUrl.pathname === '/api/admin/boss-sessions' && req.method === 'GET') {
          const sessions = await prisma.bossSession.findMany({
            where: { endedAt: { not: null } },
            orderBy: { endedAt: 'desc' },
            take: 50,
            select: {
              id: true,
              bossName: true,
              startedAt: true,
              endedAt: true,
              maxHp: true,
              totalDamage: true,
              finalBlowBy: true,
              finalBlowName: true,
              topDamageBy: true,
              topDamageName: true,
              topDamage: true,
              chestsPool: true,
            },
          });
          sendJson({
            success: true,
            sessions: sessions.map(s => ({
              ...s,
              maxHp: Number(s.maxHp),
              totalDamage: Number(s.totalDamage),
              topDamage: s.topDamage ? Number(s.topDamage) : null,
            })),
          });
          return;
        }

        // User Equipment - get user's inventory
        if (parsedUrl.pathname.match(/^\/api\/admin\/users\/[^/]+\/equipment$/) && req.method === 'GET') {
          const userId = parsedUrl.pathname.split('/')[4];
          const equipment = await prisma.userEquipment.findMany({
            where: { userId },
            include: { equipment: true },
            orderBy: { isEquipped: 'desc' },
          });
          sendJson({
            success: true,
            equipment: equipment.map(e => ({
              id: e.id,
              code: e.equipment.code,
              name: e.equipment.name,
              icon: e.equipment.icon,
              slot: e.equipment.slot,
              rarity: e.equipment.rarity,
              pAtk: e.pAtk,
              pDef: e.pDef,
              enchant: e.enchant,
              isEquipped: e.isEquipped,
            })),
          });
          return;
        }

        // User Badges
        if (parsedUrl.pathname.match(/^\/api\/admin\/users\/[^/]+\/badges$/) && req.method === 'GET') {
          const userId = parsedUrl.pathname.split('/')[4];
          const badges = await prisma.userBadge.findMany({
            where: { userId },
            orderBy: { expiresAt: 'desc' },
          });
          sendJson({ success: true, badges });
          return;
        }

        // List ALL Badges
        if (parsedUrl.pathname === '/api/admin/badges' && req.method === 'GET') {
          const badges = await prisma.userBadge.findMany({
            where: { expiresAt: { gt: new Date() } },
            include: { user: { select: { firstName: true, username: true } } },
            orderBy: { expiresAt: 'desc' },
            take: 100,
          });
          sendJson({ success: true, badges });
          return;
        }

        // Give Badge
        if (parsedUrl.pathname === '/api/admin/badges/give' && req.method === 'POST') {
          const body = await parseBody();
          const { odamage, badgeId, name, icon, durationDays } = body;

          const badge = await prisma.userBadge.create({
            data: {
              userId: odamage,
              badgeId: badgeId || 'custom',
              name: name || 'Custom Badge',
              icon: icon || '🏅',
              expiresAt: new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000),
            },
          });
          sendJson({ success: true, badge });
          return;
        }

        // Delete Badge
        if (parsedUrl.pathname === '/api/admin/badges/delete' && req.method === 'POST') {
          const body = await parseBody();
          await prisma.userBadge.delete({ where: { id: body.badgeId } });
          sendJson({ success: true });
          return;
        }

        // Give Consumables
        if (parsedUrl.pathname === '/api/admin/consumables/give' && req.method === 'POST') {
          const body = await parseBody();
          const { odamage, ether, potionHaste, potionAcumen, potionLuck, enchantScrolls } = body;

          const updateData = {};
          if (ether) updateData.ether = { increment: ether };
          if (potionHaste) updateData.potionHaste = { increment: potionHaste };
          if (potionAcumen) updateData.potionAcumen = { increment: potionAcumen };
          if (potionLuck) updateData.potionLuck = { increment: potionLuck };
          if (enchantScrolls) updateData.enchantScrolls = { increment: enchantScrolls };

          const user = await prisma.user.update({
            where: { id: odamage },
            data: updateData,
            select: { ether: true, potionHaste: true, potionAcumen: true, potionLuck: true, enchantScrolls: true },
          });
          sendJson({ success: true, consumables: user });
          return;
        }

        // User Active Buffs
        if (parsedUrl.pathname.match(/^\/api\/admin\/users\/[^/]+\/buffs$/) && req.method === 'GET') {
          const userId = parsedUrl.pathname.split('/')[4];
          const buffs = await prisma.activeBuff.findMany({
            where: { userId, expiresAt: { gt: new Date() } },
          });
          sendJson({ success: true, buffs });
          return;
        }

        // Game Stats
        if (parsedUrl.pathname === '/api/admin/stats' && req.method === 'GET') {
          const [totalUsers, totalDamage, totalChests, totalSessions] = await Promise.all([
            prisma.user.count(),
            prisma.user.aggregate({ _sum: { totalDamage: true } }),
            prisma.chest.count(),
            prisma.bossSession.count({ where: { endedAt: { not: null } } }),
          ]);

          // Users registered today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const newUsersToday = await prisma.user.count({
            where: { createdAt: { gte: today } },
          });

          sendJson({
            success: true,
            stats: {
              totalUsers,
              newUsersToday,
              playersOnline: onlineUsers.size,
              totalDamage: Number(totalDamage._sum.totalDamage || 0),
              totalChests,
              totalBossKills: totalSessions,
              currentBossIndex: currentBossIndex + 1,
            },
          });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // ADMIN LOGS API
        // ═══════════════════════════════════════════════════════════

        // Get Logs
        if (parsedUrl.pathname === '/api/admin/logs' && req.method === 'GET') {
          const level = parsedUrl.query.level;
          const category = parsedUrl.query.category;
          const limit = parseInt(parsedUrl.query.limit || '200');
          const search = parsedUrl.query.search?.toLowerCase();

          let logs = [...logBuffer];

          if (level && level !== 'all') {
            logs = logs.filter(l => l.level === level);
          }
          if (category && category !== 'all') {
            logs = logs.filter(l => l.category === category);
          }
          if (search) {
            logs = logs.filter(l => l.message.toLowerCase().includes(search));
          }

          sendJson({
            success: true,
            logs: logs.slice(-limit).reverse(),
            total: logBuffer.length,
          });
          return;
        }

        // Clear Logs
        if (parsedUrl.pathname === '/api/admin/logs/clear' && req.method === 'POST') {
          logBuffer.length = 0;
          addLog('info', 'system', 'Logs cleared by admin');
          sendJson({ success: true });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // FORGE STATS API
        // ═══════════════════════════════════════════════════════════

        if (parsedUrl.pathname === '/api/admin/forge-stats' && req.method === 'GET') {
          // Get broken items count from DB
          const brokenItems = await prisma.userEquipment.count({
            where: { isBroken: true },
          });

          // Get salvage/fusion stats from memory + DB aggregates
          const [totalEquipment, totalDust] = await Promise.all([
            prisma.userEquipment.count(),
            prisma.user.aggregate({ _sum: { enchantDust: true } }),
          ]);

          sendJson({
            success: true,
            forge: {
              ...gameStats.forge,
              brokenItemsActive: brokenItems,
              totalEquipmentInGame: totalEquipment,
              totalDustInGame: Number(totalDust._sum.enchantDust || 0),
            },
          });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // ENCHANT STATS API
        // ═══════════════════════════════════════════════════════════

        if (parsedUrl.pathname === '/api/admin/enchant-stats' && req.method === 'GET') {
          // Get top enchanted items from DB
          const topEnchanted = await prisma.userEquipment.findMany({
            where: { enchantLevel: { gt: 0 } },
            orderBy: { enchantLevel: 'desc' },
            take: 10,
            include: {
              user: { select: { firstName: true, username: true } },
              equipment: { select: { name: true, rarity: true } },
            },
          });

          // Calculate success rates from attempts
          const successRates = {};
          for (const [level, data] of Object.entries(gameStats.enchant.attempts)) {
            const total = data.success + data.fail;
            successRates[level] = {
              ...data,
              total,
              rate: total > 0 ? Math.round((data.success / total) * 100) : 0,
            };
          }

          sendJson({
            success: true,
            enchant: {
              successRates,
              protectionUsed: gameStats.enchant.protectionUsed,
              highestEnchant: gameStats.enchant.highestEnchant,
              topItems: topEnchanted.map(e => ({
                name: e.equipment?.name || 'Unknown',
                rarity: e.equipment?.rarity || 'common',
                level: e.enchantLevel,
                owner: e.user?.firstName || e.user?.username || 'Unknown',
              })),
            },
          });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // ETHER ECONOMY API
        // ═══════════════════════════════════════════════════════════

        if (parsedUrl.pathname === '/api/admin/ether-stats' && req.method === 'GET') {
          resetDailyStats(); // Check if we need to reset daily counters

          // Get totals from DB
          const [etherTotal, dustTotal, activeUsers] = await Promise.all([
            prisma.user.aggregate({ _sum: { ether: true } }),
            prisma.user.aggregate({ _sum: { etherDust: true } }),
            prisma.user.count({ where: { lastOnline: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
          ]);

          sendJson({
            success: true,
            ether: {
              totalEtherInGame: Number(etherTotal._sum.ether || 0),
              totalDustInGame: Number(dustTotal._sum.etherDust || 0),
              usedToday: gameStats.ether.usedToday,
              craftedToday: gameStats.ether.craftedToday,
              dustGeneratedToday: gameStats.ether.dustGenerated,
              activeUsersLast24h: activeUsers,
              meditatingNow: Array.from(onlineUsers.values()).filter(p => !p.odamage).length,
            },
          });
          return;
        }

        // ═══════════════════════════════════════════════════════════
        // BROKEN ITEMS MANAGEMENT
        // ═══════════════════════════════════════════════════════════

        if (parsedUrl.pathname === '/api/admin/broken-items' && req.method === 'GET') {
          const brokenItems = await prisma.userEquipment.findMany({
            where: { isBroken: true },
            include: {
              user: { select: { id: true, firstName: true, username: true } },
              equipment: { select: { name: true, rarity: true } },
            },
            orderBy: { brokenAt: 'desc' },
            take: 100,
          });

          sendJson({
            success: true,
            items: brokenItems.map(item => ({
              id: item.id,
              name: item.equipment?.name || 'Unknown',
              rarity: item.equipment?.rarity || 'common',
              enchantLevel: item.enchantLevel,
              owner: item.user?.firstName || item.user?.username || 'Unknown',
              ownerId: item.user?.id,
              brokenAt: item.brokenAt,
              expiresAt: item.brokenAt ? new Date(item.brokenAt.getTime() + 8 * 60 * 60 * 1000) : null,
            })),
          });
          return;
        }

        // Force restore broken item (admin)
        if (parsedUrl.pathname === '/api/admin/broken-items/restore' && req.method === 'POST') {
          const body = await parseBody();
          const { itemId } = body;

          await prisma.userEquipment.update({
            where: { id: itemId },
            data: { isBroken: false, brokenAt: null },
          });

          addLog('info', 'forge', `Admin restored broken item ${itemId}`);
          sendJson({ success: true });
          return;
        }

        // Force delete broken item (admin)
        if (parsedUrl.pathname === '/api/admin/broken-items/delete' && req.method === 'POST') {
          const body = await parseBody();
          const { itemId } = body;

          await prisma.userEquipment.delete({ where: { id: itemId } });

          addLog('info', 'forge', `Admin deleted broken item ${itemId}`);
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
  // SSOT: Resource flush to DB
  // ─────────────────────────────────────────────────────────
  async function savePlayerResources(player) {
    if (!player.odamage || !player.resourcesLoaded || !player.dirty) return;

    try {
      await prisma.user.update({
        where: { id: player.odamage },
        data: {
          ether: player.ether ?? 0,
          etherDust: player.etherDust ?? 0,
          mana: player.mana ?? 0,
          stamina: player.stamina ?? 0,
          gold: BigInt(player.gold || 0),
          potionHaste: player.potionHaste ?? 0,
          potionAcumen: player.potionAcumen ?? 0,
          potionLuck: player.potionLuck ?? 0,
          autoEther: player.autoEther ?? false,
          autoAttack: player.autoAttack ?? false,
          // ═══ SKILLS v1.4: Save casts ═══
          skillFireballCasts: player.skillFireballCasts ?? 0,
          skillIceballCasts: player.skillIceballCasts ?? 0,
          skillLightningCasts: player.skillLightningCasts ?? 0,
        },
      });
      player.dirty = false;
      // Debug log (throttled)
      if (!savePlayerResources.lastLog || Date.now() - savePlayerResources.lastLog > 60000) {
        console.log(`[SSOT] Flushed resources for ${player.odamageN}`);
        savePlayerResources.lastLog = Date.now();
      }
    } catch (err) {
      console.error(`[SSOT] Flush error for ${player.odamage}:`, err.message);
    }
  }

  // Periodic flush every 10 seconds for all dirty players
  setInterval(async () => {
    for (const [, player] of onlineUsers.entries()) {
      if (player.dirty) {
        await savePlayerResources(player);
      }
    }
  }, 10000);

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
      telegramId: null, // For single-session enforcement
      odamageN: 'Guest',
      username: null, // Telegram username для debug-проверок
      photoUrl: null,
      // SSOT flags
      resourcesLoaded: false,  // True after auth loads DB values
      dirty: false,            // True if resources changed since last flush
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
      // Stamina System - use undefined so DB values are loaded on auth
      stamina: undefined,           // FIX: was initialDerived.maxStamina
      maxStamina: initialDerived.maxStamina,
      exhaustedUntil: null,  // timestamp when exhaustion ends
      // Mana system - use undefined so DB values are loaded on auth
      mana: undefined,              // FIX: was initialDerived.maxMana
      maxMana: initialDerived.maxMana,
      manaRegen: undefined,         // FIX: was BASE_MANA_REGEN
      // Tap & Auto-attack
      tapsPerSecond: BASE_TAPS_PER_SECOND,
      autoAttackSpeed: 0,
      lastTapTime: 0,
      tapCount: 0,
      // First login
      isFirstLogin: true,
      // Stats
      gold: 0,
      sessionDamage: 0,      // Накопленный урон за босса (для отображения)
      sessionClicks: 0,
      sessionCrits: 0,
      savedSessionDamage: 0, // Уже сохранённый в БД (для delta в auto-save)
      // Ether - use undefined so DB values are loaded on auth
      autoEther: false,
      ether: undefined,      // FIX: was 100, caused DB value to be ignored
      etherDust: undefined,  // FIX: explicitly undefined
      // Potions - use undefined so DB values are loaded on auth
      potionHaste: undefined,   // FIX: was 0, caused DB value to be ignored
      potionAcumen: undefined,  // FIX: was 0, caused DB value to be ignored
      potionLuck: undefined,    // FIX: was 0, caused DB value to be ignored
      // Active buffs (in-memory)
      activeBuffs: [],
      // Activity tracking for boss rewards (TZ Этап 2)
      activityTime: 0,           // Total time active (ms) for current boss
      lastActivityPing: 0,       // Last activity ping timestamp
      activityBossSession: null, // Which boss session this activity is for
      isEligible: false,         // 30+ seconds activity = eligible for rewards
      // Session heartbeat - prevents false offline rewards
      lastHeartbeat: Date.now(), // Updated every 30 sec while app is open
    };

    onlineUsers.set(socket.id, player);

    // Send initial state (with all fields including image)
    // FIX: Use bossState.image directly (set correctly in respawnBoss)
    // FIX: Ensure no null values are sent to client
    socket.emit('boss:state', {
      id: bossState.id || 'default-0',
      name: bossState.name || 'Boss',
      nameRu: bossState.nameRu || bossState.name || 'Boss',
      title: bossState.title || 'World Boss',
      hp: bossState.currentHp ?? 0,
      maxHp: bossState.maxHp ?? 500000,
      defense: bossState.defense ?? 0,
      ragePhase: bossState.ragePhase ?? 0,
      playersOnline: onlineUsers.size,
      icon: bossState.icon || '👹',
      image: bossState.image || '/assets/bosses/boss_single.png',
      bossIndex: bossState.bossIndex ?? 1,
      totalBosses: bossState.totalBosses ?? 4,
      // Respawn timer info
      isRespawning: bossRespawnAt !== null,
      respawnAt: bossRespawnAt ? bossRespawnAt.getTime() : null,
    });

    // FIX: Don't emit player:state here - it uses default values before auth!
    // player:state will be sent as part of periodic updates AFTER auth loads correct values
    // Removed early player:state emission to prevent stamina/mana reset bug

    // GET PLAYER DATA (for tabs that mount after auth)
    socket.on('player:get', async () => {
      if (!player.odamage) {
        socket.emit('player:data', null);
        return;
      }

      // SSOT guard: resources must be loaded before serving data
      if (!player.resourcesLoaded) {
        console.warn(`[SSOT] player:get called before auth for socket ${socket.id}`);
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
            // Combat stats (SSOT: from memory only)
            pAtk: player.pAtk,
            basePAtk: player.basePAtk,
            equipmentPAtk: player.equipmentPAtk ?? 0,
            pDef: player.pDef,
            mAtk: user.intellect * 2, // Magic attack based on intellect
            mDef: user.spirit * 2, // Magic defense based on spirit
            critChance: user.critChance,
            attackSpeed: user.attackSpeed,
            // Currency (gold from DB as it's updated there directly)
            gold: Number(user.gold),
            ancientCoin: user.ancientCoin,
            // Mana & Stamina (SSOT: from memory only)
            mana: player.mana,
            maxMana: player.maxMana,
            manaRegen: user.manaRegen,
            stamina: player.stamina,
            maxStamina: player.maxStamina,
            // Skills
            tapsPerSecond: user.tapsPerSecond,
            autoAttackSpeed: user.autoAttackSpeed,
            isFirstLogin: user.isFirstLogin,
            // Progression
            totalDamage: Number(user.totalDamage),
            bossesKilled: user.bossesKilled,
            // Consumables (SSOT: from memory only, NO DB FALLBACK)
            autoEther: player.autoEther,
            ether: player.ether,
            etherDust: player.etherDust,
            potionHaste: player.potionHaste,
            potionAcumen: player.potionAcumen,
            potionLuck: player.potionLuck,
            // Enchant System consumables (from DB - not frequently changed)
            enchantCharges: user.enchantCharges ?? 0,
            protectionCharges: user.protectionCharges ?? 0,
            // Chest Keys (from DB)
            keyWooden: user.keyWooden ?? 0,
            keyBronze: user.keyBronze ?? 0,
            keySilver: user.keySilver ?? 0,
            keyGold: user.keyGold ?? 0,
            // Lottery Tickets (from DB)
            lotteryTickets: user.lotteryTickets ?? 0,
            // Session stats (from memory, not DB)
            sessionDamage: player.sessionDamage || 0,
            // Participation Score (from current boss session)
            ps: sessionLeaderboard.get(player.odamage)?.ps || 0,
            psCap: PS_CAP_PER_BOSS,
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

      // Check if eligible: 60 seconds OR 20 actions (taps + skills)
      // Anti-AFK: новичок с маленьким уроном но активный - eligible
      const actions = player.sessionClicks || 0;
      if (!player.isEligible && (player.activityTime >= 60000 || actions >= 20)) {
        player.isEligible = true;
        console.log(`[Activity] ${player.odamageN} is now eligible (time: ${Math.floor(player.activityTime / 1000)}s, actions: ${actions})`);
      }

      // Send back activity status
      socket.emit('activity:status', {
        activityTime: player.activityTime,
        isEligible: player.isEligible,
      });
    });

    // ═══════════════════════════════════════════════════════════
    // SESSION HEARTBEAT - keeps lastHeartbeat fresh while app is open
    // This prevents false "offline" rewards when user just switches tabs
    // ═══════════════════════════════════════════════════════════
    socket.on('session:heartbeat', () => {
      if (!player.odamage) return;
      const now = Date.now();
      player.lastHeartbeat = now;
      // FIX: Also track by userId for cross-socket detection
      userLastHeartbeat.set(player.odamage, now);
    });

    // GET PENDING REWARDS
    socket.on('rewards:get', async () => {
      if (!player.odamage) {
        socket.emit('rewards:data', { rewards: [], slots: { max: 5, used: 0, free: 5, nextPrice: 50 } });
        return;
      }

      try {
        const [pendingRewards, user, chestCount] = await Promise.all([
          prisma.pendingReward.findMany({
            where: {
              userId: player.odamage,
              claimed: false,
            },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.user.findUnique({
            where: { id: player.odamage },
            select: { chestSlots: true, ancientCoin: true },
          }),
          prisma.chest.count({
            where: { userId: player.odamage },
          }),
        ]);

        const maxSlots = user?.chestSlots || 5;
        const purchasedSlots = maxSlots - 5;
        const nextPrice = getNextSlotPrice(purchasedSlots);

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
            lotteryTickets: r.lotteryTickets || 0,
            crystals: r.crystals || 0,
            badgeId: r.badgeId,
            badgeDuration: r.badgeDuration,
            createdAt: r.createdAt.getTime(),
          })),
          slots: {
            max: maxSlots,
            used: chestCount,
            free: Math.max(0, maxSlots - chestCount),
            nextPrice,
            crystals: user?.ancientCoin || 0,
          },
        });
      } catch (err) {
        console.error('[Rewards] Get error:', err.message);
        socket.emit('rewards:data', { rewards: [], slots: { max: 5, used: 0, free: 5, nextPrice: 50 } });
      }
    });

    // CLAIM PENDING REWARDS (partial selection)
    // data: { rewardId, take: { wooden: 2, bronze: 1, silver: 0, gold: 1 } }
    socket.on('rewards:claim', async (data) => {
      if (!player.odamage) {
        socket.emit('rewards:error', { message: 'Not authenticated' });
        return;
      }

      const { rewardId, take } = data;

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

        // Validate take request (can't take more than available)
        const takeWooden = Math.min(take?.wooden || 0, reward.chestsWooden);
        const takeBronze = Math.min(take?.bronze || 0, reward.chestsBronze);
        const takeSilver = Math.min(take?.silver || 0, reward.chestsSilver);
        const takeGold = Math.min(take?.gold || 0, reward.chestsGold);
        const totalToTake = takeWooden + takeBronze + takeSilver + takeGold;

        if (totalToTake === 0) {
          socket.emit('rewards:error', { message: 'Select at least one chest' });
          return;
        }

        // Get user's chest slot info
        const userSlotInfo = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { chestSlots: true, ancientCoin: true },
        });
        const currentChestCount = await prisma.chest.count({
          where: { userId: player.odamage },
        });
        const maxSlots = userSlotInfo?.chestSlots || 5;
        const freeSlots = Math.max(0, maxSlots - currentChestCount);

        if (totalToTake > freeSlots) {
          socket.emit('rewards:error', { message: `Only ${freeSlots} slots available` });
          return;
        }

        // Create selected chests
        const chestsToCreate = [];
        const chestConfigs = [
          { type: 'WOODEN', count: takeWooden },
          { type: 'BRONZE', count: takeBronze },
          { type: 'SILVER', count: takeSilver },
          { type: 'GOLD', count: takeGold },
        ];

        for (const { type, count } of chestConfigs) {
          for (let i = 0; i < count; i++) {
            chestsToCreate.push({
              userId: player.odamage,
              chestType: type,
              openingDuration: getChestDuration(type),
              fromBossId: null,
              fromSessionId: reward.bossSessionId,
            });
          }
        }

        if (chestsToCreate.length > 0) {
          await prisma.chest.createMany({ data: chestsToCreate });
        }

        // Calculate remaining chests
        const remainingWooden = reward.chestsWooden - takeWooden;
        const remainingBronze = reward.chestsBronze - takeBronze;
        const remainingSilver = reward.chestsSilver - takeSilver;
        const remainingGold = reward.chestsGold - takeGold;
        const totalRemaining = remainingWooden + remainingBronze + remainingSilver + remainingGold;

        // Award crystals on first claim (all at once)
        let crystalsAwarded = 0;
        if (reward.crystals > 0) {
          crystalsAwarded = reward.crystals;
          await prisma.user.update({
            where: { id: player.odamage },
            data: { ancientCoin: { increment: crystalsAwarded } },
          });
          player.ancientCoin = (player.ancientCoin || 0) + crystalsAwarded;
        }

        // Award lottery tickets (all at once, no slot limits)
        let ticketsAwarded = 0;
        if (reward.lotteryTickets > 0) {
          ticketsAwarded = reward.lotteryTickets;
          await prisma.user.update({
            where: { id: player.odamage },
            data: { lotteryTickets: { increment: ticketsAwarded } },
          });
          player.lotteryTickets = (player.lotteryTickets || 0) + ticketsAwarded;
        }

        // Create badge if awarded (on first claim)
        let badgeAwarded = null;
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
          badgeAwarded = reward.badgeId;
        }

        // Always mark as claimed (remaining chests are discarded)
        await prisma.pendingReward.update({
          where: { id: rewardId },
          data: {
            chestsWooden: 0,
            chestsBronze: 0,
            chestsSilver: 0,
            chestsGold: 0,
            crystals: 0,
            lotteryTickets: 0,
            badgeId: null,
            badgeDuration: null,
            claimed: true,
            claimedAt: new Date(),
          },
        });

        // Log discarded chests if any
        if (totalRemaining > 0) {
          console.log(`[Rewards] ${player.odamageN} discarded ${totalRemaining} chests (${remainingWooden}W ${remainingBronze}B ${remainingSilver}S ${remainingGold}G)`);
        }

        console.log(`[Rewards] ${player.odamageN} claimed ${totalToTake} chests +${ticketsAwarded}🎟️ +${crystalsAwarded}💎`);

        socket.emit('rewards:claimed', {
          rewardId,
          chestsCreated: totalToTake,
          chestsDiscarded: totalRemaining,
          crystalsAwarded,
          ticketsAwarded,
          badgeAwarded,
          fullyClaimed: true, // Always fully claimed now (remaining discarded)
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

        // DEV MODE: Skip verification for local testing
        const isDevMode = data.initData === 'dev_mode';
        if (isDevMode) {
          console.log(`[Auth] DEV MODE enabled for telegramId: ${data.telegramId}`);
        }

        // Verify Telegram initData if provided and token is set (skip in dev mode)
        if (data.initData && TELEGRAM_BOT_TOKEN && !SKIP_TELEGRAM_AUTH && !isDevMode) {
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

        // ═══════════════════════════════════════════════════════════
        // SINGLE SESSION ENFORCEMENT
        // Kick existing session if same telegramId connects from another device
        // ═══════════════════════════════════════════════════════════
        const telegramIdStr = String(data.telegramId);
        for (const [existingSocketId, existingPlayer] of onlineUsers.entries()) {
          // Skip self (reconnection case)
          if (existingSocketId === socket.id) continue;

          // Check if this player has same telegramId
          if (existingPlayer.telegramId === telegramIdStr) {
            console.log(`[Auth] Kicking duplicate session for telegramId ${telegramIdStr}: ${existingSocketId}`);

            // Notify old session and disconnect it
            const oldSocket = io.sockets.sockets.get(existingSocketId);
            if (oldSocket) {
              oldSocket.emit('session:kicked', {
                reason: 'Выполнен вход с другого устройства / Logged in from another device'
              });
              oldSocket.disconnect(true);
            }

            // Remove from onlineUsers (disconnect handler will also try but let's be safe)
            onlineUsers.delete(existingSocketId);
          }
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
          addLog('info', 'auth', `New user: ${data.firstName || data.username || data.telegramId}`, { telegramId: data.telegramId, lang: userLang });

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
          addLog('info', 'auth', `User login: ${user.firstName || user.username || data.telegramId}`, { telegramId: data.telegramId });
        }

        // Update player state from DB
        player.odamage = user.id;
        player.telegramId = telegramIdStr; // For single-session enforcement
        player.odamageN = user.firstName || user.username || 'Player';
        player.username = user.username || null;
        player.photoUrl = user.photoUrl || null;
        // Legacy stats
        player.str = user.str;
        player.dex = user.dex;
        player.luck = user.luck;

        // FIX v1.5.11: Validate and fix corrupted pAtk values
        // Base pAtk formula: 10 + (str - 10), minimum 10
        const correctBasePAtk = 10 + Math.max(0, user.str - 10);
        if (user.pAtk > correctBasePAtk + 50) {
          // pAtk is corrupted (includes equipment bonus) - fix it
          console.log(`[Auth] FIX: User ${user.id} has corrupted pAtk=${user.pAtk}, should be ${correctBasePAtk}. Fixing...`);
          await prisma.user.update({
            where: { id: user.id },
            data: { pAtk: correctBasePAtk },
          });
          player.basePAtk = correctBasePAtk;
        } else {
          player.basePAtk = user.pAtk;
        }

        player.basePDef = user.physicalDefense || 0;
        player.pAtk = player.basePAtk;  // Will be recalculated with equipment
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
        // FIX: Use ?? instead of || to preserve stamina=0 (falsy bug)
        player.stamina = Math.min(user.stamina ?? player.maxStamina, player.maxStamina);
        player.exhaustedUntil = user.exhaustedUntil ? user.exhaustedUntil.getTime() : null;
        // Mana (from StatsService + DB)
        player.maxMana = derivedStats.maxMana;
        // FIX: Use ?? instead of || to preserve mana=0
        player.mana = Math.min(user.mana ?? player.maxMana, player.maxMana);
        player.manaRegen = user.manaRegen ?? BASE_MANA_REGEN; // FIX: fallback if DB null
        player.tapsPerSecond = user.tapsPerSecond;
        player.autoAttackSpeed = user.autoAttackSpeed;
        player.isFirstLogin = user.isFirstLogin;
        player.gold = Number(user.gold);
        player.autoEther = user.autoEther || false;
        player.autoAttack = user.autoAttack || false;
        // SSOT: ALWAYS load resources from DB on auth (no memory fallback)
        player.ether = user.ether ?? 0;
        player.etherDust = user.etherDust ?? 0;
        player.potionHaste = user.potionHaste ?? 0;
        player.potionAcumen = user.potionAcumen ?? 0;
        player.potionLuck = user.potionLuck ?? 0;
        // Mark resources as loaded (SSOT ready)
        player.resourcesLoaded = true;
        player.dirty = false;

        // Restore sessionDamage from leaderboard (survives reconnect)
        const leaderboardEntry = sessionLeaderboard.get(user.id);
        if (leaderboardEntry) {
          player.sessionDamage = leaderboardEntry.damage || 0;
          player.savedSessionDamage = leaderboardEntry.damage || 0; // Already in leaderboard = already "saved"
          console.log(`[Auth] Restored sessionDamage=${player.sessionDamage} from leaderboard`);
        }

        // Level and Skill levels
        player.level = user.level || 1;
        player.skillFireball = user.skillFireball ?? 1;
        player.skillIceball = user.skillIceball ?? 0;
        player.skillLightning = user.skillLightning ?? 0;

        // ═══ SKILLS v1.4: Mastery, Casts, Tiers ═══
        player.skillFireballMastery = user.skillFireballMastery ?? 0;
        player.skillIceballMastery = user.skillIceballMastery ?? 0;
        player.skillLightningMastery = user.skillLightningMastery ?? 0;
        player.skillFireballCasts = user.skillFireballCasts ?? 0;
        player.skillIceballCasts = user.skillIceballCasts ?? 0;
        player.skillLightningCasts = user.skillLightningCasts ?? 0;
        player.skillFireballTiers = user.skillFireballTiers ?? 0;
        player.skillIceballTiers = user.skillIceballTiers ?? 0;
        player.skillLightningTiers = user.skillLightningTiers ?? 0;
        // Passive skills
        player.passiveArcanePower = user.passiveArcanePower ?? 0;
        player.passiveCritFocus = user.passiveCritFocus ?? 0;
        player.passiveCritPower = user.passiveCritPower ?? 0;
        player.passiveStaminaTraining = user.passiveStaminaTraining ?? 0;
        player.passiveManaFlow = user.passiveManaFlow ?? 0;
        player.passiveEtherEfficiency = user.passiveEtherEfficiency ?? 0;

        // Calculate offline meditation dust
        // Check if user was recently online (heartbeat within last 2 minutes)
        const now = Date.now();
        let lastActiveTime = user.lastOnline ? user.lastOnline.getTime() : now;

        // FIX: First check global userLastHeartbeat map (persists across socket reconnects)
        const globalLastHeartbeat = userLastHeartbeat.get(user.id);
        if (globalLastHeartbeat) {
          const timeSinceGlobal = now - globalLastHeartbeat;
          if (timeSinceGlobal < 120000) { // 2 minutes
            lastActiveTime = Math.max(lastActiveTime, globalLastHeartbeat);
            console.log(`[Auth] Found global heartbeat for ${user.id}, ${Math.floor(timeSinceGlobal/1000)}s ago`);
          }
        }

        // Also check if same user has another active session with fresh heartbeat
        // This handles page refresh / reconnect scenarios
        for (const [sid, p] of onlineUsers.entries()) {
          if (sid !== socket.id && p.odamage === user.id && p.lastHeartbeat) {
            const timeSinceHeartbeat = now - p.lastHeartbeat;
            if (timeSinceHeartbeat < 120000) { // 2 minutes
              // User was active recently, use heartbeat time instead of DB lastOnline
              lastActiveTime = Math.max(lastActiveTime, p.lastHeartbeat);
              console.log(`[Auth] Found active session for ${user.id}, lastHeartbeat ${Math.floor(timeSinceHeartbeat/1000)}s ago`);
            }
          }
        }

        const offlineMinutes = Math.min(
          MEDITATION.maxOfflineMinutes,
          Math.floor((now - lastActiveTime) / 60000)
        );
        const pendingDust = offlineMinutes >= 5 ? offlineMinutes * MEDITATION.dustPerMinute : 0;
        player.pendingDust = pendingDust;
        player.offlineMinutes = offlineMinutes;

        // Calculate offline stamina/mana regen (same rates as online)
        const offlineSeconds = Math.floor((now - lastActiveTime) / 1000);
        if (offlineSeconds > 0) {
          // Stamina regen: +1 per second (StatsService.STAMINA_REGEN_PER_SEC)
          const offlineStaminaRegen = offlineSeconds * StatsService.STAMINA_REGEN_PER_SEC;
          player.stamina = Math.min(player.maxStamina, player.stamina + offlineStaminaRegen);

          // Mana regen: manaRegen per second (default BASE_MANA_REGEN = 5)
          const manaRegenRate = Math.max(player.manaRegen || BASE_MANA_REGEN, BASE_MANA_REGEN);
          const offlineManaRegen = offlineSeconds * manaRegenRate;
          player.mana = Math.min(player.maxMana, player.mana + offlineManaRegen);

          console.log(`[Auth] Offline regen: ${offlineSeconds}s => +${offlineStaminaRegen} stamina, +${offlineManaRegen} mana`);
        }

        // Update lastOnline and save offline-regenerated stamina/mana
        if (offlineMinutes >= 1) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastOnline: new Date(),
              stamina: Math.floor(player.stamina),
              mana: Math.floor(player.mana),
            },
          });
        }

        // Load active buffs from DB
        const activeBuffs = await prisma.activeBuff.findMany({
          where: { userId: user.id, expiresAt: { gt: new Date() } },
        });
        player.activeBuffs = activeBuffs.map(b => ({
          type: b.buffType.toLowerCase(),
          value: b.value,
          expiresAt: b.expiresAt.getTime(),
        }));

        // Recalculate stats from equipped items
        await recalculateEquipmentStats(player, prisma);

        // Calculate expToNext based on level
        const expToNext = Math.floor(1000 * Math.pow(1.5, user.level - 1));

        // FIX: Mark user as active AFTER offline calc (for future reconnects)
        userLastHeartbeat.set(user.id, Date.now());

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
          pAtk: player.pAtk,  // Includes equipment bonuses
          basePAtk: player.basePAtk,
          equipmentPAtk: player.equipmentPAtk || 0,
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
          lotteryTickets: user.lotteryTickets ?? 0,
          // Mana (из памяти, не из БД — избегаем рассинхронизации)
          mana: player.mana,
          maxMana: player.maxMana,
          manaRegen: player.manaRegen,
          tapsPerSecond: user.tapsPerSecond,
          autoAttackSpeed: user.autoAttackSpeed,
          isFirstLogin: user.isFirstLogin,
          totalDamage: Number(user.totalDamage),
          bossesKilled: user.bossesKilled,
          autoEther: player.autoEther,  // SSOT: from memory only
          autoAttack: player.autoAttack, // SSOT: from memory only
          // Use in-memory values (preserved from session, or DB on first auth)
          ether: player.ether,
          etherDust: player.etherDust,
          // Meditation (offline dust)
          pendingDust: player.pendingDust,
          offlineMinutes: player.offlineMinutes,
          potionHaste: player.potionHaste,
          potionAcumen: player.potionAcumen,
          potionLuck: player.potionLuck,
          activeBuffs: player.activeBuffs,
          // Skill levels (legacy)
          skillFireball: player.skillFireball,
          skillIceball: player.skillIceball,
          skillLightning: player.skillLightning,
          // ═══ SKILLS v1.4 ═══
          skillFireballMastery: player.skillFireballMastery,
          skillIceballMastery: player.skillIceballMastery,
          skillLightningMastery: player.skillLightningMastery,
          skillFireballCasts: player.skillFireballCasts,
          skillIceballCasts: player.skillIceballCasts,
          skillLightningCasts: player.skillLightningCasts,
          skillFireballTiers: player.skillFireballTiers,
          skillIceballTiers: player.skillIceballTiers,
          skillLightningTiers: player.skillLightningTiers,
          // Passive skills
          passiveArcanePower: player.passiveArcanePower,
          passiveCritFocus: player.passiveCritFocus,
          passiveCritPower: player.passiveCritPower,
          passiveStaminaTraining: player.passiveStaminaTraining,
          passiveManaFlow: player.passiveManaFlow,
          passiveEtherEfficiency: player.passiveEtherEfficiency,
          // Participation Score (from current boss session)
          ps: sessionLeaderboard.get(player.odamage)?.ps || 0,
          psCap: PS_CAP_PER_BOSS,
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

      // FIX: Apply haste buff to tap speed (+30% taps allowed)
      player.activeBuffs = player.activeBuffs.filter(b => b.expiresAt > now);
      const hasteBuff = player.activeBuffs.find(b => b.type === 'haste');
      const hasteMultiplier = hasteBuff ? (1 + hasteBuff.value) : 1.0;  // 1.3x with haste

      const effectiveTapsPerSecond = player.tapsPerSecond * hasteMultiplier;
      const maxTapsAllowed = Math.floor((timeSinceLastTap / 1000) * effectiveTapsPerSecond) + 1;

      if (timeSinceLastTap < 100) {
        // Too fast, limit taps
        tapCount = Math.min(tapCount, Math.max(1, maxTapsAllowed));
      }

      player.lastTapTime = now;

      // Check game finished
      if (gameFinished) {
        socket.emit('tap:error', { message: 'Game finished! All 100 bosses defeated.' });
        return;
      }

      if (bossState.currentHp <= 0) {
        socket.emit('tap:error', { message: 'Boss is dead' });
        return;
      }

      // FIX: Check if player is authed (stamina is set from DB)
      if (player.stamina === undefined) {
        socket.emit('tap:error', { message: 'Please wait for authentication...' });
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
      player.dirty = true;  // SSOT: mark for flush

      const { totalDamage, crits, etherUsed } = calculateDamage(player, tapCount);
      // Apply dampening multiplier for 24h boss duration
      const dampenedDamage = Math.floor(totalDamage * bossState.bossDamageMultiplier);
      const actualDamage = Math.min(dampenedDamage, bossState.currentHp);
      bossState.currentHp -= actualDamage;
      bossState.totalDamageDealt += actualDamage;

      // Schedule debounced save to prevent data loss on deploy
      if (actualDamage > 0) scheduleBossSave(prisma);

      // Gold убран из тапов - только из сундуков

      player.sessionDamage += actualDamage;
      player.sessionClicks += tapCount;
      player.sessionCrits += crits;

      // Only add to leaderboard if authenticated (has valid odamage)
      if (player.odamage) {
        const existing = sessionLeaderboard.get(player.odamage);
        const now = Date.now();
        sessionLeaderboard.set(player.odamage, {
          damage: (existing?.damage || 0) + actualDamage,
          visitorName: player.odamageN,
          photoUrl: player.photoUrl,
          isEligible: existing?.isEligible || player.isEligible || false,
          // PS fields: update lastActionAt when damage dealt
          ps: existing?.ps || 0,
          lastActionAt: actualDamage > 0 ? now : (existing?.lastActionAt || null),
          lastDamageSnapshot: existing?.lastDamageSnapshot || 0,
          skillsUsed: existing?.skillsUsed || new Set(),
        });
      }

      // Get player's PS from leaderboard
      const playerPsData = sessionLeaderboard.get(player.odamage);

      // Calculate current rank (for eligibility debug)
      const leaderboardArray = [...sessionLeaderboard.values()].sort((a, b) => b.damage - a.damage);
      const currentRank = leaderboardArray.findIndex(e => e.odamage === player.odamage) + 1;

      socket.emit('tap:result', {
        damage: actualDamage,
        crits,
        tapCount,
        // L2 Stamina
        stamina: player.stamina,
        maxStamina: player.maxStamina,
        staminaCost: tapCount, // Always 1 per tap
        // Legacy mana
        mana: player.mana,
        sessionDamage: player.sessionDamage,
        etherUsed,
        autoEther: player.autoEther,
        ether: player.ether,
        // Participation Score
        ps: playerPsData?.ps || 0,
        psCap: PS_CAP_PER_BOSS,
        // Eligibility debug (v1.5.12)
        sessionClicks: player.sessionClicks || 0,
        currentRank: currentRank || 0,
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

      // === TASK TRACKING: taps + bossDamage ===
      if (player.odamage && actualDamage > 0) {
        try {
          await incrementDailyCounter(prisma, player.odamage, 'taps', tapCount);
          await incrementDailyCounter(prisma, player.odamage, 'bossDamage', actualDamage);
        } catch (e) {
          console.error('[Tasks] Failed to track tap/damage:', e.message);
        }
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

      // Skill config (unified: 100 base + pAtk * 3)
      const SKILLS = {
        fireball: { manaCost: 100, baseDamage: 100, multiplier: 3.0, cooldown: 10000 },
        iceball: { manaCost: 100, baseDamage: 100, multiplier: 3.0, cooldown: 10000 },
        lightning: { manaCost: 100, baseDamage: 100, multiplier: 3.0, cooldown: 10000 },
      };

      const skill = SKILLS[skillId];
      if (!skill) {
        socket.emit('skill:error', { message: 'Unknown skill' });
        return;
      }

      // Skill unlock levels: fireball@1, iceball@2, lightning@3
      const SKILL_UNLOCK_LEVELS = { fireball: 1, iceball: 2, lightning: 3 };
      const requiredLevel = SKILL_UNLOCK_LEVELS[skillId] || 1;
      const playerLevel = player.level || 1;

      if (playerLevel < requiredLevel) {
        socket.emit('skill:error', { message: `Requires level ${requiredLevel}` });
        return;
      }

      // Check game finished
      if (gameFinished) {
        socket.emit('skill:error', { message: 'Game finished!' });
        return;
      }

      // Check boss alive
      if (bossState.currentHp <= 0) {
        socket.emit('skill:error', { message: 'Boss is dead' });
        return;
      }

      // FIX: Check if player is authed (mana is set from DB)
      if (player.mana === undefined) {
        socket.emit('skill:error', { message: 'Please wait for authentication...' });
        return;
      }

      // Check mana
      if (player.mana < skill.manaCost) {
        socket.emit('skill:error', { message: 'Not enough mana' });
        return;
      }

      // Deduct mana
      player.mana -= skill.manaCost;
      player.dirty = true;  // SSOT: mark for flush

      // ═══ SKILLS v1.4: Get mastery, tiers, casts ═══
      const masteryMap = {
        fireball: player.skillFireballMastery ?? 0,
        iceball: player.skillIceballMastery ?? 0,
        lightning: player.skillLightningMastery ?? 0,
      };
      const tiersMap = {
        fireball: player.skillFireballTiers ?? 0,
        iceball: player.skillIceballTiers ?? 0,
        lightning: player.skillLightningTiers ?? 0,
      };
      const castsFieldMap = {
        fireball: 'skillFireballCasts',
        iceball: 'skillIceballCasts',
        lightning: 'skillLightningCasts',
      };

      const masteryRank = masteryMap[skillId];
      const tierBitmask = tiersMap[skillId];

      // Increment casts (for proficiency tracking)
      const castsField = castsFieldMap[skillId];
      player[castsField] = (player[castsField] ?? 0) + 1;

      // Level multiplier: +2% per hero level
      const levelMultiplier = Math.pow(1.02, playerLevel - 1);

      // Mastery multiplier: +3% per rank (replaces old skill level)
      const masteryMultiplier = getMasteryMultiplier(masteryRank);

      // Tier bonus multiplier: sum of activated tier bonuses
      const tierMultiplier = getTierBonusMultiplier(tierBitmask);

      // Arcane Power passive: +2% per rank to final damage
      const arcanePowerBonus = 1 + (player.passiveArcanePower ?? 0) * 0.02;

      // Calculate damage: (baseDamage + pAtk * multiplier) * levelMult * masteryMult * tierMult * arcanePower
      const baseDmg = skill.baseDamage + (player.pAtk * skill.multiplier);
      const rawDamage = Math.floor(baseDmg * levelMultiplier * masteryMultiplier * tierMultiplier * arcanePowerBonus);
      // Apply dampening multiplier for 24h boss duration
      const damage = Math.floor(rawDamage * bossState.bossDamageMultiplier);
      const actualDamage = Math.min(damage, bossState.currentHp);
      bossState.currentHp -= actualDamage;
      bossState.totalDamageDealt += actualDamage;

      // Schedule debounced save to prevent data loss on deploy
      if (actualDamage > 0) scheduleBossSave(prisma);

      // Gold убран - только из сундуков
      player.sessionDamage += actualDamage;

      // Update leaderboard (only if authenticated)
      if (player.odamage) {
        const existing = sessionLeaderboard.get(player.odamage);
        const now = Date.now();
        const skillsUsed = existing?.skillsUsed || new Set();
        skillsUsed.add(skillId); // Track skill usage for level-up
        sessionLeaderboard.set(player.odamage, {
          damage: (existing?.damage || 0) + actualDamage,
          visitorName: player.odamageN,
          photoUrl: player.photoUrl,
          isEligible: existing?.isEligible || player.isEligible || false,
          skillsUsed, // Skills used in this boss session
          // PS fields: update lastActionAt on skill use
          ps: existing?.ps || 0,
          lastActionAt: now, // Skill use = activity
          lastDamageSnapshot: existing?.lastDamageSnapshot || 0,
        });
      }

      socket.emit('skill:result', {
        skillId,
        damage: actualDamage,
        mana: player.mana,
        maxMana: player.maxMana,
        sessionDamage: player.sessionDamage,
      });

      io.emit('damage:feed', {
        playerName: player.odamageN,
        damage: actualDamage,
        isCrit: false,
        isSkill: true,
        skillId,
      });

      // === TASK TRACKING: skillUses + bossDamage ===
      if (player.odamage) {
        try {
          await incrementDailyCounter(prisma, player.odamage, 'skillUses', 1);
          if (actualDamage > 0) {
            await incrementDailyCounter(prisma, player.odamage, 'bossDamage', actualDamage);
          }
        } catch (e) {
          console.error('[Tasks] Failed to track skill use:', e.message);
        }
      }

      // Check boss killed
      if (bossState.currentHp <= 0) {
        // Trigger same kill logic as tap:batch
        // (simplified - in production you'd refactor to shared function)
        console.log(`[Boss] ${bossState.name} killed by ${player.odamageN} using ${skillId}!`);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // SKILL UPGRADE - Mastery ranks (Gold + SP)
    // ═══════════════════════════════════════════════════════════
    socket.on('skill:upgrade', async (data) => {
      const { skillId } = data;

      if (!player.odamage) {
        socket.emit('skill:upgrade-error', { message: 'Not authenticated' });
        return;
      }

      const masteryFieldMap = {
        fireball: 'skillFireballMastery',
        iceball: 'skillIceballMastery',
        lightning: 'skillLightningMastery',
      };

      const masteryField = masteryFieldMap[skillId];
      if (!masteryField) {
        socket.emit('skill:upgrade-error', { message: 'Unknown skill' });
        return;
      }

      const currentRank = player[masteryField] ?? 0;
      const playerLevel = player.level ?? 1;
      const caps = getSkillLevelCaps(playerLevel);

      // Check level cap
      if (currentRank >= caps.activeMastery) {
        socket.emit('skill:upgrade-error', { message: `Level ${playerLevel} cap reached (max: ${caps.activeMastery})` });
        return;
      }

      // Check max rank
      if (currentRank >= MASTERY_MAX_RANK) {
        socket.emit('skill:upgrade-error', { message: 'Max rank reached' });
        return;
      }

      // Get cost for next rank
      const goldCost = MASTERY_COSTS.gold[currentRank];
      const spCost = MASTERY_COSTS.sp[currentRank];

      // Check resources
      if (player.gold < goldCost) {
        socket.emit('skill:upgrade-error', { message: `Not enough gold (need: ${goldCost})` });
        return;
      }

      // Need to get SP from DB
      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { sp: true, gold: true },
        });

        if (!user || user.sp < spCost) {
          socket.emit('skill:upgrade-error', { message: `Not enough SP (need: ${spCost})` });
          return;
        }

        if (user.gold < goldCost) {
          socket.emit('skill:upgrade-error', { message: `Not enough gold (need: ${goldCost})` });
          return;
        }

        // Deduct and upgrade
        const updateData = {
          gold: { decrement: goldCost },
          sp: { decrement: spCost },
          [masteryField]: currentRank + 1,
        };

        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: updateData,
        });

        // Update in-memory
        player[masteryField] = currentRank + 1;
        player.gold = Number(updatedUser.gold);

        socket.emit('skill:upgrade-success', {
          skillId,
          newRank: currentRank + 1,
          gold: Number(updatedUser.gold),
          sp: updatedUser.sp,
          [masteryField]: currentRank + 1,
        });

        console.log(`[Skill] ${player.odamageN} upgraded ${skillId} mastery to rank ${currentRank + 1}`);
      } catch (err) {
        console.error('[Skill:upgrade] Error:', err.message);
        socket.emit('skill:upgrade-error', { message: 'Upgrade failed' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // SKILL TIER ACTIVATE - Proficiency tiers (Gold + SP)
    // ═══════════════════════════════════════════════════════════
    socket.on('skill:tier-activate', async (data) => {
      const { skillId, tier } = data;

      if (!player.odamage) {
        socket.emit('skill:tier-error', { message: 'Not authenticated' });
        return;
      }

      const tiersFieldMap = {
        fireball: 'skillFireballTiers',
        iceball: 'skillIceballTiers',
        lightning: 'skillLightningTiers',
      };
      const castsFieldMap = {
        fireball: 'skillFireballCasts',
        iceball: 'skillIceballCasts',
        lightning: 'skillLightningCasts',
      };

      const tiersField = tiersFieldMap[skillId];
      const castsField = castsFieldMap[skillId];
      if (!tiersField) {
        socket.emit('skill:tier-error', { message: 'Unknown skill' });
        return;
      }

      // Validate tier (1-4)
      if (tier < 1 || tier > 4) {
        socket.emit('skill:tier-error', { message: 'Invalid tier' });
        return;
      }

      const currentTiers = player[tiersField] ?? 0;
      const currentCasts = player[castsField] ?? 0;
      const playerLevel = player.level ?? 1;
      const caps = getSkillLevelCaps(playerLevel);

      // Check level cap for tier
      if (tier > caps.tierMax) {
        socket.emit('skill:tier-error', { message: `Level ${playerLevel} cap (max tier: ${caps.tierMax})` });
        return;
      }

      // Check if already activated
      if (isTierActivated(currentTiers, tier)) {
        socket.emit('skill:tier-error', { message: 'Tier already activated' });
        return;
      }

      // Check if unlocked by casts
      const unlockedTier = getUnlockedTierByCasts(currentCasts);
      if (tier > unlockedTier) {
        const required = TIER_THRESHOLDS[tier - 1];
        socket.emit('skill:tier-error', { message: `Need ${required} casts (have: ${currentCasts})` });
        return;
      }

      // Get activation cost
      const goldCost = TIER_ACTIVATION_COSTS.gold[tier - 1];
      const spCost = TIER_ACTIVATION_COSTS.sp[tier - 1];

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { sp: true, gold: true },
        });

        if (!user || user.sp < spCost) {
          socket.emit('skill:tier-error', { message: `Not enough SP (need: ${spCost})` });
          return;
        }

        if (user.gold < goldCost) {
          socket.emit('skill:tier-error', { message: `Not enough gold (need: ${goldCost})` });
          return;
        }

        // Activate tier
        const newTiers = activateTier(currentTiers, tier);

        const updateData = {
          gold: { decrement: goldCost },
          sp: { decrement: spCost },
          [tiersField]: newTiers,
        };

        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: updateData,
        });

        // Update in-memory
        player[tiersField] = newTiers;
        player.gold = Number(updatedUser.gold);

        socket.emit('skill:tier-success', {
          skillId,
          tier,
          newTiers,
          gold: Number(updatedUser.gold),
          sp: updatedUser.sp,
        });

        console.log(`[Skill] ${player.odamageN} activated ${skillId} tier ${tier}`);
      } catch (err) {
        console.error('[Skill:tier] Error:', err.message);
        socket.emit('skill:tier-error', { message: 'Activation failed' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // PASSIVE SKILL UPGRADE (Gold + SP)
    // ═══════════════════════════════════════════════════════════
    socket.on('skill:passive-upgrade', async (data) => {
      const { passiveId } = data;

      if (!player.odamage) {
        socket.emit('skill:passive-error', { message: 'Not authenticated' });
        return;
      }

      const passiveFieldMap = {
        arcanePower: 'passiveArcanePower',
        critFocus: 'passiveCritFocus',
        critPower: 'passiveCritPower',
        staminaTraining: 'passiveStaminaTraining',
        manaFlow: 'passiveManaFlow',
        etherEfficiency: 'passiveEtherEfficiency',
      };

      const passiveField = passiveFieldMap[passiveId];
      if (!passiveField) {
        socket.emit('skill:passive-error', { message: 'Unknown passive' });
        return;
      }

      const passiveConfig = PASSIVE_EFFECTS[passiveId];
      const currentRank = player[passiveField] ?? 0;
      const playerLevel = player.level ?? 1;
      const caps = getSkillLevelCaps(playerLevel);

      // Check max rank
      if (currentRank >= passiveConfig.maxRank) {
        socket.emit('skill:passive-error', { message: 'Max rank reached' });
        return;
      }

      // Check level cap (ether efficiency uses etherMax, others use passiveRank)
      const capToCheck = passiveId === 'etherEfficiency' ? caps.etherMax : caps.passiveRank;
      if (currentRank >= capToCheck) {
        socket.emit('skill:passive-error', { message: `Level ${playerLevel} cap reached (max: ${capToCheck})` });
        return;
      }

      // Get cost (ether efficiency has special costs)
      let goldCost, spCost;
      if (passiveId === 'etherEfficiency') {
        goldCost = ETHER_EFFICIENCY_COSTS.gold[currentRank];
        spCost = ETHER_EFFICIENCY_COSTS.sp[currentRank];
      } else {
        goldCost = PASSIVE_COSTS.gold[currentRank];
        spCost = PASSIVE_COSTS.sp[currentRank];
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { sp: true, gold: true },
        });

        if (!user || user.sp < spCost) {
          socket.emit('skill:passive-error', { message: `Not enough SP (need: ${spCost})` });
          return;
        }

        if (user.gold < goldCost) {
          socket.emit('skill:passive-error', { message: `Not enough gold (need: ${goldCost})` });
          return;
        }

        // Upgrade passive
        const updateData = {
          gold: { decrement: goldCost },
          sp: { decrement: spCost },
          [passiveField]: currentRank + 1,
        };

        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: updateData,
        });

        // Update in-memory
        player[passiveField] = currentRank + 1;
        player.gold = Number(updatedUser.gold);

        socket.emit('skill:passive-success', {
          passiveId,
          newRank: currentRank + 1,
          gold: Number(updatedUser.gold),
          sp: updatedUser.sp,
          [passiveField]: currentRank + 1,
        });

        console.log(`[Skill] ${player.odamageN} upgraded ${passiveId} to rank ${currentRank + 1}`);
      } catch (err) {
        console.error('[Skill:passive] Error:', err.message);
        socket.emit('skill:passive-error', { message: 'Upgrade failed' });
      }
    });

    // LEADERBOARD - Current Boss (with % and photos and PS)
    socket.on('leaderboard:get', () => {
      // sessionLeaderboard keyed by userId, data = { damage, visitorName, photoUrl, isEligible, ps }
      const totalDamage = Array.from(sessionLeaderboard.values()).reduce((sum, d) => sum + (d.damage || 0), 0);
      const leaderboard = Array.from(sessionLeaderboard.entries())
        .map(([userId, data]) => ({
          visitorId: userId,
          visitorName: data.visitorName || 'Unknown',
          photoUrl: data.photoUrl,
          damage: data.damage || 0,
          ps: data.ps || 0, // Participation Score
        }))
        .map(entry => ({
          ...entry,
          damagePercent: totalDamage > 0 ? Math.round((entry.damage / totalDamage) * 100) : 0,
        }))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, 20);

      socket.emit('leaderboard:data', {
        leaderboard,
        bossName: bossState.name,
        bossNameRu: bossState.nameRu,
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

      // ═══ ANTI-EXPLOIT: Mutex lock ═══
      if (chestClaimLocks.has(chestId)) {
        console.log(`[Chest] Anti-exploit: ${player.telegramId} tried double-claim on ${chestId}`);
        socket.emit('chest:error', { message: 'Chest already being claimed' });
        return;
      }
      chestClaimLocks.add(chestId);

      try {
        const chest = await prisma.chest.findUnique({
          where: { id: chestId },
        });

        if (!chest || chest.userId !== player.odamage) {
          chestClaimLocks.delete(chestId);
          socket.emit('chest:error', { message: 'Chest not found' });
          return;
        }

        if (!chest.openingStarted) {
          chestClaimLocks.delete(chestId);
          socket.emit('chest:error', { message: 'Chest not opened yet' });
          return;
        }

        const elapsed = Date.now() - chest.openingStarted.getTime();
        if (elapsed < chest.openingDuration) {
          chestClaimLocks.delete(chestId);
          socket.emit('chest:error', { message: 'Chest still opening' });
          return;
        }

        // Generate loot based on chest TYPE (WOODEN, BRONZE, SILVER, GOLD)
        const chestType = chest.chestType || 'WOODEN';
        const dropRates = CHEST_DROP_RATES[chestType];

        // v1.6: Gold reward (random range для баланса экономики)
        const [goldMin, goldMax] = dropRates.goldRange;
        const goldReward = Math.floor(Math.random() * (goldMax - goldMin + 1)) + goldMin;

        // ═══ v1.3.1: XP/SP from chests using BOSS_XP table ═══
        const xpFactor = CHEST_XP_FACTOR[chestType] || 0.10;
        const chestXpReward = Math.floor(getBossXpPerPlayer(bossState.bossIndex) * xpFactor);
        const chestSpReward = Math.floor(chestXpReward / SP_RATIO);

        // v1.2: Enchant Charges (всегда выпадают из сундуков)
        const chargesRange = CHEST_ENCHANT_CHARGES[chestType] || { min: 1, max: 2 };
        const enchantCharges = Math.floor(Math.random() * (chargesRange.max - chargesRange.min + 1)) + chargesRange.min;

        // v1.2: Protection drop from Gold chests (5% chance)
        let protectionDrop = 0;
        if (chestType === 'GOLD' && Math.random() < PROTECTION_DROP_CHANCE) {
          protectionDrop = 1;
        }

        // ═══ v1.6: Бонусные дропы (crystals, tickets, keys) ═══
        let crystalsDrop = 0;
        if (dropRates.crystalsChance && Math.random() < dropRates.crystalsChance) {
          const [cMin, cMax] = dropRates.crystalsRange;
          crystalsDrop = Math.floor(Math.random() * (cMax - cMin + 1)) + cMin;
        }

        let ticketsDrop = 0;
        if (dropRates.ticketsChance && Math.random() < dropRates.ticketsChance) {
          const [tMin, tMax] = dropRates.ticketsRange;
          ticketsDrop = Math.floor(Math.random() * (tMax - tMin + 1)) + tMin;
        }

        let keyDrop = 0;
        if (dropRates.keyChance && Math.random() < dropRates.keyChance) {
          keyDrop = 1;
          console.log(`[Chest] 🔑 RARE KEY DROP for ${player.telegramId} from ${chestType}!`);
        }

        // Get current pity counter for Epic (only silver+gold chests count)
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { pityCounter: true },
        });
        let currentPity = user?.pityCounter || 0;
        const isSilverOrGold = chestType === 'SILVER' || chestType === 'GOLD';

        // Item drop (GPT format: itemChance + rarityWeights)
        let droppedItem = null;
        let droppedItemRarity = null;

        // Step 1: Check if item drops at all
        if (Math.random() < dropRates.itemChance) {
          // Step 2: Roll rarity by weights
          const weights = { ...dropRates.rarityWeights };

          // Apply pity bonus for silver+gold: after 30 chests without Epic, +1 weight per chest
          const pityBonus = isSilverOrGold && currentPity >= 30 ? (currentPity - 30 + 1) : 0;
          if (pityBonus > 0 && weights.EPIC !== undefined) {
            weights.EPIC = (weights.EPIC || 0) + pityBonus;
            console.log(`[Pity] User ${player.odamage} pity=${currentPity}, Epic weight: ${weights.EPIC}`);
          }

          const totalWeight = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0);
          let roll = Math.random() * totalWeight;

          for (const [rarity, weight] of Object.entries(weights)) {
            if (!weight) continue;
            roll -= weight;
            if (roll <= 0) {
              droppedItemRarity = rarity;
              break;
            }
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

        // If item dropped, find existing droppable equipment
        // ВАЖНО: Никогда не создаём generic предметы! Только существующие в БД с droppable=true
        if (droppedItemRarity) {
          // Find all droppable equipment of this rarity
          const droppableItems = await prisma.equipment.findMany({
            where: {
              rarity: droppedItemRarity,
              droppable: true,
            },
          });

          if (droppableItems.length > 0) {
            // WEIGHTED SELECTION: сначала сет, потом слот
            let equipment = null;

            // Проверяем есть ли веса для этой рарности
            const setWeights = DROP_SET_WEIGHTS[droppedItemRarity];
            if (setWeights) {
              // Шаг 1: Выбираем сет по весам
              const chosenSetId = weightedRandom(setWeights);
              // Шаг 2: Выбираем слот по весам
              const chosenSlot = weightedRandom(DROP_SLOT_WEIGHTS).toUpperCase();
              // Шаг 3: Ищем предмет по коду (setId-slot)
              const targetCode = `${chosenSetId}-${chosenSlot.toLowerCase()}`;
              equipment = droppableItems.find(item => item.code === targetCode);

              // Fallback: если точный предмет не найден, ищем любой из этого сета
              if (!equipment) {
                const setItems = droppableItems.filter(item => item.code.startsWith(chosenSetId + '-'));
                if (setItems.length > 0) {
                  equipment = setItems[Math.floor(Math.random() * setItems.length)];
                }
              }

              // Fallback: если сет не найден, берём любой из этой рарности
              if (!equipment) {
                equipment = droppableItems[Math.floor(Math.random() * droppableItems.length)];
              }

              console.log(`[Drop] Rarity=${droppedItemRarity}, Set=${chosenSetId}, Slot=${chosenSlot}, Code=${targetCode}, Found=${equipment?.code || 'fallback'}`);
            } else {
              // Для рарностей без весов (если есть) — просто рандом
              equipment = droppableItems[Math.floor(Math.random() * droppableItems.length)];
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

            // ВАЖНО: Используем equipment.rarity из БД, а не droppedItemRarity!
            droppedItem = {
              name: equipment.name,
              icon: equipment.icon,
              rarity: equipment.rarity,
              pAtk: rolledPAtk,
              pDef: rolledPDef,
            };

            // Логируем если есть расхождение (для отладки)
            if (equipment.rarity !== droppedItemRarity) {
              console.error(`[CHEST BUG] ⚠️ Rarity mismatch! Rolled=${droppedItemRarity} but equipment.rarity=${equipment.rarity} for ${equipment.code}`);
            }
          } else {
            console.error(`[CHEST] ❌ NO DROPPABLE ${droppedItemRarity} ITEMS! User ${player.odamage} lost item`);
          }
        }

        // Update chest type counter
        const chestTypeCounterField = `totalChests${chestType.charAt(0) + chestType.slice(1).toLowerCase()}`;

        // Delete chest and give rewards (atomic transaction)
        await prisma.chest.delete({ where: { id: chestId } });

        // Build update data with pity counter handling (v1.2: charges instead of scrolls)
        // v1.3.1: XP/SP from BOSS_XP table
        // FIX v1.5.12: sp is Int in schema, not BigInt - use Number()
        // v1.6: Added crystals, tickets, keys bonus drops
        const updateData = {
          gold: { increment: BigInt(goldReward) },
          exp: { increment: BigInt(chestXpReward) },
          sp: { increment: Number(chestSpReward) },  // sp = Int, not BigInt!
          totalGoldEarned: { increment: BigInt(goldReward) },
          enchantCharges: { increment: enchantCharges },
          [chestTypeCounterField]: { increment: 1 },
        };

        // v1.2: Add protection if dropped
        if (protectionDrop > 0) {
          updateData.protectionCharges = { increment: protectionDrop };
        }

        // v1.6: Add bonus drops (crystals, tickets, keys)
        if (crystalsDrop > 0) {
          updateData.ancientCoin = { increment: crystalsDrop };
        }
        if (ticketsDrop > 0) {
          updateData.lotteryTickets = { increment: ticketsDrop };
        }
        // Key drop: same type as chest being opened
        const KEY_FIELD_MAP = { WOODEN: 'keyWooden', BRONZE: 'keyBronze', SILVER: 'keySilver', GOLD: 'keyGold' };
        if (keyDrop > 0) {
          updateData[KEY_FIELD_MAP[chestType]] = { increment: keyDrop };
        }

        // Handle pity counter (increment or reset)
        if (pityCounterDelta !== 0) {
          if (droppedItemRarity === 'EPIC') {
            // Reset to 0 when Epic drops
            updateData.pityCounter = 0;
          } else {
            updateData.pityCounter = { increment: pityCounterDelta };
          }
        }

        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: updateData,
          select: {
            exp: true,
            sp: true,
            level: true,
          },
        });

        // v1.3.1: Check for level-up
        const newExp = Number(updatedUser.exp);
        const currentLevel = updatedUser.level;
        const newLevel = getLevelFromXp(newExp);
        let leveledUp = false;

        if (newLevel > currentLevel) {
          await prisma.user.update({
            where: { id: player.odamage },
            data: { level: newLevel },
          });
          leveledUp = true;
          console.log(`[Chest] ${player.telegramId} leveled up from ${currentLevel} to ${newLevel} via ${chestType} chest!`);
        }

        player.gold += goldReward;

        // === TASK TRACKING: chestsOpened ===
        try {
          await incrementDailyCounter(prisma, player.odamage, 'chestsOpened', 1);
        } catch (e) {
          console.error('[Tasks] Failed to track chest opened:', e.message);
        }

        // Release mutex lock
        chestClaimLocks.delete(chestId);

        socket.emit('chest:claimed', {
          chestId,
          chestType,
          rewards: {
            gold: goldReward,
            xp: chestXpReward,
            sp: chestSpReward,
            enchantCharges,      // v1.2: charges instead of scrolls
            protectionDrop,      // v1.2: protection from gold chests
            crystals: crystalsDrop,      // v1.6: bonus crystals
            tickets: ticketsDrop,        // v1.6: lottery tickets
            keyDrop: keyDrop > 0 ? chestType : null, // v1.6: key type dropped
            equipment: droppedItem, // Changed from 'item' to 'equipment' to match TreasuryTab
          },
          // v1.3.1: Updated profile data
          profile: {
            exp: newExp,
            sp: Number(updatedUser.sp),
            level: leveledUp ? newLevel : currentLevel,
            leveledUp,
          },
        });
      } catch (err) {
        // Release mutex on error
        chestClaimLocks.delete(chestId);
        console.error('[Chest] Claim error:', err.message);
        socket.emit('chest:error', { message: 'Failed to claim chest' });
      }
    });

    // USE KEY - моментальное открытие сундука ключом
    socket.on('chest:use-key', async (data) => {
      if (!player.odamage) {
        socket.emit('chest:error', { message: 'Not authenticated' });
        return;
      }

      const { chestId } = data;

      // ═══ ANTI-EXPLOIT: Mutex lock ═══
      if (chestClaimLocks.has(chestId)) {
        console.log(`[Chest] Anti-exploit: ${player.telegramId} tried double-key on ${chestId}`);
        socket.emit('chest:error', { message: 'Chest already being opened' });
        return;
      }
      chestClaimLocks.add(chestId);

      try {
        const chest = await prisma.chest.findUnique({
          where: { id: chestId },
        });

        if (!chest || chest.userId !== player.odamage) {
          chestClaimLocks.delete(chestId);
          socket.emit('chest:error', { message: 'Chest not found' });
          return;
        }

        // Определяем какой ключ нужен
        const KEY_MAP = {
          'WOODEN': 'keyWooden',
          'BRONZE': 'keyBronze',
          'SILVER': 'keySilver',
          'GOLD': 'keyGold',
        };

        const chestType = chest.chestType || 'WOODEN';
        const keyField = KEY_MAP[chestType];
        if (!keyField) {
          chestClaimLocks.delete(chestId);
          socket.emit('chest:error', { message: 'Invalid chest type' });
          return;
        }

        // Проверяем есть ли ключ
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { [keyField]: true, pityCounter: true },
        });

        const keysAvailable = user?.[keyField] || 0;
        if (keysAvailable < 1) {
          chestClaimLocks.delete(chestId);
          socket.emit('chest:error', { message: 'No key available' });
          return;
        }

        // Генерируем лут
        const dropRates = CHEST_DROP_RATES[chestType];

        // v1.6: Gold reward (random range для баланса экономики)
        const [goldMin, goldMax] = dropRates.goldRange;
        const goldReward = Math.floor(Math.random() * (goldMax - goldMin + 1)) + goldMin;

        // ═══ v1.3.1: XP/SP from chests using BOSS_XP table ═══
        const xpFactor = CHEST_XP_FACTOR[chestType] || 0.10;
        const chestXpReward = Math.floor(getBossXpPerPlayer(bossState.bossIndex) * xpFactor);
        const chestSpReward = Math.floor(chestXpReward / SP_RATIO);

        const chargesRange = CHEST_ENCHANT_CHARGES[chestType] || { min: 1, max: 2 };
        const enchantCharges = Math.floor(Math.random() * (chargesRange.max - chargesRange.min + 1)) + chargesRange.min;

        let protectionDrop = 0;
        if (chestType === 'GOLD' && Math.random() < PROTECTION_DROP_CHANCE) {
          protectionDrop = 1;
        }

        // ═══ v1.6: Бонусные дропы (crystals, tickets, keys) ═══
        let crystalsDrop = 0;
        if (dropRates.crystalsChance && Math.random() < dropRates.crystalsChance) {
          const [cMin, cMax] = dropRates.crystalsRange;
          crystalsDrop = Math.floor(Math.random() * (cMax - cMin + 1)) + cMin;
        }

        let ticketsDrop = 0;
        if (dropRates.ticketsChance && Math.random() < dropRates.ticketsChance) {
          const [tMin, tMax] = dropRates.ticketsRange;
          ticketsDrop = Math.floor(Math.random() * (tMax - tMin + 1)) + tMin;
        }

        let keyDrop = 0;
        if (dropRates.keyChance && Math.random() < dropRates.keyChance) {
          keyDrop = 1;
          console.log(`[Chest:Key] 🔑 RARE KEY DROP for ${player.telegramId} from ${chestType}!`);
        }

        let currentPity = user?.pityCounter || 0;
        const isSilverOrGold = chestType === 'SILVER' || chestType === 'GOLD';

        let droppedItem = null;
        let droppedItemRarity = null;

        if (Math.random() < dropRates.itemChance) {
          const weights = { ...dropRates.rarityWeights };
          const pityBonus = isSilverOrGold && currentPity >= 30 ? (currentPity - 30 + 1) : 0;
          if (pityBonus > 0 && weights.EPIC !== undefined) {
            weights.EPIC = (weights.EPIC || 0) + pityBonus;
          }

          const totalWeight = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0);
          let roll = Math.random() * totalWeight;

          for (const [rarity, weight] of Object.entries(weights)) {
            if (!weight) continue;
            roll -= weight;
            if (roll <= 0) {
              droppedItemRarity = rarity;
              break;
            }
          }
        }

        let pityCounterDelta = 0;
        if (isSilverOrGold) {
          if (droppedItemRarity === 'EPIC') {
            pityCounterDelta = -currentPity;
          } else {
            pityCounterDelta = 1;
          }
        }

        // Дроп предмета
        if (droppedItemRarity) {
          const droppableItems = await prisma.equipment.findMany({
            where: { rarity: droppedItemRarity, droppable: true },
          });

          if (droppableItems.length > 0) {
            let equipment = null;
            const setWeights = DROP_SET_WEIGHTS[droppedItemRarity];
            if (setWeights) {
              const chosenSetId = weightedRandom(setWeights);
              const setItems = droppableItems.filter(e => {
                const code = e.code || '';
                const itemSetId = code.split('-')[0];
                return itemSetId === chosenSetId;
              });
              if (setItems.length > 0) {
                equipment = setItems[Math.floor(Math.random() * setItems.length)];
              }
            }
            if (!equipment) {
              equipment = droppableItems[Math.floor(Math.random() * droppableItems.length)];
            }

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

            // ВАЖНО: Используем equipment.rarity из БД, а не droppedItemRarity!
            // Это гарантирует что показанное = сохранённому
            droppedItem = {
              name: equipment.name,
              icon: equipment.icon,
              rarity: equipment.rarity,
              pAtk: rolledPAtk,
              pDef: rolledPDef,
            };

            // Логируем если есть расхождение (для отладки)
            if (equipment.rarity !== droppedItemRarity) {
              console.error(`[CHEST BUG] ⚠️ Rarity mismatch! Rolled=${droppedItemRarity} but equipment.rarity=${equipment.rarity} for ${equipment.code}`);
            }
          } else {
            console.error(`[CHEST] ❌ NO DROPPABLE ${droppedItemRarity} ITEMS! User ${player.odamage} lost item from ${chestType} chest`);
          }
        }

        // Удаляем сундук и обновляем данные игрока (atomic)
        await prisma.chest.delete({ where: { id: chestId } });

        const totalChestField = `totalChests${chestType.charAt(0) + chestType.slice(1).toLowerCase()}`;
        // v1.3.1: XP/SP from BOSS_XP table
        // FIX v1.5.12: sp is Int in schema, not BigInt - use Number()
        // v1.6: Added crystals, tickets, keys bonus drops
        const updateData = {
          gold: { increment: BigInt(goldReward) },
          exp: { increment: BigInt(chestXpReward) },
          sp: { increment: Number(chestSpReward) },  // sp = Int, not BigInt!
          enchantCharges: { increment: enchantCharges },
          totalGoldEarned: { increment: BigInt(goldReward) },
          [totalChestField]: { increment: 1 },
          [keyField]: { decrement: 1 }, // Отнимаем ключ
        };

        if (protectionDrop > 0) {
          updateData.protectionCharges = { increment: protectionDrop };
        }
        // v1.6: Add bonus drops (crystals, tickets, keys)
        if (crystalsDrop > 0) {
          updateData.ancientCoin = { increment: crystalsDrop };
        }
        if (ticketsDrop > 0) {
          updateData.lotteryTickets = { increment: ticketsDrop };
        }
        // Key drop: same type as chest being opened
        const KEY_FIELD_MAP = { WOODEN: 'keyWooden', BRONZE: 'keyBronze', SILVER: 'keySilver', GOLD: 'keyGold' };
        if (keyDrop > 0) {
          updateData[KEY_FIELD_MAP[chestType]] = { increment: keyDrop };
        }
        if (pityCounterDelta !== 0) {
          if (pityCounterDelta < 0) {
            updateData.pityCounter = 0;
          } else {
            updateData.pityCounter = { increment: pityCounterDelta };
          }
        }

        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: updateData,
          select: {
            exp: true,
            sp: true,
            level: true,
          },
        });

        // v1.3.1: Check for level-up
        const newExp = Number(updatedUser.exp);
        const currentLevel = updatedUser.level;
        const newLevel = getLevelFromXp(newExp);
        let leveledUp = false;

        if (newLevel > currentLevel) {
          await prisma.user.update({
            where: { id: player.odamage },
            data: { level: newLevel },
          });
          leveledUp = true;
          console.log(`[Chest] ${player.telegramId} leveled up from ${currentLevel} to ${newLevel} via key-open ${chestType} chest!`);
        }

        player.gold += goldReward;
        player[keyField] = keysAvailable - 1;

        // === TASK TRACKING: chestsOpened (via key) ===
        try {
          await incrementDailyCounter(prisma, player.odamage, 'chestsOpened', 1);
        } catch (e) {
          console.error('[Tasks] Failed to track chest opened (key):', e.message);
        }

        // Release mutex lock
        chestClaimLocks.delete(chestId);

        console.log(`[Chest] ${player.telegramId} used ${keyField} to instant-open ${chestType} chest (+${chestXpReward} XP, +${chestSpReward} SP)`);

        socket.emit('chest:claimed', {
          chestId,
          chestType,
          rewards: {
            gold: goldReward,
            xp: chestXpReward,
            sp: chestSpReward,
            enchantCharges,
            protectionDrop,
            crystals: crystalsDrop,      // v1.6: bonus crystals
            tickets: ticketsDrop,        // v1.6: lottery tickets
            keyDrop: keyDrop > 0 ? chestType : null, // v1.6: key type dropped
            equipment: droppedItem,
          },
          // v1.3.1: Updated profile data
          profile: {
            exp: newExp,
            sp: Number(updatedUser.sp),
            level: leveledUp ? newLevel : currentLevel,
            leveledUp,
          },
        });

        // Отправляем обновление ключей
        socket.emit('player:keys', {
          keyWooden: player.keyWooden || 0,
          keyBronze: player.keyBronze || 0,
          keySilver: player.keySilver || 0,
          keyGold: player.keyGold || 0,
        });
      } catch (err) {
        // Release mutex on error
        chestClaimLocks.delete(chestId);
        console.error('[Chest] Use key error:', err.message, err.stack);
        socket.emit('chest:error', { message: `Failed to use key: ${err.message}` });
      }
    });

    // BOOST CHEST (ускорить на 30 минут за 999 кристаллов, 1 монета для debug юзеров)
    socket.on('chest:boost', async (data) => {
      if (!player.odamage) {
        socket.emit('chest:error', { message: 'Not authenticated' });
        return;
      }

      const { chestId } = data;
      const BOOST_TIME = 30 * 60 * 1000; // 30 минут в мс
      const BOOST_COST = 999; // 999 кристаллов

      try {
        if ((player.crystals || 0) < BOOST_COST) {
          socket.emit('chest:error', { message: 'Not enough crystals' });
          return;
        }

        const chest = await prisma.chest.findUnique({
          where: { id: chestId },
        });

        if (!chest || chest.userId !== player.odamage) {
          socket.emit('chest:error', { message: 'Chest not found' });
          return;
        }

        if (!chest.openingStarted) {
          socket.emit('chest:error', { message: 'Chest not opening yet' });
          return;
        }

        // Уменьшаем openingDuration на 30 минут
        const newDuration = Math.max(0, chest.openingDuration - BOOST_TIME);

        // Списываем кристаллы
        player.crystals -= BOOST_COST;
        await prisma.$transaction([
          prisma.chest.update({
            where: { id: chestId },
            data: { openingDuration: newDuration },
          }),
          prisma.user.update({
            where: { id: player.odamage },
            data: { crystals: player.crystals },
          }),
        ]);
        console.log(`[Chest] Boosted chest ${chestId} by 30min, cost ${BOOST_COST} crystals`);

        socket.emit('chest:boosted', {
          chestId,
          newDuration,
          crystals: player.crystals,
        });
      } catch (err) {
        console.error('[Chest] Boost error:', err.message);
        socket.emit('chest:error', { message: 'Failed to boost chest' });
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
          nextPrice: getNextSlotPrice(0), // 0 purchased slots = first price
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

        const purchasedSlots = (user?.chestSlots || 5) - 5; // 5 = base slots
        socket.emit('loot:stats', {
          totalGoldEarned: Number(user?.totalGoldEarned || 0),
          chestSlots: user?.chestSlots || 5,
          nextPrice: getNextSlotPrice(purchasedSlots),
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
          nextPrice: getNextSlotPrice(0),
          enchantScrolls: 0,
          totalChests: { WOODEN: 0, BRONZE: 0, SILVER: 0, GOLD: 0 },
        });
      }
    });

    // Unlock a chest slot (progressive pricing from CHEST_SLOT_PRICES)
    socket.on('slot:unlock', async () => {
      if (!player.odamage) {
        socket.emit('slot:error', { message: 'Not authenticated' });
        return;
      }

      const MAX_SLOTS = 15; // 5 base + 10 purchasable

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

        // Get price for next slot (progressive pricing)
        const purchasedSlots = user.chestSlots - 5;
        const slotPrice = getNextSlotPrice(purchasedSlots);

        if (user.ancientCoin < slotPrice) {
          socket.emit('slot:error', { message: `Недостаточно кристаллов (нужно ${slotPrice}💎)` });
          return;
        }

        const updated = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            chestSlots: { increment: 1 },
            ancientCoin: { decrement: slotPrice },
          },
        });

        // Calculate next price for UI
        const newPurchasedSlots = updated.chestSlots - 5;
        const nextPrice = getNextSlotPrice(newPurchasedSlots);

        socket.emit('slot:unlocked', {
          chestSlots: updated.chestSlots,
          crystals: updated.ancientCoin,
          nextPrice,
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

        // Recalculate BASE pAtk (WITHOUT equipment)
        // Formula from CLAUDE.md: P.Atk = 10 + (СИЛ-10)*1
        player.basePAtk = 10 + Math.max(0, player.str - 10);
        player.critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

        // SSOT: Use decrement for gold, sync memory from DB result
        const updated = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            [stat]: player[stat],
            gold: { decrement: BigInt(cost) },
            pAtk: player.basePAtk,
            critChance: player.critChance,
          },
          select: { gold: true },
        });
        player.gold = Number(updated.gold);

        // Recalculate total pAtk including equipment
        await recalculateEquipmentStats(player, prisma);

        socket.emit('upgrade:success', {
          stat,
          value: player[stat],
          gold: player.gold,
          pAtk: player.pAtk,  // Now includes equipment
          basePAtk: player.basePAtk,
          equipmentPAtk: player.equipmentPAtk || 0,
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

        // SSOT: Use decrement for gold
        const updated = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            tapsPerSecond: player.tapsPerSecond,
            gold: { decrement: BigInt(cost) },
          },
          select: { gold: true },
        });
        player.gold = Number(updated.gold);

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

        // SSOT: Use decrement for gold
        const updated = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            autoAttackSpeed: player.autoAttackSpeed,
            gold: { decrement: BigInt(cost) },
          },
          select: { gold: true },
        });
        player.gold = Number(updated.gold);

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

        // SSOT: Use decrement for gold
        const updated = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            manaRegen: player.manaRegen,
            gold: { decrement: BigInt(cost) },
          },
          select: { gold: true },
        });
        player.gold = Number(updated.gold);

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
        if (data.type === 'ether') {
          const quantity = data.quantity || 100;

          const totalCost = ETHER.cost * (quantity / 100);
          if (player.gold < totalCost) {
            socket.emit('shop:error', { message: 'Not enough gold' });
            return;
          }

          // SSOT: Use decrement for gold, increment for ether
          const updatedUser = await prisma.user.update({
            where: { id: player.odamage },
            data: {
              gold: { decrement: BigInt(totalCost) },
              ether: { increment: quantity },
            },
            select: { gold: true, ether: true },
          });
          player.gold = Number(updatedUser.gold);
          player.ether = updatedUser.ether;

          console.log(`[Shop] ${player.telegramId} bought ${quantity} ether for ${totalCost} gold`);

          socket.emit('shop:success', {
            gold: player.gold,
            ether: player.ether,
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

          const potionKey = `potion${buffId.charAt(0).toUpperCase() + buffId.slice(1)}`;

          // SSOT: Use decrement for gold, increment for potion
          const updatedUser = await prisma.user.update({
            where: { id: player.odamage },
            data: {
              gold: { decrement: BigInt(cost) },
              [potionKey]: { increment: 1 },
            },
            select: { gold: true, potionHaste: true, potionAcumen: true, potionLuck: true },
          });
          player.gold = Number(updatedUser.gold);
          player.potionHaste = updatedUser.potionHaste;
          player.potionAcumen = updatedUser.potionAcumen;
          player.potionLuck = updatedUser.potionLuck;

          console.log(`[Shop] ${player.telegramId} bought ${buffId} potion for ${cost} gold`);

          socket.emit('shop:success', {
            gold: player.gold,
            potionHaste: player.potionHaste,
            potionAcumen: player.potionAcumen,
            potionLuck: player.potionLuck,
          });
        } else if (data.type === 'debug-sword') {
          // DEBUG: Бесплатный меч 1500 pAtk для тестирования
          // Найти или создать шаблон в БД
          let equipmentTemplate = await prisma.equipment.findUnique({
            where: { code: DEBUG_EQUIPMENT.code },
          });

          if (!equipmentTemplate) {
            equipmentTemplate = await prisma.equipment.create({
              data: {
                code: DEBUG_EQUIPMENT.code,
                name: DEBUG_EQUIPMENT.name,
                nameRu: DEBUG_EQUIPMENT.name,
                icon: DEBUG_EQUIPMENT.icon,
                slot: DEBUG_EQUIPMENT.slot,
                rarity: DEBUG_EQUIPMENT.rarity,
                pAtkMin: DEBUG_EQUIPMENT.pAtk,
                pAtkMax: DEBUG_EQUIPMENT.pAtk,
                pDefMin: 0,
                pDefMax: 0,
                droppable: false,
              },
            });
          }

          // Создать предмет в инвентаре игрока
          const userEquip = await prisma.userEquipment.create({
            data: {
              userId: player.odamage,
              equipmentId: equipmentTemplate.id,
              pAtk: DEBUG_EQUIPMENT.pAtk,
              pDef: 0,
              enchant: 0,
              isEquipped: false,
            },
          });

          console.log(`[Shop] ${player.telegramId} bought DEBUG SWORD (1500 pAtk)`);

          socket.emit('shop:success', {
            gold: player.gold,
            equipment: {
              id: userEquip.id,
              code: DEBUG_EQUIPMENT.code,
              name: DEBUG_EQUIPMENT.name,
              icon: DEBUG_EQUIPMENT.icon,
              slot: DEBUG_EQUIPMENT.slot,
              pAtk: DEBUG_EQUIPMENT.pAtk,
              pDef: 0,
              rarity: DEBUG_EQUIPMENT.rarity,
            },
          });
        } else if (data.type === 'key') {
          // Buy chest key - 999 crystals for ANY key type
          const KEY_COST_CRYSTALS = 999;

          const keyType = data.keyType;
          const validKeyTypes = ['wooden', 'bronze', 'silver', 'gold'];
          if (!validKeyTypes.includes(keyType)) {
            socket.emit('shop:error', { message: 'Invalid key type' });
            return;
          }

          if ((player.ancientCoin || 0) < KEY_COST_CRYSTALS) {
            socket.emit('shop:error', { message: 'Not enough crystals' });
            return;
          }

          const keyField = `key${keyType.charAt(0).toUpperCase() + keyType.slice(1)}`;
          player.ancientCoin = (player.ancientCoin || 0) - KEY_COST_CRYSTALS;

          // Используем increment для ключей, decrement для кристаллов
          const updatedUser = await prisma.user.update({
            where: { id: player.odamage },
            data: {
              ancientCoin: { decrement: KEY_COST_CRYSTALS },
              [keyField]: { increment: 1 },
            },
            select: { keyWooden: true, keyBronze: true, keySilver: true, keyGold: true, ancientCoin: true },
          });

          console.log(`[Shop] ${player.telegramId} bought ${keyType} key for ${KEY_COST_CRYSTALS} crystals`);

          socket.emit('shop:success', {
            crystals: updatedUser.ancientCoin,
            keyWooden: updatedUser.keyWooden,
            keyBronze: updatedUser.keyBronze,
            keySilver: updatedUser.keySilver,
            keyGold: updatedUser.keyGold,
          });
        } else if (data.type === 'enchant') {
          // Buy enchant charge
          const ENCHANT_COST = 3000;

          if (player.gold < ENCHANT_COST) {
            socket.emit('shop:error', { message: 'Not enough gold' });
            return;
          }

          // SSOT: Use decrement for gold, increment for enchantCharges
          const updatedUser = await prisma.user.update({
            where: { id: player.odamage },
            data: {
              gold: { decrement: BigInt(ENCHANT_COST) },
              enchantCharges: { increment: 1 },
            },
            select: { gold: true, enchantCharges: true },
          });
          player.gold = Number(updatedUser.gold);
          player.enchantCharges = updatedUser.enchantCharges;

          console.log(`[Shop] ${player.telegramId} bought enchant charge for ${ENCHANT_COST} gold`);

          socket.emit('shop:success', {
            gold: player.gold,
            enchantCharges: player.enchantCharges,
          });
        }
      } catch (err) {
        console.error('[Shop] Error:', err.message);
        socket.emit('shop:error', { message: 'Purchase failed' });
      }
    });

    // BUY CHEST SLOT (progressive pricing)
    // Base: 5 slots. Additional: 50, 150, 300, 500, 750, ... crystals
    socket.on('chest:buySlot', async () => {
      if (!player.odamage) {
        socket.emit('chest:buySlot:error', { message: 'Not authenticated' });
        return;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { chestSlots: true, ancientCoin: true },
        });

        const currentSlots = user?.chestSlots || 5;
        const purchasedSlots = currentSlots - 5; // How many extra slots bought

        // Use global CHEST_SLOT_PRICES
        const price = getNextSlotPrice(purchasedSlots);

        if ((user?.ancientCoin || 0) < price) {
          socket.emit('chest:buySlot:error', { message: 'Not enough crystals', price });
          return;
        }

        // Deduct crystals and add slot
        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            ancientCoin: { decrement: price },
            chestSlots: currentSlots + 1,
          },
        });

        player.ancientCoin = (user?.ancientCoin || 0) - price;

        // Calculate next price
        const nextPrice = getNextSlotPrice(purchasedSlots + 1);

        socket.emit('chest:buySlot:success', {
          newSlots: currentSlots + 1,
          crystalsSpent: price,
          crystalsRemaining: player.ancientCoin,
          nextPrice,
        });

        console.log(`[ChestSlot] ${player.odamageN} bought slot #${currentSlots + 1} for ${price}💎`);

      } catch (err) {
        console.error('[ChestSlot] Buy error:', err.message);
        socket.emit('chest:buySlot:error', { message: 'Purchase failed' });
      }
    });

    // ETHER TOGGLE (auto-use on/off)
    socket.on('ether:toggle', async (data) => {
      if (!player.odamage) return;

      const enabled = data.enabled;
      player.autoEther = enabled;

      try {
        await prisma.user.update({
          where: { id: player.odamage },
          data: { autoEther: enabled },
        });
      } catch (err) {
        console.error('[Ether] Toggle error:', err.message);
      }

      socket.emit('ether:toggle:ack', { enabled, ether: player.ether });
    });

    // AUTO-ATTACK TOGGLE (Smart Auto-Hunt)
    socket.on('autoAttack:toggle', async (data) => {
      if (!player.odamage) return;

      const enabled = data.enabled;
      player.autoAttack = enabled;

      try {
        await prisma.user.update({
          where: { id: player.odamage },
          data: { autoAttack: enabled },
        });
      } catch (err) {
        console.error('[AutoAttack] Toggle error:', err.message);
      }

      socket.emit('autoAttack:toggle:ack', { enabled });
    });

    // MEDITATION: Collect pending dust
    socket.on('meditation:collect', async () => {
      if (!player.odamage) return;

      const dustToAdd = player.pendingDust || 0;
      if (dustToAdd <= 0) {
        socket.emit('meditation:collected', { etherDust: player.etherDust, collected: 0 });
        return;
      }

      // Cap at max dust
      const newDust = Math.min(MEDITATION.maxDust, (player.etherDust || 0) + dustToAdd);
      player.etherDust = newDust;
      player.pendingDust = 0;

      try {
        await prisma.user.update({
          where: { id: player.odamage },
          data: { etherDust: newDust },
        });
      } catch (err) {
        console.error('[Meditation] Collect error:', err.message);
      }

      socket.emit('meditation:collected', { etherDust: newDust, collected: dustToAdd });
    });

    // ETHER CRAFT: Convert dust + gold to ether
    socket.on('ether:craft', async (data) => {
      if (!player.odamage) return;

      const amount = Math.max(1, Math.floor(data.amount || 1)); // How many ether to craft
      const dustNeeded = amount * MEDITATION.craftRecipe.dustCost;
      const goldNeeded = amount * MEDITATION.craftRecipe.goldCost;

      if (player.etherDust < dustNeeded) {
        socket.emit('ether:craft:error', { message: 'Not enough dust' });
        return;
      }
      if (player.gold < goldNeeded) {
        socket.emit('ether:craft:error', { message: 'Not enough gold' });
        return;
      }

      const etherGained = amount * MEDITATION.craftRecipe.etherOutput;

      try {
        // FIX: Используем increment/decrement для безопасности
        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            etherDust: { decrement: dustNeeded },
            gold: { decrement: BigInt(goldNeeded) },
            ether: { increment: etherGained },
          },
          select: { ether: true, etherDust: true, gold: true },
        });

        player.etherDust = updatedUser.etherDust;
        player.gold = Number(updatedUser.gold);
        player.ether = updatedUser.ether;

        socket.emit('ether:craft:success', {
          ether: updatedUser.ether,
          etherDust: updatedUser.etherDust,
          gold: Number(updatedUser.gold),
          crafted: amount,
        });
      } catch (err) {
        console.error('[Ether] Craft error:', err.message);
        socket.emit('ether:craft:error', { message: 'Craft failed' });
      }
    });

    // CRAFT ALL: Convert all possible dust to ether
    socket.on('ether:craftAll', async () => {
      if (!player.odamage) return;

      const maxByDust = Math.floor((player.etherDust || 0) / MEDITATION.craftRecipe.dustCost);
      const maxByGold = Math.floor(player.gold / MEDITATION.craftRecipe.goldCost);
      const amount = Math.min(maxByDust, maxByGold);

      if (amount <= 0) {
        socket.emit('ether:craft:error', { message: 'Cannot craft any ether' });
        return;
      }

      const dustNeeded = amount * MEDITATION.craftRecipe.dustCost;
      const goldNeeded = amount * MEDITATION.craftRecipe.goldCost;
      const etherGained = amount * MEDITATION.craftRecipe.etherOutput;

      try {
        // FIX: Используем increment/decrement для безопасности
        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            etherDust: { decrement: dustNeeded },
            gold: { decrement: BigInt(goldNeeded) },
            ether: { increment: etherGained },
          },
          select: { ether: true, etherDust: true, gold: true },
        });

        player.etherDust = updatedUser.etherDust;
        player.gold = Number(updatedUser.gold);
        player.ether = updatedUser.ether;

        socket.emit('ether:craft:success', {
          ether: updatedUser.ether,
          etherDust: updatedUser.etherDust,
          gold: Number(updatedUser.gold),
          crafted: amount,
        });
      } catch (err) {
        console.error('[Ether] CraftAll error:', err.message);
        socket.emit('ether:craft:error', { message: 'Craft failed' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // TASKS v2.0 — Server-side SSOT
    // ═══════════════════════════════════════════════════════════

    // TASKS:GET - Get all task data (daily + weekly progress)
    socket.on('tasks:get', async () => {
      if (!player.odamage) {
        socket.emit('tasks:error', { message: 'Not authenticated' });
        return;
      }

      try {
        const dateKey = getDateKey();
        const weekKey = getWeekKey();

        // Get or create progress records
        const dailyProgress = await getOrCreateDailyProgress(prisma, player.odamage, dateKey);
        const weeklyProgress = await getOrCreateWeeklyProgress(prisma, player.odamage, weekKey);

        // Get user for invite tracking
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { totalInvites: true, chestSlots: true },
        });

        // Count current chests for slot checking
        const currentChestCount = await prisma.chest.count({
          where: { userId: player.odamage },
        });
        const freeSlots = (user?.chestSlots || 5) - currentChestCount;

        // Build response
        const grindRotationIndex = getGrindRotationIndex();
        const todaysGrindTasks = getTodaysGrindTasks();

        // Helper: Check task completion
        const getTaskProgress = (task, daily, weekly, invites) => {
          const { type, target } = task.condition;
          let progress = 0;

          switch (type) {
            case 'login':
              progress = daily.loginDone ? 1 : 0;
              break;
            case 'taps':
              progress = daily.taps;
              break;
            case 'bossDamage':
              progress = daily.bossDamage;
              break;
            case 'skillUses':
              progress = daily.skillUses;
              break;
            case 'chestsOpened':
              progress = daily.chestsOpened;
              break;
            case 'enchantAttempts':
              progress = daily.enchantAttempts;
              break;
            case 'dismantleCount':
              progress = daily.dismantleCount;
              break;
            case 'inviteValid':
              progress = invites;
              break;
            // Weekly conditions
            case 'baseDaysCompleted':
              progress = weekly.baseDaysCompleted;
              break;
            case 'weeklyBossDamage':
              progress = Number(weekly.weeklyBossDamage);
              break;
            case 'weeklyChestsOpened':
              progress = weekly.weeklyChestsOpened;
              break;
            case 'weeklyEnchantAttempts':
              progress = weekly.weeklyEnchantAttempts;
              break;
            case 'weeklyInvitesValid':
              progress = weekly.weeklyInvitesValid;
              break;
          }

          const completed = progress >= target;
          const claimedTasks = (type.startsWith('weekly') || type === 'baseDaysCompleted')
            ? (weekly.claimedTasks || {})
            : (daily.claimedTasks || {});
          const claimed = claimedTasks[task.id] === true;

          return { progress, completed, claimed };
        };

        // Daily tasks with progress
        const dailyTasks = [
          ...DAILY_BASE_TASKS.map(t => ({
            ...t,
            section: 'base',
            ...getTaskProgress(t, dailyProgress, weeklyProgress, user?.totalInvites || 0),
          })),
          ...todaysGrindTasks.map(t => ({
            ...t,
            section: 'grind',
            ...getTaskProgress(t, dailyProgress, weeklyProgress, user?.totalInvites || 0),
          })),
          {
            ...DAILY_INVITE_TASK,
            section: 'invite',
            ...getTaskProgress(DAILY_INVITE_TASK, dailyProgress, weeklyProgress, user?.totalInvites || 0),
          },
        ];

        // Weekly tasks with progress
        const weeklyTasks = WEEKLY_TASKS.map(t => ({
          ...t,
          section: 'weekly',
          ...getTaskProgress(t, dailyProgress, weeklyProgress, user?.totalInvites || 0),
        }));

        socket.emit('tasks:data', {
          daily: dailyTasks,
          weekly: weeklyTasks,
          grindRotationIndex,
          freeSlots,
          dateKey,
          weekKey,
        });
      } catch (err) {
        console.error('[Tasks] Get error:', err.message);
        socket.emit('tasks:error', { message: 'Failed to get tasks' });
      }
    });

    // TASKS CLAIM - обработка наград за задачи (v2.0 - server-side SSOT)
    socket.on('tasks:claim', async (data) => {
      if (!player.odamage) return;

      const { taskId } = data;
      if (!taskId) {
        socket.emit('tasks:error', { message: 'Task ID required' });
        return;
      }

      console.log(`[Tasks] User ${player.username} claiming task ${taskId}`);

      try {
        const dateKey = getDateKey();
        const weekKey = getWeekKey();

        // Find the task definition
        const allTasks = [
          ...DAILY_BASE_TASKS,
          ...GRIND_TASK_POOL,
          DAILY_INVITE_TASK,
          ...WEEKLY_TASKS,
        ];
        const task = allTasks.find(t => t.id === taskId);

        if (!task) {
          socket.emit('tasks:error', { message: 'Task not found' });
          return;
        }

        // Determine if daily or weekly
        const isWeekly = taskId.startsWith('W');

        // Get progress records
        const dailyProgress = await getOrCreateDailyProgress(prisma, player.odamage, dateKey);
        const weeklyProgress = await getOrCreateWeeklyProgress(prisma, player.odamage, weekKey);

        // Get user for invite count
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { totalInvites: true, chestSlots: true },
        });

        // Check if already claimed
        const claimedTasks = isWeekly
          ? (weeklyProgress.claimedTasks || {})
          : (dailyProgress.claimedTasks || {});

        if (claimedTasks[taskId]) {
          socket.emit('tasks:error', { message: 'Already claimed' });
          return;
        }

        // Check grind task rotation (ensure task is active today)
        if (taskId.startsWith('G')) {
          const todaysGrindIds = getTodaysGrindTasks().map(t => t.id);
          if (!todaysGrindIds.includes(taskId)) {
            socket.emit('tasks:error', { message: 'Task not active today' });
            return;
          }
        }

        // Check completion
        const { type, target } = task.condition;
        let progress = 0;

        switch (type) {
          case 'login':
            progress = dailyProgress.loginDone ? 1 : 0;
            break;
          case 'taps':
            progress = dailyProgress.taps;
            break;
          case 'bossDamage':
            progress = dailyProgress.bossDamage;
            break;
          case 'skillUses':
            progress = dailyProgress.skillUses;
            break;
          case 'chestsOpened':
            progress = dailyProgress.chestsOpened;
            break;
          case 'enchantAttempts':
            progress = dailyProgress.enchantAttempts;
            break;
          case 'dismantleCount':
            progress = dailyProgress.dismantleCount;
            break;
          case 'inviteValid':
            progress = user?.totalInvites || 0;
            break;
          case 'baseDaysCompleted':
            progress = weeklyProgress.baseDaysCompleted;
            break;
          case 'weeklyBossDamage':
            progress = Number(weeklyProgress.weeklyBossDamage);
            break;
          case 'weeklyChestsOpened':
            progress = weeklyProgress.weeklyChestsOpened;
            break;
          case 'weeklyEnchantAttempts':
            progress = weeklyProgress.weeklyEnchantAttempts;
            break;
          case 'weeklyInvitesValid':
            progress = weeklyProgress.weeklyInvitesValid;
            break;
        }

        if (progress < target) {
          socket.emit('tasks:error', { message: 'Task not completed' });
          return;
        }

        // Count chest rewards and check slots
        const chestsToCreate = [];
        for (const reward of task.rewards) {
          if (reward.type === 'woodenChest') {
            for (let i = 0; i < reward.amount; i++) {
              chestsToCreate.push({ userId: player.odamage, chestType: 'WOODEN', openingDuration: 5 * 60 * 1000 });
            }
          } else if (reward.type === 'bronzeChest') {
            for (let i = 0; i < reward.amount; i++) {
              chestsToCreate.push({ userId: player.odamage, chestType: 'BRONZE', openingDuration: 30 * 60 * 1000 });
            }
          } else if (reward.type === 'silverChest') {
            for (let i = 0; i < reward.amount; i++) {
              chestsToCreate.push({ userId: player.odamage, chestType: 'SILVER', openingDuration: 4 * 60 * 60 * 1000 });
            }
          } else if (reward.type === 'goldChest') {
            for (let i = 0; i < reward.amount; i++) {
              chestsToCreate.push({ userId: player.odamage, chestType: 'GOLD', openingDuration: 8 * 60 * 60 * 1000 });
            }
          }
        }

        if (chestsToCreate.length > 0) {
          const currentChests = await prisma.chest.count({ where: { userId: player.odamage } });
          const availableSlots = (user?.chestSlots || 5) - currentChests;

          if (availableSlots < chestsToCreate.length) {
            socket.emit('tasks:error', { message: `Need ${chestsToCreate.length} free chest slots` });
            return;
          }
        }

        // Apply rewards
        const userUpdate = {};
        for (const reward of task.rewards) {
          switch (reward.type) {
            case 'gold':
              userUpdate.gold = { increment: BigInt(reward.amount) };
              break;
            case 'crystals':
              userUpdate.ancientCoin = { increment: reward.amount };
              break;
            case 'tickets':
              userUpdate.lotteryTickets = { increment: reward.amount };
              break;
            case 'enchantCharges':
              userUpdate.enchantCharges = { increment: reward.amount };
              break;
            case 'protectionCharges':
              userUpdate.protectionCharges = { increment: reward.amount };
              break;
          }
        }

        // Update user
        if (Object.keys(userUpdate).length > 0) {
          await prisma.user.update({ where: { id: player.odamage }, data: userUpdate });
        }

        // Create chests
        if (chestsToCreate.length > 0) {
          await prisma.chest.createMany({ data: chestsToCreate });
        }

        // Mark task as claimed
        if (isWeekly) {
          const newClaimedTasks = { ...weeklyProgress.claimedTasks, [taskId]: true };
          await prisma.weeklyTaskProgress.update({
            where: { odamage_weekKey: { odamage: player.odamage, weekKey } },
            data: { claimedTasks: newClaimedTasks },
          });
        } else {
          const newClaimedTasks = { ...dailyProgress.claimedTasks, [taskId]: true };
          await prisma.dailyTaskProgress.update({
            where: { odamage_dateKey: { odamage: player.odamage, dateKey } },
            data: { claimedTasks: newClaimedTasks },
          });

          // Check if all base tasks are now claimed → increment baseDaysCompleted
          if (checkBaseDayCompleted(newClaimedTasks)) {
            await prisma.weeklyTaskProgress.update({
              where: { odamage_weekKey: { odamage: player.odamage, weekKey } },
              data: { baseDaysCompleted: { increment: 1 } },
            });
            console.log(`[Tasks] ${player.username} completed all base tasks for ${dateKey}`);
          }
        }

        console.log(`[Tasks] ${player.username} claimed ${taskId}`);
        socket.emit('tasks:claimed', { taskId });

        // Refresh chest data if chests were created
        if (chestsToCreate.length > 0) {
          const chests = await prisma.chest.findMany({
            where: { userId: player.odamage },
            orderBy: { createdAt: 'asc' },
          });
          socket.emit('chest:data', {
            chests: chests.map(c => ({
              id: c.id,
              chestType: c.chestType,
              openingStarted: c.openingStarted?.getTime() || null,
              openingDuration: c.openingDuration,
            })),
          });
        }

        // Send updated user state
        const updatedUser = await prisma.user.findUnique({ where: { id: player.odamage } });
        if (updatedUser) {
          // CRITICAL: Sync player memory with DB to prevent other handlers from overwriting
          player.gold = Number(updatedUser.gold);
          player.ancientCoin = updatedUser.ancientCoin;
          player.lotteryTickets = updatedUser.lotteryTickets;
          player.enchantCharges = updatedUser.enchantCharges;
          player.protectionCharges = updatedUser.protectionCharges;

          socket.emit('player:state', {
            gold: player.gold,
            ancientCoin: player.ancientCoin,
            lotteryTickets: player.lotteryTickets,
            enchantCharges: player.enchantCharges,
            protectionCharges: player.protectionCharges,
          });
        }
      } catch (err) {
        console.error('[Tasks] Claim error:', err.message, err.stack);
        socket.emit('tasks:error', { message: 'Failed to claim rewards' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // ACTIVITY POINTS (AP) — milestone rewards
    // ═══════════════════════════════════════════════════════════

    // AP:STATUS - Get current AP and milestone status
    socket.on('ap:status', async () => {
      if (!player.odamage) {
        socket.emit('ap:error', { message: 'Not authenticated' });
        return;
      }

      try {
        const dateKey = getDateKey();
        const dailyProgress = await getOrCreateDailyProgress(prisma, player.odamage, dateKey);

        socket.emit('ap:data', {
          ap: dailyProgress.ap,
          milestones: {
            30: { required: 30, reward: AP_MILESTONES[30], claimed: dailyProgress.apClaimed30 },
            60: { required: 60, reward: AP_MILESTONES[60], claimed: dailyProgress.apClaimed60 },
            100: { required: 100, reward: AP_MILESTONES[100], claimed: dailyProgress.apClaimed100 },
          },
        });
      } catch (err) {
        console.error('[AP] Status error:', err.message);
        socket.emit('ap:error', { message: 'Failed to get AP status' });
      }
    });

    // AP:CLAIM - Claim a milestone reward
    socket.on('ap:claim', async (data) => {
      if (!player.odamage) {
        socket.emit('ap:error', { message: 'Not authenticated' });
        return;
      }

      const { threshold } = data;
      if (![30, 60, 100].includes(threshold)) {
        socket.emit('ap:error', { message: 'Invalid threshold' });
        return;
      }

      try {
        const dateKey = getDateKey();
        const dailyProgress = await getOrCreateDailyProgress(prisma, player.odamage, dateKey);

        // Check if enough AP
        if (dailyProgress.ap < threshold) {
          socket.emit('ap:error', { message: `Need ${threshold} AP (have ${dailyProgress.ap})` });
          return;
        }

        // Check if already claimed
        const claimedField = `apClaimed${threshold}`;
        if (dailyProgress[claimedField]) {
          socket.emit('ap:error', { message: 'Already claimed' });
          return;
        }

        const reward = AP_MILESTONES[threshold];

        // For chest rewards, check slots
        if (reward.type === 'bronzeChest') {
          const user = await prisma.user.findUnique({
            where: { id: player.odamage },
            select: { chestSlots: true },
          });
          const currentChests = await prisma.chest.count({ where: { userId: player.odamage } });
          const freeSlots = (user?.chestSlots || 5) - currentChests;

          if (freeSlots < reward.amount) {
            socket.emit('ap:error', { message: 'No free chest slots' });
            return;
          }

          // Create chest
          await prisma.chest.create({
            data: {
              userId: player.odamage,
              chestType: 'BRONZE',
              openingDuration: 30 * 60 * 1000, // 30 min
            },
          });
        } else if (reward.type === 'gold') {
          const updatedUser = await prisma.user.update({
            where: { id: player.odamage },
            data: { gold: { increment: BigInt(reward.amount) } },
            select: { gold: true },
          });
          // CRITICAL: Sync player memory with DB
          player.gold = Number(updatedUser.gold);
        } else if (reward.type === 'tickets') {
          const updatedUser = await prisma.user.update({
            where: { id: player.odamage },
            data: { lotteryTickets: { increment: reward.amount } },
            select: { lotteryTickets: true },
          });
          // CRITICAL: Sync player memory with DB
          player.lotteryTickets = updatedUser.lotteryTickets;
        }

        // Mark as claimed
        const updateData = {};
        updateData[claimedField] = true;
        await prisma.dailyTaskProgress.update({
          where: { odamage_dateKey: { odamage: player.odamage, dateKey } },
          data: updateData,
        });

        console.log(`[AP] ${player.odamage} claimed ${threshold} AP milestone`);
        socket.emit('ap:claimed', { threshold });

        // Send updated player state
        socket.emit('player:state', {
          gold: player.gold,
          lotteryTickets: player.lotteryTickets,
        });

        // Refresh AP status
        socket.emit('ap:status');
      } catch (err) {
        console.error('[AP] Claim error:', err.message);
        socket.emit('ap:error', { message: 'Failed to claim AP reward' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // CHECK-IN CALENDAR (14-day streak)
    // ═══════════════════════════════════════════════════════════

    // CHECKIN:STATUS - Get current check-in status
    socket.on('checkin:status', async () => {
      if (!player.odamage) {
        socket.emit('checkin:error', { message: 'Not authenticated' });
        return;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { checkInDay: true, checkInLastDate: true, chestSlots: true },
        });

        const todayKey = getDateKey();
        const yesterdayKey = getYesterdayDateKey();
        const lastDate = user?.checkInLastDate || null;
        const currentDay = user?.checkInDay || 1;

        // Determine canClaimToday
        const canClaimToday = lastDate !== todayKey;

        // Determine streak status
        let streakBroken = false;
        if (lastDate && lastDate !== todayKey && lastDate !== yesterdayKey) {
          // Missed a day - streak will reset on next claim
          streakBroken = true;
        }

        // Count current chests for slot info
        const currentChests = await prisma.chest.count({ where: { userId: player.odamage } });
        const freeSlots = (user?.chestSlots || 5) - currentChests;

        socket.emit('checkin:data', {
          currentDay,
          lastDate,
          canClaimToday,
          streakBroken,
          freeSlots,
          rewards: CHECK_IN_REWARDS,
        });
      } catch (err) {
        console.error('[CheckIn] Status error:', err.message);
        socket.emit('checkin:error', { message: 'Failed to get check-in status' });
      }
    });

    // CHECKIN:CLAIM - Claim today's check-in reward
    socket.on('checkin:claim', async () => {
      if (!player.odamage) {
        socket.emit('checkin:error', { message: 'Not authenticated' });
        return;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { checkInDay: true, checkInLastDate: true, chestSlots: true },
        });

        const todayKey = getDateKey();
        const yesterdayKey = getYesterdayDateKey();
        const lastDate = user?.checkInLastDate || null;

        // Already claimed today
        if (lastDate === todayKey) {
          socket.emit('checkin:error', { message: 'Already claimed today' });
          return;
        }

        // Calculate new day
        let newDay = user?.checkInDay || 1;

        if (lastDate === yesterdayKey) {
          // Consecutive day - increment (wrap at 14)
          newDay = (newDay % 14) + 1;
        } else if (lastDate && lastDate !== todayKey) {
          // Missed a day - reset to 1
          newDay = 1;
          console.log(`[CheckIn] ${player.odamage} streak reset (last: ${lastDate})`);
        }
        // If lastDate is null, this is first claim, stay at day 1

        // Get reward for the day
        const reward = CHECK_IN_REWARDS.find(r => r.day === newDay);
        if (!reward) {
          socket.emit('checkin:error', { message: 'Reward not found' });
          return;
        }

        // Check chest slots if reward is a chest
        const chestTypes = ['woodenChest', 'bronzeChest', 'silverChest', 'goldChest'];
        if (chestTypes.includes(reward.type)) {
          const currentChests = await prisma.chest.count({ where: { userId: player.odamage } });
          const freeSlots = (user?.chestSlots || 5) - currentChests;

          if (freeSlots < reward.amount) {
            socket.emit('checkin:error', { message: `Need ${reward.amount} free chest slot(s)` });
            return;
          }

          // Create chests
          const chestTypeMap = {
            woodenChest: 'WOODEN',
            bronzeChest: 'BRONZE',
            silverChest: 'SILVER',
            goldChest: 'GOLD',
          };
          const durationMap = {
            WOODEN: 5 * 60 * 1000,
            BRONZE: 30 * 60 * 1000,
            SILVER: 4 * 60 * 60 * 1000,
            GOLD: 8 * 60 * 60 * 1000,
          };

          const chestType = chestTypeMap[reward.type];
          for (let i = 0; i < reward.amount; i++) {
            await prisma.chest.create({
              data: {
                userId: player.odamage,
                chestType: chestType,
                openingDuration: durationMap[chestType],
              },
            });
          }
        } else {
          // Non-chest rewards
          const userUpdate = {};
          switch (reward.type) {
            case 'crystals':
              userUpdate.ancientCoin = { increment: reward.amount };
              break;
            case 'tickets':
              userUpdate.lotteryTickets = { increment: reward.amount };
              break;
            case 'enchantCharges':
              userUpdate.enchantCharges = { increment: reward.amount };
              break;
            case 'protectionCharges':
              userUpdate.protectionCharges = { increment: reward.amount };
              break;
          }

          if (Object.keys(userUpdate).length > 0) {
            const updatedUser = await prisma.user.update({
              where: { id: player.odamage },
              data: userUpdate,
              select: { ancientCoin: true, lotteryTickets: true, enchantCharges: true, protectionCharges: true },
            });
            // CRITICAL: Sync player memory with DB
            player.ancientCoin = updatedUser.ancientCoin;
            player.lotteryTickets = updatedUser.lotteryTickets;
            player.enchantCharges = updatedUser.enchantCharges;
            player.protectionCharges = updatedUser.protectionCharges;
          }
        }

        // Update check-in progress
        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            checkInDay: newDay,
            checkInLastDate: todayKey,
          },
        });

        console.log(`[CheckIn] ${player.odamage} claimed Day ${newDay}: ${reward.type} x${reward.amount}`);

        socket.emit('checkin:claimed', {
          day: newDay,
          reward,
        });

        // Send updated player state
        socket.emit('player:state', {
          ancientCoin: player.ancientCoin,
          lotteryTickets: player.lotteryTickets,
          enchantCharges: player.enchantCharges,
          protectionCharges: player.protectionCharges,
        });

        // Refresh status
        socket.emit('checkin:status');
      } catch (err) {
        console.error('[CheckIn] Claim error:', err.message);
        socket.emit('checkin:error', { message: 'Failed to claim check-in reward' });
      }
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
          // Skip broken items from regular inventory (they appear in broken list)
          if (ue.isBroken) continue;

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
            enchant: ue.enchant,             // Enchant level
            enchantLevel: ue.enchant,        // Alias for client compatibility
            isBroken: ue.isBroken || false,
            brokenUntil: ue.brokenUntil ? ue.brokenUntil.toISOString() : null,
            isEquipped: ue.isEquipped,
            setId: ITEM_SET_MAP[ue.equipment.code] || null,
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

    // EQUIP ITEM
    socket.on('equipment:equip', async (data) => {
      if (!player.odamage) return;
      const { itemId } = data;
      if (!itemId) return;

      try {
        // Find the item to equip
        const itemToEquip = await prisma.userEquipment.findFirst({
          where: { id: itemId, userId: player.odamage },
          include: { equipment: true },
        });

        if (!itemToEquip) {
          console.error('[Equipment] Item not found:', itemId);
          return;
        }

        const slot = itemToEquip.equipment.slot;

        // Unequip any item currently in that slot
        await prisma.userEquipment.updateMany({
          where: {
            userId: player.odamage,
            isEquipped: true,
            equipment: { slot },
          },
          data: { isEquipped: false },
        });

        // Equip the new item
        await prisma.userEquipment.update({
          where: { id: itemId },
          data: { isEquipped: true },
        });

        // Recalculate player stats with new equipment
        await recalculateEquipmentStats(player, prisma);

        console.log(`[Equipment] User ${player.odamage} equipped ${itemToEquip.equipment.name} in ${slot}`);
        socket.emit('equipment:equipped', {
          success: true,
          itemId,
          slot,
          pAtk: player.pAtk,
          pDef: player.pDef,
          equipmentPAtk: player.equipmentPAtk,
          equipmentPDef: player.equipmentPDef,
        });
      } catch (err) {
        console.error('[Equipment] Equip error:', err.message);
        socket.emit('equipment:equipped', { success: false, error: err.message });
      }
    });

    // UNEQUIP ITEM
    socket.on('equipment:unequip', async (data) => {
      if (!player.odamage) return;
      const { itemId } = data;
      if (!itemId) return;

      try {
        await prisma.userEquipment.update({
          where: { id: itemId, userId: player.odamage },
          data: { isEquipped: false },
        });

        // Recalculate player stats without this equipment
        await recalculateEquipmentStats(player, prisma);

        console.log(`[Equipment] User ${player.odamage} unequipped item ${itemId}`);
        socket.emit('equipment:unequipped', {
          success: true,
          itemId,
          pAtk: player.pAtk,
          pDef: player.pDef,
          equipmentPAtk: player.equipmentPAtk,
          equipmentPDef: player.equipmentPDef,
        });
      } catch (err) {
        console.error('[Equipment] Unequip error:', err.message);
        socket.emit('equipment:unequipped', { success: false, error: err.message });
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
        const now = Date.now();

        // FIX: Reset buff timer to full duration (L2-style, no stacking)
        const existingBuff = player.activeBuffs.find(b => b.type === buffId && b.expiresAt > now);
        let expiresAt = now + buff.duration;  // Always reset to full duration

        if (existingBuff) {
          // Reset existing buff timer
          existingBuff.expiresAt = expiresAt;
        } else {
          // New buff
          player.activeBuffs.push({
            type: buffId,
            value: buff.value,
            expiresAt,
          });
        }

        // Save potion count to DB
        await prisma.user.update({
          where: { id: player.odamage },
          data: { [potionKey]: player[potionKey] },
        });

        // Update or create buff in DB (use deleteMany + create as fallback for missing unique constraint)
        try {
          await prisma.activeBuff.upsert({
            where: {
              userId_buffType: {
                userId: player.odamage,
                buffType: buffId.toUpperCase(),
              },
            },
            update: {
              expiresAt: new Date(expiresAt),
            },
            create: {
              userId: player.odamage,
              buffType: buffId.toUpperCase(),
              value: buff.value,
              expiresAt: new Date(expiresAt),
            },
          });
        } catch (upsertErr) {
          // Fallback if unique constraint not yet applied
          console.log('[Buff] Upsert failed, using deleteMany+create fallback');
          await prisma.activeBuff.deleteMany({
            where: {
              userId: player.odamage,
              buffType: buffId.toUpperCase(),
            },
          });
          await prisma.activeBuff.create({
            data: {
              userId: player.odamage,
              buffType: buffId.toUpperCase(),
              value: buff.value,
              expiresAt: new Date(expiresAt),
            },
          });
        }

        socket.emit('buff:success', {
          buffId,
          expiresAt,
          duration: buff.duration, // FIX: Send duration for client to know
          [potionKey]: player[potionKey],
        });
      } catch (err) {
        console.error('[Buff] Error:', err.message);
        socket.emit('buff:error', { message: 'Failed to use buff' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // FORGE SYSTEM - Salvage, Craft, Enchant, Fusion
    // ═══════════════════════════════════════════════════════════

    // Salvage output by rarity (x3 per tier)
    // v1.2: Salvage даёт только Enchant Dust
    const SALVAGE_OUTPUT = {
      COMMON:   1,
      UNCOMMON: 3,
      RARE:     9,
      EPIC:    27,
    };

    // v1.2: Enchant Charges из сундуков
    const CHEST_ENCHANT_CHARGES = {
      WOODEN: { min: 1, max: 2 },
      BRONZE: { min: 2, max: 4 },
      SILVER: { min: 4, max: 8 },
      GOLD:   { min: 8, max: 15 },
    };

    // v1.2: Broken item timer (8 часов)
    const BROKEN_TIMER_MS = 8 * 60 * 60 * 1000;

    // v1.2: Protection drop chance из Gold сундуков
    const PROTECTION_DROP_CHANCE = 0.05; // 5%

    // v1.2: Стоимость восстановления за 💎
    const RESTORE_COST_BASE = {
      COMMON: 10,
      UNCOMMON: 25,
      RARE: 60,
      EPIC: 120,
    };

    // v1.2: Стоимость покупки Protection за 💎
    const PROTECTION_BUY_COST = 50;

    // Enchant success chances
    const ENCHANT_CHANCES = {
      4: 0.70, 5: 0.60, 6: 0.50, 7: 0.42, 8: 0.35,
      9: 0.28, 10: 0.22, 11: 0.18, 12: 0.15, 13: 0.12,
      14: 0.10, 15: 0.08, 16: 0.06, 17: 0.05, 18: 0.04,
      19: 0.03, 20: 0.02,
    };

    // Fusion requirements
    const FUSION_REQS = {
      COMMON:   { count: 5, resultChest: 'BRONZE' },
      UNCOMMON: { count: 5, resultChest: 'SILVER' },
      RARE:     { count: 4, resultChest: 'GOLD' },
    };

    // ═══════════════════════════════════════════════════════════
    // MERGE SYSTEM CONSTANTS
    // ═══════════════════════════════════════════════════════════

    // Target rarity -> Result chest mapping
    // Common items -> Bronze (Uncommon) chest
    // Uncommon items -> Silver (Rare) chest
    // Rare items -> Gold (Epic) chest
    // Epic cannot be merged
    const MERGE_TARGET_TO_CHEST = {
      COMMON: 'BRONZE',
      UNCOMMON: 'SILVER',
      RARE: 'GOLD',
    };

    // Chance bonus per item based on tier difference from target
    // 0 = same tier as target: +25%
    // 1 = one tier above target: +50%
    // 2 = two tiers above target: +100%
    const MERGE_CHANCE_BONUS = {
      0: 25,
      1: 50,
      2: 100,
    };

    // Rarity order for tier calculations
    const MERGE_RARITY_ORDER = {
      COMMON: 0,
      UNCOMMON: 1,
      RARE: 2,
      EPIC: 3,
    };

    /**
     * Calculate merge success chance
     * @param items - Array of items with equipment relation
     * @param targetRarity - The TARGET rarity (e.g., 'COMMON' -> creates BRONZE chest)
     * @returns chance 0-100 (capped at 100)
     */
    function calculateMergeChance(items, targetRarity) {
      const targetOrder = MERGE_RARITY_ORDER[targetRarity];
      if (targetOrder === undefined) return 0;

      let totalChance = 0;

      for (const item of items) {
        const itemRarity = item.equipment?.rarity || item.rarity;
        const itemOrder = MERGE_RARITY_ORDER[itemRarity];
        if (itemOrder === undefined) continue;

        // Item must be at least target rarity
        if (itemOrder < targetOrder) continue;

        const tierDiff = itemOrder - targetOrder;
        const bonus = MERGE_CHANCE_BONUS[tierDiff] || 0;
        totalChance += bonus;
      }

      return Math.min(100, totalChance);
    }

    // FORGE:GET - Get forge data (inventory, resources) v1.2
    socket.on('forge:get', async () => {
      if (!player.odamage) return;

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: {
            gold: true,
            matEnchantDust: true,
            enchantCharges: true,
            protectionCharges: true,
            ancientCoin: true,
          },
        });

        // Get equipment inventory (not equipped, not broken - для salvage/fusion)
        const equipment = await prisma.userEquipment.findMany({
          where: { userId: player.odamage, isEquipped: false, isBroken: false },
          include: { equipment: true },
        });

        // Get broken items separately
        const brokenItems = await prisma.userEquipment.findMany({
          where: { userId: player.odamage, isBroken: true },
          include: { equipment: true },
        });

        const inventory = equipment.map(eq => ({
          id: eq.id,
          templateId: eq.equipmentId,
          name: eq.equipment.nameRu || eq.equipment.name,
          icon: eq.equipment.icon,
          slotType: eq.equipment.slot.toLowerCase(),
          rarity: eq.equipment.rarity.toLowerCase(),
          baseStats: {
            pAtkFlat: eq.pAtk,
            pDefFlat: eq.pDef,
          },
          enchantLevel: eq.enchant,
          setId: null,
          isBroken: false,
        }));

        const broken = brokenItems.map(eq => ({
          id: eq.id,
          templateId: eq.equipmentId,
          name: eq.equipment.nameRu || eq.equipment.name,
          icon: eq.equipment.icon,
          slotType: eq.equipment.slot.toLowerCase(),
          rarity: eq.equipment.rarity.toLowerCase(),
          baseStats: {
            pAtkFlat: eq.pAtk,
            pDefFlat: eq.pDef,
          },
          enchantLevel: eq.enchant,
          enchantOnBreak: eq.enchantOnBreak,
          brokenUntil: eq.brokenUntil?.toISOString() || null,
          setId: null,
          isBroken: true,
        }));

        socket.emit('forge:data', {
          inventory,
          brokenItems: broken,
          // v1.2: ресурсы для кузницы (premiumCrystals = ancientCoin 💎 на клиенте)
          resources: {
            enchantDust: user?.matEnchantDust || 0,
            enchantCharges: user?.enchantCharges || 0,
            protectionCharges: user?.protectionCharges || 0,
            premiumCrystals: user?.ancientCoin || 0,  // 💎 для восстановления (ancientCoin в БД)
            gold: Number(user?.gold || 0),
          },
        });
      } catch (err) {
        console.error('[Forge] Get error:', err.message);
        socket.emit('forge:error', { message: 'Failed to get forge data' });
      }
    });

    // FORGE:SALVAGE - Salvage items for Enchant Dust only (v1.2)
    socket.on('forge:salvage', async (data) => {
      if (!player.odamage) return;
      const { itemIds } = data;
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) return;

      try {
        // Get items to salvage (v1.2: exclude broken items)
        const items = await prisma.userEquipment.findMany({
          where: {
            id: { in: itemIds },
            userId: player.odamage,
            isEquipped: false,
            isBroken: false, // v1.2: broken items cannot be salvaged
          },
          include: { equipment: true },
        });

        if (items.length === 0) {
          socket.emit('forge:error', { message: 'No valid items to salvage' });
          return;
        }

        // v1.2: Calculate only Enchant Dust gained
        let dustGained = 0;
        for (const item of items) {
          const rarity = item.equipment.rarity;
          dustGained += SALVAGE_OUTPUT[rarity] || 0;
        }

        // Delete items and update dust
        await prisma.$transaction([
          prisma.userEquipment.deleteMany({
            where: { id: { in: items.map(i => i.id) } },
          }),
          prisma.user.update({
            where: { id: player.odamage },
            data: {
              matEnchantDust: { increment: dustGained },
            },
          }),
        ]);

        console.log(`[Forge] ${player.odamage} salvaged ${items.length} items -> ${dustGained} dust`);

        // === TASK TRACKING: dismantleCount ===
        try {
          await incrementDailyCounter(prisma, player.odamage, 'dismantleCount', items.length);
        } catch (e) {
          console.error('[Tasks] Failed to track dismantle:', e.message);
        }

        // Send updated forge data
        socket.emit('forge:get');
      } catch (err) {
        console.error('[Forge] Salvage error:', err.message);
        socket.emit('forge:error', { message: 'Failed to salvage items' });
      }
    });

    // FORGE:RESTORE - Restore broken item for Premium Crystals (v1.2)
    socket.on('forge:restore', async (data) => {
      if (!player.odamage) return;
      const { itemId } = data;

      if (!itemId) {
        socket.emit('forge:error', { message: 'Item ID required' });
        return;
      }

      try {
        // Get broken item
        const item = await prisma.userEquipment.findFirst({
          where: { id: itemId, userId: player.odamage, isBroken: true },
          include: { equipment: true },
        });

        if (!item) {
          socket.emit('forge:error', { message: 'Broken item not found' });
          return;
        }

        // Check if not expired
        if (item.brokenUntil && new Date(item.brokenUntil) < new Date()) {
          socket.emit('forge:error', { message: 'Item has expired' });
          return;
        }

        // Calculate restore cost
        const rarity = item.equipment.rarity;
        const baseCost = RESTORE_COST_BASE[rarity] || 10;
        const restoreCost = Math.floor(baseCost * (1 + item.enchantOnBreak * 0.25));

        // Check user crystals (ancientCoin = 💎)
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { ancientCoin: true },
        });

        if ((user?.ancientCoin || 0) < restoreCost) {
          socket.emit('forge:error', { message: `Need ${restoreCost} 💎` });
          return;
        }

        // Restore item: enchant = enchantOnBreak - 1, isBroken = false
        const newEnchant = Math.max(0, item.enchantOnBreak - 1);

        // SSOT: Use decrement for ancientCoin
        const [_, updatedUser] = await prisma.$transaction([
          prisma.userEquipment.update({
            where: { id: itemId },
            data: {
              isBroken: false,
              brokenUntil: null,
              enchant: newEnchant,
              enchantOnBreak: 0,
            },
          }),
          prisma.user.update({
            where: { id: player.odamage },
            data: { ancientCoin: { decrement: restoreCost } },
            select: { ancientCoin: true },
          }),
        ]);
        player.ancientCoin = updatedUser.ancientCoin;

        console.log(`[Forge] ${player.odamage} restored ${item.equipment.name} for ${restoreCost} 💎, enchant: ${item.enchantOnBreak} -> ${newEnchant}`);

        socket.emit('forge:restored', {
          itemId,
          itemName: item.equipment.nameRu || item.equipment.name,
          newEnchant,
          cost: restoreCost,
        });

        // Send updated player state
        socket.emit('player:state', {
          ancientCoin: player.ancientCoin,
        });

        // Refresh forge data
        socket.emit('forge:get');
      } catch (err) {
        console.error('[Forge] Restore error:', err.message);
        socket.emit('forge:error', { message: 'Failed to restore item' });
      }
    });

    // FORGE:ABANDON - Delete broken item permanently (v1.2)
    socket.on('forge:abandon', async (data) => {
      if (!player.odamage) return;
      const { itemId } = data;

      if (!itemId) {
        socket.emit('forge:error', { message: 'Item ID required' });
        return;
      }

      try {
        // Get broken item
        const item = await prisma.userEquipment.findFirst({
          where: { id: itemId, userId: player.odamage, isBroken: true },
          include: { equipment: true },
        });

        if (!item) {
          socket.emit('forge:error', { message: 'Broken item not found' });
          return;
        }

        // Delete item permanently
        await prisma.userEquipment.delete({ where: { id: itemId } });

        console.log(`[Forge] ${player.odamage} abandoned ${item.equipment.name}`);

        socket.emit('forge:abandoned', {
          itemId,
          itemName: item.equipment.nameRu || item.equipment.name,
        });

        // Refresh forge data
        socket.emit('forge:get');
      } catch (err) {
        console.error('[Forge] Abandon error:', err.message);
        socket.emit('forge:error', { message: 'Failed to abandon item' });
      }
    });

    // SHOP:BUYPROTECTION - Buy protection charges for crystals (v1.2)
    socket.on('shop:buyProtection', async (data) => {
      if (!player.odamage) return;
      const { quantity = 1 } = data;

      const cost = PROTECTION_BUY_COST * quantity;

      try {
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { ancientCoin: true },
        });

        if ((user?.ancientCoin || 0) < cost) {
          socket.emit('shop:error', { message: `Need ${cost} 💎` });
          return;
        }

        // SSOT: Use decrement for ancientCoin
        const updatedUser = await prisma.user.update({
          where: { id: player.odamage },
          data: {
            ancientCoin: { decrement: cost },
            protectionCharges: { increment: quantity },
          },
          select: { ancientCoin: true, protectionCharges: true },
        });
        player.ancientCoin = updatedUser.ancientCoin;
        player.protectionCharges = updatedUser.protectionCharges;

        console.log(`[Shop] ${player.odamage} bought ${quantity}x protection for ${cost} 💎`);

        socket.emit('shop:purchased', {
          item: 'protection',
          quantity,
          cost,
        });

        // Send updated player state
        socket.emit('player:state', {
          ancientCoin: player.ancientCoin,
          protectionCharges: player.protectionCharges,
        });

        // Refresh forge data
        socket.emit('forge:get');
      } catch (err) {
        console.error('[Shop] BuyProtection error:', err.message);
        socket.emit('shop:error', { message: 'Failed to buy protection' });
      }
    });

    // FORGE:FUSION - Fuse items into chest
    socket.on('forge:fusion', async (data) => {
      if (!player.odamage) return;
      const { rarity } = data;

      const rarityUpper = rarity?.toUpperCase();
      const req = FUSION_REQS[rarityUpper];
      if (!req) {
        socket.emit('forge:error', { message: 'Invalid rarity for fusion' });
        return;
      }

      try {
        // Get items of this rarity (not equipped)
        const items = await prisma.userEquipment.findMany({
          where: {
            userId: player.odamage,
            isEquipped: false,
            equipment: { rarity: rarityUpper },
          },
          take: req.count,
          include: { equipment: true },
        });

        if (items.length < req.count) {
          socket.emit('forge:error', { message: `Need ${req.count} ${rarity} items` });
          return;
        }

        // Check chest slot availability
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { chestSlots: true },
        });
        const chestCount = await prisma.chest.count({
          where: { userId: player.odamage },
        });

        if (chestCount >= (user?.chestSlots || 5)) {
          socket.emit('forge:error', { message: 'No chest slots available' });
          return;
        }

        // Delete items and create chest
        const chestDurations = {
          WOODEN: 5 * 60 * 1000,
          BRONZE: 30 * 60 * 1000,
          SILVER: 4 * 60 * 60 * 1000,
          GOLD: 8 * 60 * 60 * 1000,
        };

        await prisma.$transaction([
          prisma.userEquipment.deleteMany({
            where: { id: { in: items.map(i => i.id) } },
          }),
          prisma.chest.create({
            data: {
              userId: player.odamage,
              chestType: req.resultChest,
              openingDuration: chestDurations[req.resultChest],
            },
          }),
        ]);

        console.log(`[Forge] ${player.odamage} fused ${req.count} ${rarity} items -> ${req.resultChest} chest`);

        // Send updated forge data
        socket.emit('forge:get');
      } catch (err) {
        console.error('[Forge] Fusion error:', err.message);
        socket.emit('forge:error', { message: 'Failed to fuse items' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // MERGE SYSTEM
    // ═══════════════════════════════════════════════════════════

    // MERGE:PREVIEW - Calculate chance without executing (for live UI updates)
    socket.on('merge:preview', async (data) => {
      if (!player.odamage) return;
      const { itemIds, targetRarity } = data;

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        socket.emit('merge:preview', { chance: 0, valid: false, resultChest: null });
        return;
      }

      const targetUpper = targetRarity?.toUpperCase();
      if (!MERGE_TARGET_TO_CHEST[targetUpper]) {
        socket.emit('merge:preview', { chance: 0, valid: false, resultChest: null });
        return;
      }

      try {
        const items = await prisma.userEquipment.findMany({
          where: {
            id: { in: itemIds },
            userId: player.odamage,
            isEquipped: false,
            isBroken: false,
          },
          include: { equipment: true },
        });

        const chance = calculateMergeChance(items, targetUpper);
        const resultChest = MERGE_TARGET_TO_CHEST[targetUpper];

        socket.emit('merge:preview', {
          chance,
          valid: chance > 0,
          resultChest,
          itemCount: items.length,
        });
      } catch (err) {
        socket.emit('merge:preview', { chance: 0, valid: false, resultChest: null });
      }
    });

    // MERGE:ATTEMPT - Execute merge (consume items, roll for chest)
    socket.on('merge:attempt', async (data) => {
      if (!player.odamage) return;
      const { itemIds, targetRarity } = data;

      // Validate input
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 5) {
        socket.emit('merge:error', { message: 'Invalid item count (1-5 required)' });
        return;
      }

      const targetUpper = targetRarity?.toUpperCase();
      if (!MERGE_TARGET_TO_CHEST[targetUpper]) {
        socket.emit('merge:error', { message: 'Invalid target rarity (Common/Uncommon/Rare only)' });
        return;
      }

      try {
        // Get items with validation
        const items = await prisma.userEquipment.findMany({
          where: {
            id: { in: itemIds },
            userId: player.odamage,
            isEquipped: false,
            isBroken: false,
          },
          include: { equipment: true },
        });

        // Check all items found
        if (items.length !== itemIds.length) {
          socket.emit('merge:error', { message: 'Some items not found or unavailable' });
          return;
        }

        // Calculate chance
        const chance = calculateMergeChance(items, targetUpper);
        if (chance === 0) {
          socket.emit('merge:error', { message: 'No valid items for this target rarity' });
          return;
        }

        // Check chest slot availability
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { chestSlots: true },
        });
        const chestCount = await prisma.chest.count({
          where: { userId: player.odamage },
        });
        const hasSlot = chestCount < (user?.chestSlots || 5);

        // Roll for success
        const roll = Math.random() * 100;
        const success = roll < chance;

        const resultChest = MERGE_TARGET_TO_CHEST[targetUpper];
        const chestDurations = {
          WOODEN: 5 * 60 * 1000,
          BRONZE: 30 * 60 * 1000,
          SILVER: 4 * 60 * 60 * 1000,
          GOLD: 8 * 60 * 60 * 1000,
        };

        // Always delete items
        const deleteOp = prisma.userEquipment.deleteMany({
          where: { id: { in: items.map(i => i.id) } },
        });

        if (success && hasSlot) {
          // Success: delete items + create chest
          await prisma.$transaction([
            deleteOp,
            prisma.chest.create({
              data: {
                userId: player.odamage,
                chestType: resultChest,
                openingDuration: chestDurations[resultChest],
              },
            }),
          ]);

          console.log(`[Merge] ${player.odamage} merged ${items.length} items -> ${resultChest} chest (chance: ${chance}%, roll: ${roll.toFixed(1)}%)`);

          socket.emit('merge:result', {
            success: true,
            chestType: resultChest,
            chance,
            roll: Math.floor(roll),
            itemsConsumed: items.length,
          });
        } else {
          // Fail or no slot: just delete items
          await deleteOp;

          const reason = !hasSlot && success ? 'no_slot' : 'roll_failed';
          console.log(`[Merge] ${player.odamage} FAILED merge: ${items.length} items lost (chance: ${chance}%, roll: ${roll.toFixed(1)}%, reason: ${reason})`);

          socket.emit('merge:result', {
            success: false,
            reason,
            chestType: null,
            chance,
            roll: Math.floor(roll),
            itemsConsumed: items.length,
          });
        }

        // Refresh forge data
        socket.emit('forge:get');

      } catch (err) {
        console.error('[Merge] Error:', err.message);
        socket.emit('merge:error', { message: 'Merge failed' });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // ENCHANT:TRY v2.0 - Simplified Normal/Safe modes
    // Normal: 1 enchantCharge, item breaks on fail
    // Safe: 1 enchantCharge + 1 protectionCharge, item survives on fail
    // Safe zone: +0→+3 = 100% success
    // ═══════════════════════════════════════════════════════════
    socket.on('enchant:try', async (data) => {
      if (!player.odamage) return;
      const { itemId, useSafe } = data; // renamed from useProtection to useSafe

      if (!itemId) {
        socket.emit('enchant:error', { message: 'Item ID required' });
        return;
      }

      try {
        // Get item (check not broken)
        const item = await prisma.userEquipment.findFirst({
          where: { id: itemId, userId: player.odamage, isBroken: false },
          include: { equipment: true },
        });

        if (!item) {
          socket.emit('enchant:error', { message: 'Item not found or broken' });
          return;
        }

        // Check max level
        if (item.enchant >= 20) {
          socket.emit('enchant:error', { message: 'Item at max enchant level' });
          return;
        }

        // Get user charges
        const user = await prisma.user.findUnique({
          where: { id: player.odamage },
          select: { enchantCharges: true, protectionCharges: true },
        });

        // Check enchant charges (always required)
        if ((user?.enchantCharges || 0) < 1) {
          socket.emit('enchant:error', { message: 'No enchant charges' });
          return;
        }

        // Check protection charges (if safe mode)
        const currentLevel = item.enchant;
        const targetLevel = currentLevel + 1;
        const isInSafeZone = targetLevel <= 3; // +0→+3 = 100%

        // useSafe only matters outside safe zone
        const effectiveSafe = !isInSafeZone && useSafe;

        if (effectiveSafe && (user?.protectionCharges || 0) < 1) {
          socket.emit('enchant:error', { message: 'No protection charges' });
          return;
        }

        // Calculate success chance
        const chance = isInSafeZone ? 1.0 : (ENCHANT_CHANCES[targetLevel] || 0);
        const roll = Math.random();
        const success = roll < chance;

        console.log(`[Enchant] ${player.odamage} +${currentLevel}→+${targetLevel}, safe=${effectiveSafe}, chance=${(chance*100).toFixed(0)}%, roll=${roll.toFixed(3)}, success=${success}`);

        // Prepare charges deduction
        const userUpdate = { enchantCharges: { decrement: 1 } };
        if (effectiveSafe) {
          userUpdate.protectionCharges = { decrement: 1 };
        }

        let itemBroken = false;
        let newEnchantLevel = currentLevel;

        if (success) {
          // SUCCESS: +1 level
          newEnchantLevel = targetLevel;
          await prisma.$transaction([
            prisma.user.update({ where: { id: player.odamage }, data: userUpdate }),
            prisma.userEquipment.update({
              where: { id: itemId },
              data: { enchant: newEnchantLevel },
            }),
          ]);
        } else if (isInSafeZone) {
          // FAIL in safe zone (shouldn't happen with 100%, but safety)
          await prisma.user.update({ where: { id: player.odamage }, data: userUpdate });
        } else if (effectiveSafe) {
          // FAIL with Safe mode: item survives, level unchanged
          newEnchantLevel = currentLevel;
          await prisma.user.update({ where: { id: player.odamage }, data: userUpdate });
        } else {
          // FAIL Normal mode: item BREAKS
          itemBroken = true;
          const brokenUntil = new Date(Date.now() + BROKEN_TIMER_MS);

          await prisma.$transaction([
            prisma.user.update({ where: { id: player.odamage }, data: userUpdate }),
            prisma.userEquipment.update({
              where: { id: itemId },
              data: {
                isBroken: true,
                brokenUntil: brokenUntil,
                enchantOnBreak: currentLevel,
                isEquipped: false,
              },
            }),
          ]);

          console.log(`[Enchant] BROKEN: ${item.equipment.name} +${currentLevel}, expires: ${brokenUntil.toISOString()}`);
        }

        // === TASK TRACKING: enchantAttempts ===
        try {
          await incrementDailyCounter(prisma, player.odamage, 'enchantAttempts', 1);
        } catch (e) {
          console.error('[Tasks] Failed to track enchant attempt:', e.message);
        }

        socket.emit('enchant:result', {
          success,
          itemBroken,
          newEnchantLevel,
          itemName: item.equipment.nameRu || item.equipment.name,
          itemIcon: item.equipment.icon,
          brokenUntil: itemBroken ? new Date(Date.now() + BROKEN_TIMER_MS).toISOString() : null,
          usedSafe: effectiveSafe, // tell client if safe was used
        });

        // Refresh forge data
        socket.emit('forge:get');
      } catch (err) {
        console.error('[Enchant] Error:', err.message);
        socket.emit('enchant:error', { message: 'Enchant failed' });
      }
    });

    // DISCONNECT
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${socket.id}, userId: ${player.odamage || 'guest'}`);

      if (player.odamage) {
        try {
          // SSOT: НЕ сохраняем gold - он всегда синхронизирован через транзакции
          const updateData = {
            // L2 Stamina (NEW)
            stamina: Math.floor(player.stamina),
            exhaustedUntil: player.exhaustedUntil ? new Date(player.exhaustedUntil) : null,
            // Legacy mana
            mana: Math.floor(player.mana),
            // Ether & consumables (volatile state, not transactional)
            autoEther: player.autoEther,
            ether: player.ether,
            etherDust: player.etherDust,
            potionHaste: player.potionHaste,
            potionAcumen: player.potionAcumen,
            potionLuck: player.potionLuck,
            lastOnline: new Date(),
          };

          // Сохраняем только дельту (то, что ещё не сохранено auto-save)
          const damageDelta = player.sessionDamage - (player.savedSessionDamage || 0);
          const clicksDelta = player.sessionClicks - (player.savedSessionClicks || 0);
          if (damageDelta > 0) {
            updateData.totalDamage = { increment: BigInt(damageDelta) };
            updateData.totalClicks = { increment: BigInt(clicksDelta) };
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

  // v1.2: Cleanup expired broken items every minute
  setInterval(async () => {
    try {
      const result = await prisma.userEquipment.deleteMany({
        where: {
          isBroken: true,
          brokenUntil: { lt: new Date() },
        },
      });
      if (result.count > 0) {
        console.log(`[Cleanup] Deleted ${result.count} expired broken items`);
      }
    } catch (err) {
      console.error('[Cleanup] Broken items error:', err.message);
    }
  }, 60000); // 1 minute

  // ═══════════════════════════════════════════════════════════
  // PS TICK TIMER - начисление Participation Score каждые 5 минут
  // ═══════════════════════════════════════════════════════════
  setInterval(() => {
    const now = Date.now();
    let tickCount = 0;
    let cappedCount = 0;

    // Skip if boss is dead/respawning
    if (bossState.currentHp <= 0 || bossRespawnAt) {
      return;
    }

    for (const [userId, data] of sessionLeaderboard.entries()) {
      // Условия для начисления PS:
      // 1) isEligible = true (30+ сек активности)
      // 2) lastActionAt != null и в пределах ACTIVE_WINDOW_MS
      const isActive = data.lastActionAt && (now - data.lastActionAt) <= ACTIVE_WINDOW_MS;

      if (data.isEligible && isActive) {
        // Check cap
        if ((data.ps || 0) < PS_CAP_PER_BOSS) {
          data.ps = (data.ps || 0) + 1;
          tickCount++;
        } else {
          cappedCount++;
        }
      }
    }

    if (tickCount > 0 || cappedCount > 0) {
      console.log(`[PS Tick] +1 PS to ${tickCount} active players (${cappedCount} capped at ${PS_CAP_PER_BOSS})`);
    }
  }, PS_TICK_MS); // 5 minutes

  // Broadcast boss state every 250ms (optimized - still smooth)
  setInterval(() => {
    // FIX: Ensure no null values are sent to client
    io.emit('boss:state', {
      id: bossState.id || 'default-0',
      name: bossState.name || 'Boss',
      nameRu: bossState.nameRu || bossState.name || 'Boss',
      title: bossState.title || 'World Boss',
      hp: bossState.currentHp ?? 0,
      maxHp: bossState.maxHp ?? 500000,
      defense: bossState.defense ?? 0,
      ragePhase: bossState.ragePhase ?? 0,
      icon: bossState.icon || '👹',
      image: bossState.image || '/assets/bosses/boss_single.png',
      bossIndex: bossState.bossIndex ?? 1,
      totalBosses: bossState.totalBosses ?? 4,
      playersOnline: onlineUsers.size,
      prizePool: {
        ton: bossState.tonReward ?? 10,
        chests: bossState.chestsReward ?? 10,
        exp: bossState.expReward ?? 0,
        gold: bossState.goldReward ?? 0,
      },
      // Respawn timer info
      isRespawning: bossRespawnAt !== null,
      respawnAt: bossRespawnAt ? bossRespawnAt.getTime() : null,
      // Game finished flag
      gameFinished,
    });
  }, 250);

  // Check respawn timer every second
  setInterval(async () => {
    if (bossRespawnAt && new Date() >= bossRespawnAt) {
      console.log('[Boss] Respawn timer expired, spawning next boss...');
      bossRespawnAt = null;
      const spawned = await respawnBoss(prisma);
      await saveBossState(prisma);

      if (!spawned) {
        // Game finished - boss 100 was the last
        io.emit('game:finished', {
          message: '🎉 Congratulations! All 100 bosses defeated!',
          totalBosses: 4,
        });
        console.log('[Boss] 🎉 Game finished event sent to all clients');
        return;
      }

      // После respawnBoss currentBossIndex уже обновлён
      // FIX: Use bossState directly (image is set in respawnBoss)
      io.emit('boss:respawn', {
        id: bossState.id,
        name: bossState.name,
        nameRu: bossState.nameRu,
        title: bossState.title,
        hp: bossState.currentHp,
        maxHp: bossState.maxHp,
        icon: bossState.icon,
        image: bossState.image, // FIX: From bossState directly
        defense: bossState.defense, // FIX: From bossState
        bossIndex: bossState.bossIndex,
        totalBosses: bossState.totalBosses,
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
  // Regen stamina/mana every second and notify clients
  setInterval(() => {
    const now = Date.now();
    for (const [socketId, player] of onlineUsers.entries()) {
      let changed = false;

      // Clear exhaustion if expired
      if (player.exhaustedUntil && now >= player.exhaustedUntil) {
        player.exhaustedUntil = null;
        changed = true;
      }

      // Regen stamina only if not exhausted AND player is authed (stamina !== undefined)
      if (!StatsService.isExhausted(player.exhaustedUntil) && player.stamina !== undefined) {
        if (player.stamina < player.maxStamina) {
          player.stamina = Math.min(player.maxStamina, player.stamina + StatsService.STAMINA_REGEN_PER_SEC);
          changed = true;
        }
      }

      // Also regen mana (for future skills) - only if authed (mana !== undefined)
      if (player.mana !== undefined && player.mana < player.maxMana) {
        // Минимум BASE_MANA_REGEN (5), даже если в БД меньше
        const regenAmount = Math.max(player.manaRegen || 0, BASE_MANA_REGEN);
        player.mana = Math.min(player.maxMana, player.mana + regenAmount);
        changed = true;
      }

      // Emit updated state to client
      if (changed) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('player:state', {
            stamina: player.stamina,
            maxStamina: player.maxStamina,
            mana: player.mana,
            maxMana: player.maxMana,
            exhaustedUntil: player.exhaustedUntil,
          });
        }
      }
    }
  }, 1000);

  // ═══════════════════════════════════════════════════════════
  // DPS SAMPLING - Sample DPS every 60 seconds for dampening
  // ═══════════════════════════════════════════════════════════
  setInterval(() => {
    if (bossState.currentHp <= 0 || gameFinished) return;

    const now = Date.now();
    const deltaTime = (now - bossState.lastDpsSampleAt) / 1000;
    if (deltaTime < 1) return;

    const deltaDamage = bossState.totalDamageDealt - bossState.lastTotalDamageSample;
    const dps = deltaDamage / Math.max(deltaTime, 1);

    // Exponential moving average
    bossState.dpsEma = bossState.dpsEma * (1 - DPS_EMA_ALPHA) + dps * DPS_EMA_ALPHA;

    // Update samples
    bossState.lastTotalDamageSample = bossState.totalDamageDealt;
    bossState.lastDpsSampleAt = now;
  }, DPS_SAMPLE_INTERVAL_MS);

  // ═══════════════════════════════════════════════════════════
  // DAMPENING UPDATE - Adjust bossDamageMultiplier every 5 minutes
  // ═══════════════════════════════════════════════════════════
  setInterval(() => {
    if (bossState.currentHp <= 0 || gameFinished) return;

    const now = Date.now();
    const timeRemaining = Math.max(1, (bossState.bossTargetEndAt - now) / 1000); // seconds
    const hpRemaining = bossState.currentHp;

    // If already past target end time, no dampening needed
    if (now >= bossState.bossTargetEndAt) {
      bossState.bossDamageMultiplier = DAMPENING_MAX_MULT;
      return;
    }

    // Calculate allowed DPS to reach target end time
    const allowedDps = hpRemaining / timeRemaining;
    const currentDps = Math.max(bossState.dpsEma, 1);

    // rawMult < 1 means we're going too fast, need to slow down
    const rawMult = allowedDps / currentDps;
    const oldMult = bossState.bossDamageMultiplier;
    bossState.bossDamageMultiplier = Math.max(DAMPENING_MIN_MULT, Math.min(DAMPENING_MAX_MULT, rawMult));

    // Log dampening changes
    if (Math.abs(oldMult - bossState.bossDamageMultiplier) > 0.01) {
      const hoursRemaining = (timeRemaining / 3600).toFixed(1);
      console.log(`[Dampening] Boss #${bossState.bossIndex}: mult ${oldMult.toFixed(2)} → ${bossState.bossDamageMultiplier.toFixed(2)} | DPS: ${currentDps.toFixed(0)} | HP: ${hpRemaining} | Hours left: ${hoursRemaining}h`);
    }
  }, DAMPENING_UPDATE_INTERVAL_MS);

  // Auto-attack every second (for players with AUTO enabled)
  const AUTO_ATTACKS_PER_SECOND = 1; // 1 hit per second at base attack speed
  const AUTO_STAMINA_COST = 1; // Stamina cost per auto-hit

  setInterval(async () => {
    if (bossState.currentHp <= 0 || gameFinished) return; // Boss is dead or game finished

    for (const [socketId, player] of onlineUsers.entries()) {
      // NEW: Check autoAttack toggle instead of autoAttackSpeed
      // Also check that player is authed (stamina !== undefined)
      if (player.autoAttack && player.odamage && bossState.currentHp > 0 && player.stamina !== undefined) {
        // Check stamina - need stamina to auto-attack
        const staminaNeeded = AUTO_STAMINA_COST * AUTO_ATTACKS_PER_SECOND;
        if (player.stamina < AUTO_STAMINA_COST) {
          // Not enough stamina - skip this tick
          continue;
        }

        // Calculate auto damage
        const baseDamage = player.pAtk * (1 + player.str * STAT_EFFECTS.str);
        let totalAutoDamage = 0;
        let crits = 0;
        let etherUsed = 0;

        // FIX: Level multiplier (was missing in auto-attack!)
        const levelMultiplier = Math.pow(1.02, (player.level || 1) - 1);

        // FIX: Apply buffs to auto-attack (was missing!)
        const now = Date.now();
        player.activeBuffs = player.activeBuffs.filter(b => b.expiresAt > now);

        let damageBonus = 1.0;
        let critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

        let hasteBonus = 0;
        for (const buff of player.activeBuffs) {
          if (buff.type === 'acumen') damageBonus += buff.value;  // +50% damage
          if (buff.type === 'luck') critChance = Math.min(0.75, critChance + buff.value);  // +10% crit
          if (buff.type === 'haste') hasteBonus = buff.value;  // +30% attack speed
        }

        // Number of auto attacks per second (limited by stamina)
        // FIX: Haste gives chance for bonus attack
        let baseHits = AUTO_ATTACKS_PER_SECOND;
        if (hasteBonus > 0 && Math.random() < hasteBonus) {
          baseHits += 1;  // Haste proc: extra attack
        }
        const maxHits = Math.min(baseHits, Math.floor(player.stamina / AUTO_STAMINA_COST));

        for (let i = 0; i < maxHits; i++) {
          // FIX: Same formula as manual tap (was 0.8-1.0, now 0.9-1.1)
          let dmg = baseDamage * (0.9 + Math.random() * 0.2);
          dmg *= levelMultiplier;  // FIX: Level multiplier (was missing!)
          dmg *= damageBonus;  // Apply acumen buff
          const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
          dmg *= rageMultiplier;

          // Ether bonus (x2 damage if autoEther enabled and has ether)
          if (player.autoEther && player.ether > 0) {
            dmg *= 2;
            player.ether -= 1;
            player.dirty = true;  // SSOT: mark for flush
            etherUsed++;
          }

          // Check for crit
          if (Math.random() < critChance) {
            dmg *= BASE_CRIT_DAMAGE;
            crits++;
          }

          // Defense
          const autoDefense = (DEFAULT_BOSSES[currentBossIndex] || DEFAULT_BOSSES[0]).defense;
          dmg = Math.max(1, dmg - autoDefense);
          totalAutoDamage += Math.floor(dmg);

          // Consume stamina per hit
          player.stamina = Math.max(0, player.stamina - AUTO_STAMINA_COST);
        }

        if (totalAutoDamage > 0 && bossState.currentHp > 0 && !gameFinished) {
          // Apply dampening multiplier for 24h boss duration
          const dampenedDamage = Math.floor(totalAutoDamage * bossState.bossDamageMultiplier);
          const actualDamage = Math.min(dampenedDamage, bossState.currentHp);
          bossState.currentHp -= actualDamage;
          bossState.totalDamageDealt += actualDamage;

          // Schedule debounced save to prevent data loss on deploy
          scheduleBossSave(prisma);

          // Update leaderboard (only if authenticated)
          if (player.odamage) {
            const existing = sessionLeaderboard.get(player.odamage);
            const now = Date.now();
            sessionLeaderboard.set(player.odamage, {
              damage: (existing?.damage || 0) + actualDamage,
              visitorName: player.odamageN,
              photoUrl: player.photoUrl,
              isEligible: existing?.isEligible || player.isEligible || false,
              // PS fields: auto-attack counts as activity
              ps: existing?.ps || 0,
              lastActionAt: actualDamage > 0 ? now : (existing?.lastActionAt || null),
              lastDamageSnapshot: existing?.lastDamageSnapshot || 0,
              skillsUsed: existing?.skillsUsed || new Set(),
            });
          }

          player.sessionDamage += actualDamage;

          // Send auto-attack result to player
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('autoAttack:result', {
              damage: actualDamage,
              crits,
              sessionDamage: player.sessionDamage,
              showHitEffect: true,
              ether: player.ether,
              stamina: player.stamina,
              etherUsed,
            });
          }

          // Broadcast to damage feed
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
            return;
          }
        }
      }
    }
  }, 1000);

  // Auto-save player data every 30 seconds
  setInterval(async () => {
    for (const [socketId, player] of onlineUsers.entries()) {
      // Сохраняем только дельту с прошлого сохранения
      const damageDelta = player.sessionDamage - (player.savedSessionDamage || 0);
      const clicksDelta = player.sessionClicks - (player.savedSessionClicks || 0);

      if (player.odamage && damageDelta > 0) {
        try {
          // SSOT: НЕ сохраняем gold - он всегда синхронизирован через транзакции
          await prisma.user.update({
            where: { id: player.odamage },
            data: {
              // L2 Stamina (volatile state)
              stamina: Math.floor(player.stamina),
              exhaustedUntil: player.exhaustedUntil ? new Date(player.exhaustedUntil) : null,
              mana: Math.floor(player.mana),
              // Stats (delta increment)
              totalDamage: { increment: BigInt(damageDelta) },
              totalClicks: { increment: BigInt(clicksDelta) },
            },
          });
          // Запоминаем сколько уже сохранили (НЕ сбрасываем sessionDamage!)
          player.savedSessionDamage = player.sessionDamage;
          player.savedSessionClicks = player.sessionClicks;
          console.log(`[AutoSave] Saved user ${player.odamage}: delta=${damageDelta}`);
        } catch (e) {
          console.error(`[AutoSave] Error for ${player.odamage}:`, e.message);
        }
      }
    }
  }, 30000);

  // Cleanup stale onlineUsers (every 5 minutes)
  // Удаляем пользователей без активности > 30 минут
  setInterval(() => {
    const now = Date.now();
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 минут
    let cleaned = 0;

    for (const [socketId, player] of onlineUsers.entries()) {
      // Проверяем, есть ли socket в io.sockets.sockets
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        // Socket отключен, но не удалён из Map
        onlineUsers.delete(socketId);
        cleaned++;
        continue;
      }

      // Проверяем время последней активности
      if (player.lastActivityPing && (now - player.lastActivityPing) > STALE_THRESHOLD) {
        onlineUsers.delete(socketId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Cleanup] Removed ${cleaned} stale users. Online: ${onlineUsers.size}`);
    }
  }, 5 * 60 * 1000);

  // ─────────────────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────────────────

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO ready`);
    console.log(`> Boss: ${bossState.name} (${bossState.currentHp} HP)`);
  });

  // ─────────────────────────────────────────────────────────
  // GRACEFUL SHUTDOWN
  // ─────────────────────────────────────────────────────────

  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}, saving state...`);

    try {
      // Сохраняем состояние босса
      await saveBossState(prisma);
      console.log('[Shutdown] Boss state saved');

      // Сохраняем данные онлайн игроков (только delta с прошлого auto-save)
      for (const [socketId, player] of onlineUsers.entries()) {
        const damageDelta = player.sessionDamage - (player.savedSessionDamage || 0);
        const clicksDelta = player.sessionClicks - (player.savedSessionClicks || 0);

        if (player.odamage && damageDelta > 0) {
          try {
            // SSOT: НЕ сохраняем gold - он всегда синхронизирован через транзакции
            await prisma.user.update({
              where: { id: player.odamage },
              data: {
                stamina: Math.floor(player.stamina),
                mana: Math.floor(player.mana),
                totalDamage: { increment: BigInt(damageDelta) },
                totalClicks: { increment: BigInt(clicksDelta) },
              },
            });
            console.log(`[Shutdown] Saved user ${player.odamage}: delta=${damageDelta}`);
          } catch (e) {
            console.error(`[Shutdown] Error saving ${player.odamage}:`, e.message);
          }
        }
      }

      // Закрываем соединения
      await prisma.$disconnect();
      console.log('[Shutdown] Database disconnected');

      io.close();
      server.close(() => {
        console.log('[Shutdown] Server closed');
        process.exit(0);
      });

      // Timeout если сервер не закрылся
      setTimeout(() => {
        console.log('[Shutdown] Forced exit');
        process.exit(1);
      }, 10000);
    } catch (err) {
      console.error('[Shutdown] Error:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
