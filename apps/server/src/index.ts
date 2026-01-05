import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server, Socket } from 'socket.io';
import { env } from './config/env.js';
import { prisma } from './shared/prisma/client.js';

// ═══════════════════════════════════════════════════════════
// IN-MEMORY STATE (instead of Redis)
// ═══════════════════════════════════════════════════════════

interface BossState {
  id: string;
  name: string;
  maxHp: number;
  currentHp: number;
  defense: number;
  ragePhase: number; // 0, 1, 2, 3
  sessionId: string | null;
}

interface PlayerSession {
  odamage: string;
  odamageKey: string;
  odamageN: string | null;
  odamagePic: string | null;
  odamageSTR: number;
  odamageDEX: number;
  odamageLUCK: number;
  pAtk: number;
  critChance: number;
  energy: number;
  maxEnergy: number;
  sessionDamage: number;
  sessionClicks: number;
  sessionCrits: number;
}

// Global state
const onlineUsers = new Map<string, PlayerSession>(); // socketId -> player
let bossState: BossState = {
  id: 'default',
  name: 'Orfen',
  maxHp: 1_000_000,
  currentHp: 1_000_000,
  defense: 0,
  ragePhase: 0,
  sessionId: null,
};

// Damage leaderboard for current session
const sessionLeaderboard = new Map<string, { odamage: number; odamageN: string }>(); // odamage -> damage

// ═══════════════════════════════════════════════════════════
// GAME CONSTANTS
// ═══════════════════════════════════════════════════════════

const STAT_EFFECTS = {
  str: 0.08,  // +8% damage per point
  dex: 0.05,  // +5% attack speed per point (not used in clicker, but for future)
  luck: 0.03, // +3% crit chance per point
};

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

function calculateDamage(player: PlayerSession, tapCount: number): { totalDamage: number; crits: number } {
  let totalDamage = 0;
  let crits = 0;

  const baseDamage = player.pAtk * (1 + player.odamageSTR * STAT_EFFECTS.str);
  const critChance = Math.min(0.75, BASE_CRIT_CHANCE + player.odamageLUCK * STAT_EFFECTS.luck);

  for (let i = 0; i < tapCount; i++) {
    let dmg = baseDamage * (0.9 + Math.random() * 0.2); // 90-110% variance

    if (Math.random() < critChance) {
      dmg *= BASE_CRIT_DAMAGE;
      crits++;
    }

    // Apply rage phase multiplier
    const rageMultiplier = RAGE_PHASES[bossState.ragePhase]?.multiplier || 1.0;
    dmg *= rageMultiplier;

    // Subtract boss defense
    dmg = Math.max(1, dmg - bossState.defense);

    totalDamage += Math.floor(dmg);
  }

  return { totalDamage, crits };
}

