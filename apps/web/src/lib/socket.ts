import { io, Socket } from 'socket.io-client';
import { getTaskManager } from './taskManager';
import { useDebugStore, IS_DEBUG_ENABLED } from '@/stores/debugStore';

let socket: Socket | null = null;

// Wrap socket.emit to log outgoing events
function createLoggingEmit(originalEmit: Socket['emit']): Socket['emit'] {
  return function(this: Socket, event: string, ...args: any[]) {
    if (IS_DEBUG_ENABLED) {
      useDebugStore.getState().logEvent('out', event, args[0]);
    }
    return originalEmit.apply(this, [event, ...args]);
  } as Socket['emit'];
}

// Events to log (skip noisy ones)
const LOGGED_EVENTS = [
  'auth:success', 'auth:error',
  'player:data', 'player:state', 'player:keys',
  'shop:success', 'shop:error',
  'chest:data', 'chest:opened', 'chest:claimed', 'chest:boosted', 'chest:error',
  'slot:unlocked', 'slot:error',
  'equipment:data', 'equipment:equip', 'equipment:unequip',
  'boss:state', 'boss:killed', 'boss:respawn',
  'tap:result', 'skill:result',
  'tasks:data', 'tasks:completed', 'tasks:claimed',
  'level:up', 'rewards:data', 'rewards:claimed',
  'buff:success', 'ether:craft:success',
  'enchant:success', 'enchant:fail', 'enchant:break',
  'leaderboard:data', 'leaderboard:session',
];

export function getSocket(): Socket {
  if (!socket) {
    // Connect to same origin (server.js handles both Next.js and Socket.io)
    socket = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Wrap emit for logging
    if (IS_DEBUG_ENABLED) {
      socket.emit = createLoggingEmit(socket.emit.bind(socket));
    }

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
      if (IS_DEBUG_ENABLED) {
        useDebugStore.getState().setConnected(true, socket?.id);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      if (IS_DEBUG_ENABLED) {
        useDebugStore.getState().setConnected(false);
      }
      // Auto reconnect if server disconnected
      if (reason === 'io server disconnect') {
        socket?.connect();
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socket.on('reconnect', (attempt) => {
      console.log('[Socket] Reconnected after', attempt, 'attempts');
      if (IS_DEBUG_ENABLED) {
        useDebugStore.getState().setConnected(true, socket?.id);
      }
    });

    // Log incoming events
    if (IS_DEBUG_ENABLED) {
      for (const event of LOGGED_EVENTS) {
        socket.on(event, (data: any) => {
          useDebugStore.getState().logEvent('in', event, data);
        });
      }

      // Track userId from auth
      socket.on('auth:success', (data: any) => {
        useDebugStore.getState().setUserId(data?.odamage || data?.odamageid || null);
      });
    }

    // Global task tracking: record chest opens for daily tasks
    // Works regardless of which tab is active (key-open or timer-open)
    socket.on('chest:claimed', () => {
      getTaskManager().recordChestOpened();
    });
  }

  // Ensure socket is connected
  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    if (IS_DEBUG_ENABLED) {
      useDebugStore.getState().setConnected(false);
    }
    socket.disconnect();
    socket = null;
  }
}

// Force resync - request fresh player data from server
export function forceResync() {
  const s = getSocket();
  s.emit('player:get');
  s.emit('equipment:get');
  s.emit('chest:get');
  s.emit('tasks:get');
  console.log('[Socket] Force resync requested');
}

// Get listener counts for debugging
export function getListenerCounts(): Record<string, number> {
  if (!socket) return {};
  const counts: Record<string, number> = {};
  for (const event of LOGGED_EVENTS) {
    counts[event] = socket.listeners(event).length;
  }
  return counts;
}
