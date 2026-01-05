const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

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
  name: 'Orfen',
  maxHp: 1000000,
  currentHp: 1000000,
  defense: 0,
  ragePhase: 0,
  sessionId: null,
};

const onlineUsers = new Map();
const sessionLeaderboard = new Map();

// ═══════════════════════════════════════════════════════════
// GAME CONSTANTS
// ═══════════════════════════════════════════════════════════

const STAT_EFFECTS = { str: 0.08, dex: 0.05, luck: 0.03 };
const BASE_CRIT_CHANCE = 0.05;
const BASE_CRIT_DAMAGE = 2.0;
const ENERGY_COST_PER_TAP = 1;
const ENERGY_REGEN_PER_SEC = 10;
const MAX_TAPS_PER_BATCH = 50;
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

// Offline progress constants
const OFFLINE_ADENA_PER_HOUR = 50; // Base adena per hour offline
const MAX_OFFLINE_HOURS = 8; // Maximum hours to accumulate

function calculateOfflineEarnings(player, lastOnline) {
  const now = Date.now();
  const offlineMs = now - lastOnline.getTime();
  const offlineHours = Math.min(offlineMs / (1000 * 60 * 60), MAX_OFFLINE_HOURS);

  if (offlineHours < 0.1) return { adena: 0, hours: 0 }; // Less than 6 min, no reward

  // Adena scales with player level/stats
  const multiplier = 1 + (player.str * 0.1) + (player.dex * 0.05);
  const adenaEarned = Math.floor(OFFLINE_ADENA_PER_HOUR * offlineHours * multiplier);

  return { adena: adenaEarned, hours: Math.round(offlineHours * 10) / 10 };
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

async function respawnBoss(prisma) {
  try {
    const boss = await prisma.boss.findFirst({ where: { isActive: true } });

    if (boss) {
      const session = await prisma.bossSession.create({
        data: { bossId: boss.id, maxHp: boss.baseHp },
      });

      bossState = {
        id: boss.id,
        name: boss.name,
        maxHp: Number(boss.baseHp),
        currentHp: Number(boss.baseHp),
        defense: boss.defense,
        ragePhase: 0,
        sessionId: session.id,
      };
    } else {
      bossState = {
        id: 'default',
        name: 'Orfen',
        maxHp: 1000000,
        currentHp: 1000000,
        defense: 0,
        ragePhase: 0,
        sessionId: null,
      };
    }
  } catch (err) {
    console.error('[Boss] Respawn error:', err.message);
    bossState = {
      id: 'default',
      name: 'Orfen',
      maxHp: 1000000,
      currentHp: 1000000,
      defense: 0,
      ragePhase: 0,
      sessionId: null,
    };
  }

  sessionLeaderboard.clear();
  console.log(`[Boss] Respawned: ${bossState.name} with ${bossState.maxHp} HP`);
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

  // Initialize boss
  await respawnBoss(prisma);

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
      str: 1,
      dex: 1,
      luck: 1,
      pAtk: 10,
      critChance: BASE_CRIT_CHANCE,
      energy: 1000,
      maxEnergy: 1000,
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
      hp: bossState.currentHp,
      maxHp: bossState.maxHp,
      ragePhase: bossState.ragePhase,
      playersOnline: onlineUsers.size,
    });

    socket.emit('player:state', {
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      sessionDamage: player.sessionDamage,
    });

    // AUTH
    socket.on('auth', async (data) => {
      try {
        let user = await prisma.user.findUnique({
          where: { telegramId: BigInt(data.telegramId) },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              telegramId: BigInt(data.telegramId),
              username: data.username,
              firstName: data.firstName,
              photoUrl: data.photoUrl,
            },
          });
          console.log(`[Auth] New user: ${data.telegramId}`);
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
        player.str = user.str;
        player.dex = user.dex;
        player.luck = user.luck;
        player.pAtk = user.pAtk;
        player.critChance = user.critChance;
        player.energy = user.energy;
        player.maxEnergy = user.maxEnergy;
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
          str: user.str,
          dex: user.dex,
          luck: user.luck,
          pAtk: user.pAtk,
          critChance: user.critChance,
          adena: Number(user.adena),
          energy: user.energy,
          maxEnergy: user.maxEnergy,
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
      const tapCount = Math.min(data.count || 1, MAX_TAPS_PER_BATCH);

      if (player.energy < tapCount * ENERGY_COST_PER_TAP) {
        socket.emit('tap:error', { message: 'Not enough energy' });
        return;
      }

      if (bossState.currentHp <= 0) {
        socket.emit('tap:error', { message: 'Boss is dead' });
        return;
      }

      player.energy -= tapCount * ENERGY_COST_PER_TAP;

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
        energy: player.energy,
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

        if (player.odamage) {
          try {
            await prisma.user.update({
              where: { id: player.odamage },
              data: {
                totalDamage: { increment: BigInt(player.sessionDamage) },
                totalClicks: { increment: BigInt(player.sessionClicks) },
                bossesKilled: { increment: 1 },
              },
            });
          } catch (e) {}
        }

        const leaderboard = Array.from(sessionLeaderboard.entries())
          .map(([id, data]) => ({
            visitorId: id,
            visitorName: data.odamageN,
            damage: data.odamage,
          }))
          .sort((a, b) => b.damage - a.damage)
          .slice(0, 10);

        io.emit('boss:killed', {
          bossName: bossState.name,
          finalBlowBy: player.odamageN,
          leaderboard,
        });

        setTimeout(async () => {
          await respawnBoss(prisma);
          io.emit('boss:respawn', {
            id: bossState.id,
            name: bossState.name,
            hp: bossState.currentHp,
            maxHp: bossState.maxHp,
          });
        }, 5000);
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
      console.log(`[Socket] Disconnected: ${socket.id}`);

      if (player.odamage) {
        try {
          const updateData = {
            energy: player.energy,
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
        } catch (e) {
          console.error('[Disconnect] Save error:', e.message);
        }
      }

      onlineUsers.delete(socket.id);
    });
  });

  // ─────────────────────────────────────────────────────────
  // INTERVALS
  // ─────────────────────────────────────────────────────────

  // Broadcast boss state every 100ms
  setInterval(() => {
    io.emit('boss:state', {
      id: bossState.id,
      name: bossState.name,
      hp: bossState.currentHp,
      maxHp: bossState.maxHp,
      ragePhase: bossState.ragePhase,
      playersOnline: onlineUsers.size,
    });
  }, 100);

  // Energy regen every second
  setInterval(() => {
    for (const player of onlineUsers.values()) {
      if (player.energy < player.maxEnergy) {
        player.energy = Math.min(player.maxEnergy, player.energy + ENERGY_REGEN_PER_SEC);
      }
    }
  }, 1000);

  // ─────────────────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────────────────

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO ready`);
    console.log(`> Boss: ${bossState.name} (${bossState.currentHp} HP)`);
  });
});
