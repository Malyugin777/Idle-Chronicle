import Redis from 'ioredis';
import { env } from '../../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

// Redis keys
export const KEYS = {
  // Boss state
  BOSS_CURRENT: 'boss:current',
  BOSS_HP: 'boss:hp',
  BOSS_RAGE: 'boss:rage',

  // Session
  bossSession: (sessionId: string) => `boss:session:${sessionId}`,
  sessionLeaderboard: (sessionId: string) => `boss:session:${sessionId}:lb`,
  sessionDamage: (sessionId: string, odamage: string) => `boss:session:${sessionId}:dmg:${odamage}`,
  sessionStats: (sessionId: string) => `boss:session:${sessionId}:stats`,

  // Rate limiting
  userRateLimit: (odamage: string) => `ratelimit:user:${odamage}`,
  RATE_LIMIT_CONFIG: 'ratelimit:config',

  // User cache
  userCache: (odamage: string) => `user:${odamage}`,

  // Online users
  USERS_ONLINE: 'users:online',

  // Damage feed
  DAMAGE_FEED: 'boss:damagefeed',

  // Global stats
  GLOBAL_STATS: 'stats:global',
} as const;
