// ═══════════════════════════════════════════════════════════
// LEADERBOARD SERVER CODE (extracted from server.js)
// ═══════════════════════════════════════════════════════════

// Previous boss session data for leaderboard
let previousBossSession = null;

// Real-time session data
const sessionLeaderboard = new Map();
// Key: odamage (user ID)
// Value: { odamage: totalDamage, odamageN: playerName, photoUrl, isEligible }

// ═══════════════════════════════════════════════════════════
// SOCKET EVENTS - LEADERBOARD
// ═══════════════════════════════════════════════════════════

// 1. CURRENT BOSS LEADERBOARD
socket.on('leaderboard:get', () => {
  const totalDamage = Array.from(sessionLeaderboard.values()).reduce((sum, d) => sum + d.odamage, 0);
  const leaderboard = Array.from(sessionLeaderboard.entries())
    .map(([id, data]) => ({
      visitorId: id,
      visitorName: data.odamageN || id,
      photoUrl: data.photoUrl,
      damage: data.odamage,
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

// 2. PREVIOUS BOSS LEADERBOARD
socket.on('leaderboard:previous:get', () => {
  if (previousBossSession) {
    socket.emit('leaderboard:previous', previousBossSession);
  } else {
    socket.emit('leaderboard:previous', null);
  }
});

// 3. ALL-TIME LEADERBOARD (Legend)
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
// BOSS KILL - LEADERBOARD UPDATE
// ═══════════════════════════════════════════════════════════

async function handleBossKill(io, prisma, killerPlayer, killerSocketId) {
  // Build leaderboard with photoUrl and activity status
  const leaderboard = Array.from(sessionLeaderboard.entries())
    .map(([id, data]) => ({
      odamage: id,
      visitorId: id,
      visitorName: data.odamageN,
      photoUrl: data.photoUrl,
      damage: data.odamage,
      isEligible: data.isEligible || false, // 30 sec activity requirement
    }))
    .sort((a, b) => b.damage - a.damage);

  const totalDamageDealt = leaderboard.reduce((sum, p) => sum + p.damage, 0);
  const topDamagePlayer = leaderboard[0];
  const finalBlowPlayer = killerPlayer;

  // Calculate chest rewards based on rank (per TZ)
  const getChestRewardsByRank = (rank, isEligible) => {
    if (!isEligible) return { wooden: 0, bronze: 0, silver: 0, gold: 0, badge: null, badgeDays: null };

    let wooden = 2; // Base reward for all eligible players
    let bronze = 0, silver = 0, gold = 0;
    let badge = null, badgeDays = null;

    if (rank === 1) {
      gold += 1; silver += 2; bronze += 2;
      badge = 'slayer'; badgeDays = 7;
    } else if (rank === 2) {
      gold += 1; silver += 1; bronze += 2;
      badge = 'elite'; badgeDays = 7;
    } else if (rank === 3) {
      gold += 1; silver += 1; bronze += 1;
      badge = 'elite'; badgeDays = 3;
    } else if (rank >= 4 && rank <= 10) {
      silver += 1; bronze += 1;
    } else if (rank >= 11 && rank <= 25) {
      silver += 1;
    } else if (rank >= 26 && rank <= 50) {
      bronze += 1; wooden += 1;
    } else if (rank >= 51 && rank <= 100) {
      bronze += 1;
    }
    // 101+: only base reward (2 wooden)

    return { wooden, bronze, silver, gold, badge, badgeDays };
  };

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
}

// ═══════════════════════════════════════════════════════════
// LEADERBOARD PERSISTENCE (saved to GameState)
// ═══════════════════════════════════════════════════════════

// On save:
const leaderboardArray = Array.from(sessionLeaderboard.entries()).map(([odamage, data]) => ({
  odamage,
  ...data,
}));

// In GameState upsert:
// sessionLeaderboard: leaderboardArray,
// previousBossSession: previousBossSession,

// On load:
if (state.sessionLeaderboard && Array.isArray(state.sessionLeaderboard)) {
  sessionLeaderboard.clear();
  for (const entry of state.sessionLeaderboard) {
    sessionLeaderboard.set(entry.odamage, entry);
  }
}

if (state.previousBossSession) {
  previousBossSession = state.previousBossSession;
}
