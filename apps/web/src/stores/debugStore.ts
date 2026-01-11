// ═══════════════════════════════════════════════════════════
// DEBUG STORE - Event logging and diagnostics (DEV ONLY)
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';

export interface SocketEvent {
  id: number;
  timestamp: number;
  direction: 'in' | 'out';
  event: string;
  payload: string; // JSON stringified, truncated
}

interface DebugStore {
  // Connection state
  isConnected: boolean;
  socketId: string | null;
  userId: string | null;

  // Event log (last 20 events)
  events: SocketEvent[];
  eventCounter: number;

  // Listener tracking
  listenerCounts: Record<string, number>;

  // Actions
  setConnected: (connected: boolean, socketId?: string | null) => void;
  setUserId: (userId: string | null) => void;
  logEvent: (direction: 'in' | 'out', event: string, payload?: any) => void;
  updateListenerCount: (event: string, count: number) => void;
  clearEvents: () => void;
}

const MAX_EVENTS = 20;
const MAX_PAYLOAD_LENGTH = 100;

function truncatePayload(payload: any): string {
  if (payload === undefined) return '';
  try {
    const str = JSON.stringify(payload);
    if (str.length > MAX_PAYLOAD_LENGTH) {
      return str.substring(0, MAX_PAYLOAD_LENGTH) + '...';
    }
    return str;
  } catch {
    return '[unserializable]';
  }
}

export const useDebugStore = create<DebugStore>((set) => ({
  isConnected: false,
  socketId: null,
  userId: null,
  events: [],
  eventCounter: 0,
  listenerCounts: {},

  setConnected: (connected, socketId = null) => set({
    isConnected: connected,
    socketId: connected ? socketId : null,
  }),

  setUserId: (userId) => set({ userId }),

  logEvent: (direction, event, payload) => set((state) => {
    // Skip noisy events
    if (event === 'ping' || event === 'pong') return state;

    const newEvent: SocketEvent = {
      id: state.eventCounter + 1,
      timestamp: Date.now(),
      direction,
      event,
      payload: truncatePayload(payload),
    };

    const events = [newEvent, ...state.events].slice(0, MAX_EVENTS);

    return {
      events,
      eventCounter: state.eventCounter + 1,
    };
  }),

  updateListenerCount: (event, count) => set((state) => ({
    listenerCounts: {
      ...state.listenerCounts,
      [event]: count,
    },
  })),

  clearEvents: () => set({ events: [], eventCounter: 0 }),
}));

// Only enable in development
export const IS_DEBUG_ENABLED = process.env.NODE_ENV === 'development';
