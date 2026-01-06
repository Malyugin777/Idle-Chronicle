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
  name: 'Lizard',
  title: 'World Boss',
  maxHp: 500000,
  currentHp: 500000,
  defense: 0,
  thornsDamage: 0,  // L2: обратка босса (тратит stamina игрока)
  ragePhase: 0,
  sessionId: null,
  icon: '🦎',
  bossIndex: 1,
  totalBosses: 10,
  adenaReward: 1000,
  expReward: 500,
};

const onlineUsers = new Map();
const sessionLeaderboard = new Map();

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
    adena: progress.adenaEarned,
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
// thornsDamage: обратка босса - тратит stamina игрока при каждом тапе
const DEFAULT_BOSSES = [
  { name: 'Lizard', hp: 500000, defense: 0, thornsDamage: 0, icon: '🦎', adenaReward: 1000, expReward: 500 },
  { name: 'Golem', hp: 750000, defense: 5, thornsDamage: 1, icon: '🗿', adenaReward: 2000, expReward: 1000 },
  { name: 'Spider Queen', hp: 1000000, defense: 10, thornsDamage: 2, icon: '🕷️', adenaReward: 3500, expReward: 1800 },
  { name: 'Werewolf', hp: 1500000, defense: 15, thornsDamage: 3, icon: '🐺', adenaReward: 5000, expReward: 2500 },
  { name: 'Demon', hp: 2000000, defense: 20, thornsDamage: 4, icon: '👹', adenaReward: 7000, expReward: 3500 },
  { name: 'Kraken', hp: 3000000, defense: 30, thornsDamage: 5, icon: '🐙', adenaReward: 10000, expReward: 5000 },
  { name: 'Dragon', hp: 5000000, defense: 50, thornsDamage: 6, icon: '🐉', adenaReward: 15000, expReward: 8000 },
  { name: 'Hydra', hp: 7500000, defense: 75, thornsDamage: 8, icon: '🐍', adenaReward: 25000, expReward: 12000 },
  { name: 'Phoenix', hp: 10000000, defense: 100, thornsDamage: 10, icon: '🔥', adenaReward: 35000, expReward: 20000 },
  { name: 'Ancient Dragon', hp: 15000000, defense: 150, thornsDamage: 15, icon: '🏴', adenaReward: 50000, expReward: 30000 },
];

