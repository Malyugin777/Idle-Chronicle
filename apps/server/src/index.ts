import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import { prisma } from './shared/prisma/client.js';
import { redis, KEYS } from './shared/redis/client.js';

const fastify = Fastify({
  logger: true,
});

// CORS
await fastify.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

// Socket.IO
const io = new Server(fastify.server, {
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: Date.now() };
});

// Socket.IO connection handler
io.on('connection', async (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Track online users
  await redis.sadd(KEYS.USERS_ONLINE, socket.id);

  socket.on('disconnect', async () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    await redis.srem(KEYS.USERS_ONLINE, socket.id);
  });

  // Placeholder handlers
  socket.on('tap:batch', (data) => {
    console.log('[Socket] tap:batch', data);
    // TODO: Implement damage calculation
  });

  socket.on('upgrade:stat', (data) => {
    console.log('[Socket] upgrade:stat', data);
    // TODO: Implement stat upgrade
  });

  socket.on('soulshot:toggle', (data) => {
    console.log('[Socket] soulshot:toggle', data);
    // TODO: Implement soulshot toggle
  });
});

// Boss HP broadcast interval
setInterval(async () => {
  const hp = await redis.get(KEYS.BOSS_HP);
  const online = await redis.scard(KEYS.USERS_ONLINE);

  if (hp) {
    io.emit('boss:state', {
      hp,
      playersOnline: online,
    });
  }
}, 100); // 100ms = 10 updates per second

// Start server
const start = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('[Prisma] Connected to database');

    // Test Redis connection
    await redis.ping();
    console.log('[Redis] Connection verified');

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
  redis.disconnect();
  process.exit(0);
});
