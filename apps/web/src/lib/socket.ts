import { io, Socket } from 'socket.io-client';
import { getTaskManager } from './taskManager';

let socket: Socket | null = null;

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

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
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
    });

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
    socket.disconnect();
    socket = null;
  }
}