function updateRagePhase(): boolean {
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

async function respawnBoss() {
  // Create new session in DB
  const boss = await prisma.boss.findFirst({ where: { isActive: true } });

  if (boss) {
    const session = await prisma.bossSession.create({
      data: {
        bossId: boss.id,
        maxHp: boss.baseHp,
      },
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
    // Default boss if none in DB
    bossState = {
      id: 'default',
      name: 'Orfen',
      maxHp: 1_000_000,
      currentHp: 1_000_000,
      defense: 0,
      ragePhase: 0,
      sessionId: null,
    };
  }

  sessionLeaderboard.clear();
  console.log(`[Boss] Respawned: ${bossState.name} with ${bossState.maxHp} HP`);
}

// ═══════════════════════════════════════════════════════════
// SERVER SETUP
// ═══════════════════════════════════════════════════════════

const fastify = Fastify({
  logger: true,
});

// CORS
await fastify.register(cors, {
  origin: env.CORS_ORIGIN.split(','),
  credentials: true,
});

// Socket.IO
const io = new Server(fastify.server, {
  cors: {
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Health check
fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: Date.now(),
    playersOnline: onlineUsers.size,
    bossHp: bossState.currentHp,
    bossMaxHp: bossState.maxHp,
  };
});

// ═══════════════════════════════════════════════════════════
// SOCKET.IO HANDLERS
// ═══════════════════════════════════════════════════════════

io.on('connection', async (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Initialize player with default stats (will be updated on auth)
  const player: PlayerSession = {
    odamage: '',
    odamageKey: socket.id,
    odamageN: 'Guest',
    odamagePic: null,
    odamageSTR: 1,
    odamageDEX: 1,
    odamageLUCK: 1,
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
    str: player.odamageSTR,
    dex: player.odamageDEX,
    luck: player.odamageLUCK,
  });

  // ─────────────────────────────────────────────────────────
  // AUTH - Link to Telegram user
  // ─────────────────────────────────────────────────────────
  socket.on('auth', async (data: { telegramId: number; username?: string; firstName?: string; photoUrl?: string }) => {
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
        console.log(`[Auth] New user created: ${data.telegramId}`);
      }

      // Update player session with user data
      player.odamage = user.id;
      player.odamageN = user.firstName || user.username || 'Player';
      player.odamagePic = user.photoUrl || null;
      player.odamageSTR = user.str;
      player.odamageDEX = user.dex;
      player.odamageLUCK = user.luck;
      player.pAtk = user.pAtk;
      player.critChance = user.critChance;
      player.energy = user.energy;
      player.maxEnergy = user.maxEnergy;

      socket.emit('auth:success', {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        level: user.level,
        exp: Number(user.exp),
        str: user.str,
        dex: user.dex,
        luck: user.luck,
        adena: Number(user.adena),
        energy: user.energy,
        maxEnergy: user.maxEnergy,
        totalDamage: Number(user.totalDamage),
        bossesKilled: user.bossesKilled,
      });

      console.log(`[Auth] User authenticated: ${user.id}`);
    } catch (err) {
      console.error('[Auth] Error:', err);
      socket.emit('auth:error', { message: 'Authentication failed' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // TAP - Process damage
  // ─────────────────────────────────────────────────────────
  socket.on('tap:batch', async (data: { count: number }) => {
    const tapCount = Math.min(data.count || 1, MAX_TAPS_PER_BATCH);

    // Check energy
    const energyCost = tapCount * ENERGY_COST_PER_TAP;
    if (player.energy < energyCost) {
      socket.emit('tap:error', { message: 'Not enough energy' });
      return;
    }

    // Boss dead check
    if (bossState.currentHp <= 0) {
      socket.emit('tap:error', { message: 'Boss is dead' });
      return;
    }

    // Deduct energy
    player.energy -= energyCost;

    // Calculate damage
    const { totalDamage, crits } = calculateDamage(player, tapCount);

    // Apply damage to boss
    const actualDamage = Math.min(totalDamage, bossState.currentHp);
    bossState.currentHp -= actualDamage;

    // Update player session stats
    player.sessionDamage += actualDamage;
    player.sessionClicks += tapCount;
    player.sessionCrits += crits;

    // Update leaderboard
    const existingEntry = sessionLeaderboard.get(player.odamage || socket.id);
    sessionLeaderboard.set(player.odamage || socket.id, {
      odamage: (existingEntry?.odamage || 0) + actualDamage,
      odamageN: player.odamageN || 'Guest',
    });

    // Send result to player
    socket.emit('tap:result', {
      damage: actualDamage,
      crits,
      energy: player.energy,
      sessionDamage: player.sessionDamage,
    });

    // Broadcast damage to all (for feed)
    io.emit('damage:feed', {
      odamageN: player.odamageN,
      odamage: actualDamage,
      isCrit: crits > 0,
    });

    // Check rage phase
    if (updateRagePhase()) {
      io.emit('boss:rage', {
        phase: bossState.ragePhase,
        multiplier: RAGE_PHASES[bossState.ragePhase].multiplier,
      });
    }

    // Check boss death
    if (bossState.currentHp <= 0) {
      console.log(`[Boss] ${bossState.name} killed!`);

      // Update DB
      if (bossState.sessionId) {
        await prisma.bossSession.update({
          where: { id: bossState.sessionId },
          data: {
            endedAt: new Date(),
            finalBlowBy: player.odamage || null,
          },
        });
      }

      // Update user stats
      if (player.odamage) {
        await prisma.user.update({
          where: { id: player.odamage },
          data: {
            totalDamage: { increment: BigInt(player.sessionDamage) },
            totalClicks: { increment: BigInt(player.sessionClicks) },
            bossesKilled: { increment: 1 },
          },
        });
      }

      // Get leaderboard
      const leaderboard = Array.from(sessionLeaderboard.entries())
        .map(([id, data]) => ({ odamage: id, ...data }))
        .sort((a, b) => b.odamage - a.odamage)
        .slice(0, 10);

      // Broadcast victory
      io.emit('boss:killed', {
        bossName: bossState.name,
        finalBlowBy: player.odamageN,
        leaderboard,
      });

      // Respawn after delay
      setTimeout(async () => {
        await respawnBoss();
        io.emit('boss:respawn', {
          id: bossState.id,
          name: bossState.name,
          hp: bossState.currentHp,
          maxHp: bossState.maxHp,
        });
      }, 5000);
    }
  });

  // ─────────────────────────────────────────────────────────
  // UPGRADE STAT
  // ─────────────────────────────────────────────────────────
  socket.on('upgrade:stat', async (data: { stat: 'str' | 'dex' | 'luck' }) => {
    if (!player.odamage) {
      socket.emit('upgrade:error', { message: 'Not authenticated' });
      return;
    }

    const cost = 100; // Base cost, can be made dynamic

    try {
      const user = await prisma.user.findUnique({ where: { id: player.odamage } });
      if (!user || Number(user.adena) < cost) {
        socket.emit('upgrade:error', { message: 'Not enough adena' });
        return;
      }

      const updateData: any = {
        adena: { decrement: BigInt(cost) },
      };
      updateData[data.stat] = { increment: 1 };

      // Recalculate derived stats
      if (data.stat === 'str') {
        updateData.pAtk = { increment: 1 };
      } else if (data.stat === 'luck') {
        const newLuck = user.luck + 1;
        updateData.critChance = Math.min(0.75, BASE_CRIT_CHANCE + newLuck * STAT_EFFECTS.luck);
      }

      const updatedUser = await prisma.user.update({
        where: { id: player.odamage },
        data: updateData,
      });

      // Update session
      player.odamageSTR = updatedUser.str;
      player.odamageDEX = updatedUser.dex;
      player.odamageLUCK = updatedUser.luck;
      player.pAtk = updatedUser.pAtk;
      player.critChance = updatedUser.critChance;

      socket.emit('upgrade:success', {
        stat: data.stat,
        value: updatedUser[data.stat],
        adena: Number(updatedUser.adena),
        pAtk: updatedUser.pAtk,
        critChance: updatedUser.critChance,
      });
    } catch (err) {
      console.error('[Upgrade] Error:', err);
      socket.emit('upgrade:error', { message: 'Upgrade failed' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET LEADERBOARD
  // ─────────────────────────────────────────────────────────
  socket.on('leaderboard:get', () => {
    const leaderboard = Array.from(sessionLeaderboard.entries())
      .map(([id, data]) => ({ odamage: id, ...data }))
      .sort((a, b) => b.odamage - a.odamage)
      .slice(0, 20);

    socket.emit('leaderboard:data', leaderboard);
  });

  // ─────────────────────────────────────────────────────────
  // DISCONNECT
  // ─────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);

    // Save user stats
    if (player.odamage && player.sessionDamage > 0) {
      await prisma.user.update({
        where: { id: player.odamage },
        data: {
          energy: player.energy,
          totalDamage: { increment: BigInt(player.sessionDamage) },
          totalClicks: { increment: BigInt(player.sessionClicks) },
          lastOnline: new Date(),
        },
      });
    }

    onlineUsers.delete(socket.id);
  });
});

// ═══════════════════════════════════════════════════════════
// BROADCAST INTERVALS
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

const start = async () => {
  try {
    await prisma.$connect();
    console.log('[Prisma] Connected to database');

    // Initialize boss
    await respawnBoss();

    await fastify.listen({ port: env.PORT, host: env.HOST });
    console.log(`[Server] Running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});