// Respawn timer (10 minutes = 600000ms)
const RESPAWN_TIME_MS = 600000;
let respawnTimestamp = 0;

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
        title: 'World Boss',
        maxHp: boss.hp,
        currentHp: boss.hp,
        defense: boss.defense,
        thornsDamage: boss.thornsDamage || 0,  // L2: обратка
        ragePhase: 0,
        sessionId: null,
        icon: boss.icon,
        bossIndex: currentBossIndex + 1,
        totalBosses: DEFAULT_BOSSES.length,
        adenaReward: boss.adenaReward,
        expReward: boss.expReward,
      };
    }
  } catch (err) {
    console.error('[Boss] Respawn error:', err.message);
    const boss = DEFAULT_BOSSES[0];
    bossState = {
      id: 'default',
      name: boss.name,
      title: 'World Boss',
      maxHp: boss.hp,
      currentHp: boss.hp,
      defense: boss.defense,
      thornsDamage: boss.thornsDamage || 0,  // L2: обратка
      ragePhase: 0,
      sessionId: null,
      icon: boss.icon,
      bossIndex: 1,
      totalBosses: DEFAULT_BOSSES.length,
      adenaReward: boss.adenaReward,
      expReward: boss.expReward,
    };
  }

  sessionLeaderboard.clear();
  console.log(`[Boss] Respawned: ${bossState.name} (${bossState.bossIndex}/${bossState.totalBosses}) with ${bossState.maxHp} HP`);
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

  // Initialize boss (start with first boss, don't rotate)
  await respawnBoss(prisma, false);

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

    const player = {
      odamage: '',
      odamageN: 'Guest',
      // Legacy stats
      str: 1,
      dex: 1,
      luck: 1,
      pAtk: 10,
      critChance: BASE_CRIT_CHANCE,
      // L2 Core Attributes (NEW)
      power: 10,
      agility: 10,
      vitality: 10,
      intellect: 10,
      spirit: 10,
      // L2 Derived Stats (NEW)
      physicalPower: 15,
      maxHealth: 100,
      physicalDefense: 40,
      attackSpeed: 300,
      // Stamina System (NEW - replaces mana for combat)
      stamina: 100,
      maxStamina: 100,
      exhaustedUntil: null,  // timestamp when exhaustion ends
      // Mana system (kept for skills/magic - future)
      mana: 1000,
      maxMana: 1000,
      manaRegen: BASE_MANA_REGEN,
      // Tap & Auto-attack
      tapsPerSecond: BASE_TAPS_PER_SECOND,
      autoAttackSpeed: 0,
      lastTapTime: 0,
      tapCount: 0,
      // First login
      isFirstLogin: true,
      // Stats
      adena: 0,
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
    };

    onlineUsers.set(socket.id, player);

    // Send initial state
    socket.emit('boss:state', {
      id: bossState.id,
      name: bossState.name,
      title: bossState.title,
      hp: bossState.currentHp,
      maxHp: bossState.maxHp,
      defense: bossState.defense,
      ragePhase: bossState.ragePhase,
      playersOnline: onlineUsers.size,
      icon: bossState.icon,
      bossIndex: bossState.bossIndex,
      totalBosses: bossState.totalBosses,
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
          socket.emit('player:data', {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            level: user.level,
            str: user.str,
            dex: user.dex,
            luck: user.luck,
            pAtk: user.pAtk,
            critChance: user.critChance,
            adena: Number(user.adena),
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
          });
        }
      } catch (err) {
        console.error('[Player] Get error:', err.message);
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

        // Calculate offline earnings
        const offlineEarnings = calculateOfflineEarnings(user, user.lastOnline);
        let offlineAdena = 0;

        if (offlineEarnings.adena > 0) {
          offlineAdena = offlineEarnings.adena;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              adena: { increment: BigInt(offlineAdena) },
              offlineEarnings: { increment: BigInt(offlineAdena) },
            },
          });
          user.adena = BigInt(Number(user.adena) + offlineAdena);
        }

        // Update player state from DB
        player.odamage = user.id;
        player.odamageN = user.firstName || user.username || 'Player';
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
        // L2 Derived Stats (NEW)
        player.physicalPower = user.physicalPower || 15;
        player.maxHealth = user.maxHealth || 100;
        player.physicalDefense = user.physicalDefense || 40;
        player.attackSpeed = user.attackSpeed || 300;
        // L2 Stamina (NEW)
        player.stamina = user.stamina || 100;
        player.maxStamina = user.maxStamina || 100;
        player.exhaustedUntil = user.exhaustedUntil ? user.exhaustedUntil.getTime() : null;
        // Mana
        player.mana = user.mana;
        player.maxMana = user.maxMana;
        player.manaRegen = user.manaRegen;
        player.tapsPerSecond = user.tapsPerSecond;
        player.autoAttackSpeed = user.autoAttackSpeed;
        player.isFirstLogin = user.isFirstLogin;
        player.adena = Number(user.adena);
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

        // Send offline earnings notification if any
        if (offlineAdena > 0) {
          socket.emit('offline:earnings', {
            adena: offlineAdena,
            hours: offlineEarnings.hours,
          });
        }

        socket.emit('auth:success', {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          level: user.level,
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
          // L2 Stamina (NEW)
          stamina: player.stamina,
          maxStamina: player.maxStamina,
          exhaustedUntil: player.exhaustedUntil,
          // Other
          adena: Number(user.adena),
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

      // L2: Calculate thorns damage and stamina cost
      const thornsTaken = StatsService.calculateThorns(bossState.thornsDamage, player.physicalDefense);
      const staminaCostPerTap = StatsService.getStaminaCost(thornsTaken);
      const totalStaminaCost = tapCount * staminaCostPerTap;

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
      const adenaGained = Math.floor(actualDamage / 100);
      player.adena += adenaGained;

      player.sessionDamage += actualDamage;
      player.sessionClicks += tapCount;
      player.sessionCrits += crits;

      const key = player.odamage || socket.id;
      const existing = sessionLeaderboard.get(key);
      sessionLeaderboard.set(key, {
        odamage: (existing?.odamage || 0) + actualDamage,
        odamageN: player.odamageN,
      });

      socket.emit('tap:result', {
        damage: actualDamage,
        crits,
        // L2 Stamina (NEW)
        stamina: player.stamina,
        maxStamina: player.maxStamina,
        thornsTaken,
        staminaCost: tapCount * staminaCostPerTap,
        // Legacy mana
        mana: player.mana,
        sessionDamage: player.sessionDamage,
        adena: player.adena,
        adenaGained,
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
        console.log(`[Boss] ${bossState.name} killed by ${player.odamageN}!`);

        if (bossState.sessionId) {
          try {
            await prisma.bossSession.update({
              where: { id: bossState.sessionId },
              data: { endedAt: new Date(), finalBlowBy: player.odamage || null },
            });
          } catch (e) {}
        }

        // Build leaderboard
        const leaderboard = Array.from(sessionLeaderboard.entries())
          .map(([id, data]) => ({
            odamage: id,
            visitorId: id,
            visitorName: data.odamageN,
            damage: data.odamage,
          }))
          .sort((a, b) => b.damage - a.damage);

        const totalDamageDealt = leaderboard.reduce((sum, p) => sum + p.damage, 0);
        const topDamagePlayer = leaderboard[0];

        // Boss rewards (from DB or defaults)
        const bossAdenaPool = bossState.adenaReward || 5000;
        const bossExpPool = bossState.expReward || 2000;

        // Distribute rewards to all participants
        const rewards = [];
        for (const entry of leaderboard) {
          const damagePercent = entry.damage / totalDamageDealt;
          let adenaReward = Math.floor(bossAdenaPool * damagePercent);
          let expReward = Math.floor(bossExpPool * damagePercent);

          // Bonus for final blow (20% extra)
          const isFinalBlow = entry.odamage === player.odamage;
          if (isFinalBlow) {
            adenaReward = Math.floor(adenaReward * 1.2);
            expReward = Math.floor(expReward * 1.2);
          }

          // Bonus for top damage (15% extra)
          const isTopDamage = entry.odamage === topDamagePlayer?.odamage;
          if (isTopDamage) {
            adenaReward = Math.floor(adenaReward * 1.15);
            expReward = Math.floor(expReward * 1.15);
          }

          rewards.push({
            odamage: entry.odamage,
            visitorName: entry.visitorName,
            damage: entry.damage,
            damagePercent: Math.round(damagePercent * 100),
            adenaReward,
            expReward,
            isFinalBlow,
            isTopDamage,
          });

          // Update player in DB
          try {
            await prisma.user.update({
              where: { id: entry.odamage },
              data: {
                adena: { increment: BigInt(adenaReward) },
                exp: { increment: BigInt(expReward) },
                totalDamage: { increment: BigInt(entry.damage) },
                bossesKilled: { increment: isFinalBlow ? 1 : 0 },
              },
            });

            // Update in-memory player if online
            for (const [sid, p] of onlineUsers.entries()) {
              if (p.odamage === entry.odamage) {
                p.adena += adenaReward;
                p.sessionDamage = 0; // Reset session damage
                break;
              }
            }
          } catch (e) {
            console.error('[Reward] Error:', e.message);
          }
        }

        // Set respawn timer
        respawnTimestamp = Date.now() + RESPAWN_TIME_MS;

        io.emit('boss:killed', {
          bossName: bossState.name,
          bossIcon: bossState.icon,
          finalBlowBy: player.odamageN,
          topDamageBy: topDamagePlayer?.visitorName || 'Unknown',
          topDamage: topDamagePlayer?.damage || 0,
          leaderboard: leaderboard.slice(0, 10),
          rewards: rewards.slice(0, 10),
          respawnAt: respawnTimestamp,
          respawnIn: RESPAWN_TIME_MS,
        });

        console.log(`[Boss] ${bossState.name} killed! Final blow: ${player.odamageN}, Top damage: ${topDamagePlayer?.visitorName}`);

        // Respawn after 10 minutes
        setTimeout(async () => {
          await respawnBoss(prisma);
          respawnTimestamp = 0;
          io.emit('boss:respawn', {
            id: bossState.id,
            name: bossState.name,
            title: bossState.title,
            hp: bossState.currentHp,
            maxHp: bossState.maxHp,
            icon: bossState.icon,
          });
        }, RESPAWN_TIME_MS);
      }
    });

    // LEADERBOARD
    socket.on('leaderboard:get', () => {
      const leaderboard = Array.from(sessionLeaderboard.entries())
        .map(([id, data]) => ({
          visitorId: id,
          visitorName: data.odamageN,
          damage: data.odamage,
        }))
        .sort((a, b) => b.damage - a.damage)
        .slice(0, 20);
      socket.emit('leaderboard:data', leaderboard);
    });

    // ALL-TIME LEADERBOARD
    socket.on('leaderboard:alltime:get', async () => {
      try {
        const topUsers = await prisma.user.findMany({
          orderBy: { totalDamage: 'desc' },
          take: 20,
          select: {
            id: true,
            firstName: true,
            username: true,
            totalDamage: true,
          },
        });
        const leaderboard = topUsers.map(u => ({
          visitorId: u.id,
          visitorName: u.firstName || u.username || 'Anonymous',
          damage: Number(u.totalDamage),
        }));
        socket.emit('leaderboard:alltime', leaderboard);
      } catch (err) {
        console.error('[Leaderboard] Error:', err.message);
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
      if (player.adena < cost) {
        socket.emit('upgrade:error', { message: 'Not enough adena' });
        return;
      }

      try {
        player[stat] += 1;
        player.adena -= cost;

        // Recalculate derived stats
        player.pAtk = 10 + Math.floor(player.str * 2);
        player.critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            [stat]: player[stat],
            adena: BigInt(player.adena),
            pAtk: player.pAtk,
            critChance: player.critChance,
          },
        });

        socket.emit('upgrade:success', {
          stat,
          value: player[stat],
          adena: player.adena,
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
      if (player.adena < cost) {
        socket.emit('upgrade:error', { message: 'Not enough adena' });
        return;
      }

      try {
        player.tapsPerSecond += 1;
        player.adena -= cost;

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            tapsPerSecond: player.tapsPerSecond,
            adena: BigInt(player.adena),
          },
        });

        socket.emit('upgrade:success', {
          stat: 'tapsPerSecond',
          value: player.tapsPerSecond,
          adena: player.adena,
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
      if (player.adena < cost) {
        socket.emit('upgrade:error', { message: 'Not enough adena' });
        return;
      }

      try {
        player.autoAttackSpeed += 1;
        player.adena -= cost;

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            autoAttackSpeed: player.autoAttackSpeed,
            adena: BigInt(player.adena),
          },
        });

        socket.emit('upgrade:success', {
          stat: 'autoAttackSpeed',
          value: player.autoAttackSpeed,
          adena: player.adena,
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
      if (player.adena < cost) {
        socket.emit('upgrade:error', { message: 'Not enough adena' });
        return;
      }

      try {
        // Increase by 0.2 per upgrade (5 levels to go from 0.2 to 1, then increments of 1)
        if (player.manaRegen < 1) {
          player.manaRegen = Math.round((player.manaRegen + 0.2) * 10) / 10;
        } else {
          player.manaRegen += 1;
        }
        player.adena -= cost;

        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            manaRegen: player.manaRegen,
            adena: BigInt(player.adena),
          },
        });

        socket.emit('upgrade:success', {
          stat: 'manaRegen',
          value: player.manaRegen,
          adena: player.adena,
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
          if (player.adena < totalCost) {
            socket.emit('shop:error', { message: 'Not enough adena' });
            return;
          }

          player.adena -= totalCost;
          const ssKey = `soulshot${grade}`;
          player[ssKey] = (player[ssKey] || 0) + quantity;

          // Update DB (only for NG, D, C which exist in schema)
          const updateData = { adena: BigInt(player.adena) };
          if (['NG', 'D', 'C'].includes(grade)) {
            updateData[ssKey] = player[ssKey];
          }

          await prisma.user.update({
            where: { id: player.odamage },
            data: updateData,
          });

          socket.emit('shop:success', {
            adena: player.adena,
            [ssKey]: player[ssKey],
          });
        } else if (data.type === 'buff') {
          const buffId = data.buffId;
          if (!BUFFS[buffId]) {
            socket.emit('shop:error', { message: 'Invalid buff' });
            return;
          }

          const cost = BUFFS[buffId].cost;
          if (player.adena < cost) {
            socket.emit('shop:error', { message: 'Not enough adena' });
            return;
          }

          player.adena -= cost;
          const potionKey = `potion${buffId.charAt(0).toUpperCase() + buffId.slice(1)}`;
          player[potionKey] = (player[potionKey] || 0) + 1;

          await prisma.user.update({
            where: { id: player.odamage },
            data: {
              adena: BigInt(player.adena),
              [potionKey]: player[potionKey],
            },
          });

          socket.emit('shop:success', {
            adena: player.adena,
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
            adena: BigInt(player.adena),
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
          console.log(`[Disconnect] Saved data for user ${player.odamage}: adena=${player.adena}, stamina=${player.stamina}, dmg=${player.sessionDamage}`);
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
      title: bossState.title,
      hp: bossState.currentHp,
      maxHp: bossState.maxHp,
      defense: bossState.defense,
      ragePhase: bossState.ragePhase,
      icon: bossState.icon,
      bossIndex: bossState.bossIndex,
      totalBosses: bossState.totalBosses,
      playersOnline: onlineUsers.size,
    });
  }, 250);

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
  setInterval(() => {
    if (bossState.currentHp <= 0) return; // Boss is dead

    for (const [socketId, player] of onlineUsers.entries()) {
      if (player.autoAttackSpeed > 0 && player.odamage) {
        // Calculate auto damage (same as regular damage but weaker)
        const baseDamage = player.pAtk * (1 + player.str * STAT_EFFECTS.str);
        let totalAutoDamage = 0;

        // Number of auto attacks per second
        for (let i = 0; i < player.autoAttackSpeed; i++) {
          let dmg = baseDamage * (0.8 + Math.random() * 0.2); // Slightly lower variance
          const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
          dmg *= rageMultiplier;
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
          });

          player.sessionDamage += actualDamage;

          // Adena from auto-attack (lower rate)
          const adenaGained = Math.floor(actualDamage / 200);
          player.adena += adenaGained;

          // Send auto-attack result to player
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('autoAttack:result', {
              damage: actualDamage,
              sessionDamage: player.sessionDamage,
              adena: player.adena,
            });
          }

          // Broadcast to damage feed
          io.emit('damage:feed', {
            playerName: player.odamageN + ' (Auto)',
            damage: actualDamage,
            isCrit: false,
          });

          // Check rage phase
          updateRagePhase();
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
              adena: BigInt(player.adena),
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
