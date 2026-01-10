// ═══════════════════════════════════════════════════════════════════════════
// ИЗВЛЕЧЕНИЕ ИЗ server.js v1.5.11 - НАГРАДЫ И ACTIVITY TRACKING
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY TRACKING (TZ Этап 2)
// Строки 3330-3370 в server.js
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// REWARD CALCULATION (TZ Этап 2)
// Строки 1368-1438 в server.js
// ═══════════════════════════════════════════════════════════════════════════

// Helper: Calculate chest + lottery ticket rewards based on rank (per TZ)
// Participation: 2 Wooden + 1 Ticket for all eligible
// Ranking: additional chests + tickets for top players
const getChestRewardsByRank = (rank, isEligible) => {
  // НЕ ELIGIBLE = НЕТ НАГРАД!
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

// ═══════════════════════════════════════════════════════════════════════════
// REWARD DISTRIBUTION (in distributeBossRewards)
// Строки 1443-1594 в server.js
// ═══════════════════════════════════════════════════════════════════════════

for (let i = 0; i < leaderboard.length; i++) {
  const entry = leaderboard[i];
  const rank = i + 1;

  // Eligibility: entry.isEligible already set by activity tracking (60s OR 20 actions)
  // Anti-AFK: новичок с маленьким уроном но активный - eligible
  const isEligibleForReward = entry.isEligible;

  // Calculate chest rewards (includes lottery tickets)
  const chestRewards = getChestRewardsByRank(rank, isEligibleForReward);

  // ... reward processing ...

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
}

// ═══════════════════════════════════════════════════════════════════════════
// REWARDS:CLAIM HANDLER
// Строки 3448-3600 в server.js
// ═══════════════════════════════════════════════════════════════════════════

socket.on('rewards:claim', async (data) => {
  // data: { rewardId, take: { wooden: 2, bronze: 1, silver: 0, gold: 1 } }
  if (!player.odamage) {
    socket.emit('rewards:error', { message: 'Not authenticated' });
    return;
  }

  const { rewardId, take } = data || {};

  try {
    // Find pending reward
    const pending = await prisma.pendingReward.findUnique({
      where: { id: rewardId },
    });

    if (!pending || pending.userId !== player.odamage) {
      socket.emit('rewards:error', { message: 'Reward not found' });
      return;
    }

    // ... validate take amounts ...

    // Create chests for the player
    const chestsToCreate = [];
    const chestTypes = ['wooden', 'bronze', 'silver', 'gold'];
    const chestDurations = {
      wooden: 5 * 60 * 1000,      // 5 min
      bronze: 30 * 60 * 1000,     // 30 min
      silver: 4 * 60 * 60 * 1000, // 4 hours
      gold: 8 * 60 * 60 * 1000,   // 8 hours
    };

    for (const type of chestTypes) {
      const count = take[type] || 0;
      for (let i = 0; i < count; i++) {
        chestsToCreate.push({
          type: type,
          userId: player.odamage,
          openingDuration: chestDurations[type],
        });
      }
    }

    if (chestsToCreate.length > 0) {
      await prisma.chest.createMany({ data: chestsToCreate });
    }

    // Award crystals
    const crystalsAwarded = pending.crystals || 0;
    if (crystalsAwarded > 0) {
      await prisma.user.update({
        where: { id: player.odamage },
        data: { ancientCoin: { increment: crystalsAwarded } },
      });
    }

    // Award lottery tickets
    const ticketsAwarded = pending.lotteryTickets || 0;
    if (ticketsAwarded > 0) {
      await prisma.user.update({
        where: { id: player.odamage },
        data: { lotteryTickets: { increment: ticketsAwarded } },
      });
    }

    // Delete pending reward
    await prisma.pendingReward.delete({ where: { id: rewardId } });

    // Fetch updated user data
    const updatedUser = await prisma.user.findUnique({
      where: { id: player.odamage },
      select: { ancientCoin: true, lotteryTickets: true },
    });

    // Update player in memory
    player.crystals = updatedUser?.ancientCoin || 0;
    player.lotteryTickets = updatedUser?.lotteryTickets || 0;

    socket.emit('rewards:claimed', {
      chestsCreated: chestsToCreate.length,
      crystals: crystalsAwarded,
      lotteryTickets: ticketsAwarded,
      newCrystalsTotal: player.crystals,
      newTicketsTotal: player.lotteryTickets,
    });

  } catch (err) {
    console.error('[Rewards] Claim error:', err.message);
    socket.emit('rewards:error', { message: 'Claim failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER INITIAL STATE (relevant fields)
// Строки 3196-3210 в server.js
// ═══════════════════════════════════════════════════════════════════════════

const player = {
  // ... other fields ...
  sessionDamage: 0,            // Damage in current boss session
  sessionClicks: 0,            // Clicks in current boss session
  activityTime: 0,             // Activity time for current boss (ms)
  lastActivityPing: 0,         // Last activity ping timestamp
  activityBossSession: null,   // Which boss session this activity is for
  isEligible: false,           // 60+ seconds activity OR 20+ actions = eligible for rewards
  // ...
};
