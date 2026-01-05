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

// ═══════════════════════════════════════════════════════════
// DAMAGE CALCULATION
// ═══════════════════════════════════════════════════════════

function calculateDamage(player, tapCount) {
  let totalDamage = 0;
  let crits = 0;

  const baseDamage = player.pAtk * (1 + player.str * STAT_EFFECTS.str);
  const critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.luck * STAT_EFFECTS.luck);

  for (let i = 0; i < tapCount; i++) {
    let dmg = baseDamage * (0.9 + Math.random() * 0.2);

    if (Math.random() < critChance) {
      dmg *= BASE_CRIT_DAMAGE;
      crits++;
    }

    const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
    dmg *= rageMultiplier;
    dmg = Math.max(1, dmg - bossState.defense);
    totalDamage += Math.floor(dmg);
  }

  return { totalDamage, crits };
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
      sessionDamage: 0,
      sessionClicks: 0,
      sessionCrits: 0,
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

        player.odamage = user.id;
        player.odamageN = user.firstName || user.username || 'Player';
        player.str = user.str;
        player.dex = user.dex;
        player.luck = user.luck;
        player.pAtk = user.pAtk;
        player.energy = user.energy;
        player.maxEnergy = user.maxEnergy;

        socket.emit('auth:success', {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          level: user.level,
          str: user.str,
          dex: user.dex,
          luck: user.luck,
          adena: Number(user.adena),
          energy: user.energy,
          totalDamage: Number(user.totalDamage),
          bossesKilled: user.bossesKilled,
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

      const { totalDamage, crits } = calculateDamage(player, tapCount);
      const actualDamage = Math.min(totalDamage, bossState.currentHp);
      bossState.currentHp -= actualDamage;

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
          .map(([id, data]) => ({ odamage: id, ...data }))
          .sort((a, b) => b.odamage - a.odamage)
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
        .map(([id, data]) => ({ odamage: id, ...data }))
        .sort((a, b) => b.odamage - a.odamage)
        .slice(0, 20);
      socket.emit('leaderboard:data', leaderboard);
    });

    // DISCONNECT
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);

      if (player.odamage && player.sessionDamage > 0) {
        try {
          await prisma.user.update({
            where: { id: player.odamage },
            data: {
              energy: player.energy,
              totalDamage: { increment: BigInt(player.sessionDamage) },
              totalClicks: { increment: BigInt(player.sessionClicks) },
              lastOnline: new Date(),
            },
          });
        } catch (e) {}
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
