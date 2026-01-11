// ═══════════════════════════════════════════════════════════
// PLAYER STORE - Global state for player resources (v1.8.21)
// Uses Zustand with persist for cross-tab synchronization
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Resources that are synced from server via player:state event
export interface PlayerResources {
  // Currency
  gold: number;
  crystals: number; // ancientCoin on server
  lotteryTickets: number;

  // Crafting
  ether: number;
  etherDust: number;
  enchantCharges: number;
  protectionCharges: number;

  // Potions
  potionHaste: number;
  potionAcumen: number;
  potionLuck: number;

  // Keys
  keyWooden: number;
  keyBronze: number;
  keySilver: number;
  keyGold: number;

  // Combat stats (updated frequently)
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  exhaustedUntil: number | null;

  // Character
  level: number;
  exp: number;
  sp: number;

  // Participation
  ps: number;
  psCap: number;
}

interface PlayerStore {
  // State
  resources: PlayerResources;
  isLoaded: boolean;
  lastSync: number; // Timestamp of last server sync

  // Actions
  setResources: (partial: Partial<PlayerResources>) => void;
  setFullState: (data: PlayerResources) => void;
  reset: () => void;
}

const initialResources: PlayerResources = {
  gold: 0,
  crystals: 0,
  lotteryTickets: 0,
  ether: 0,
  etherDust: 0,
  enchantCharges: 0,
  protectionCharges: 0,
  potionHaste: 0,
  potionAcumen: 0,
  potionLuck: 0,
  keyWooden: 0,
  keyBronze: 0,
  keySilver: 0,
  keyGold: 0,
  stamina: 0,
  maxStamina: 100,
  mana: 0,
  maxMana: 100,
  exhaustedUntil: null,
  level: 1,
  exp: 0,
  sp: 0,
  ps: 0,
  psCap: 24,
};

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      resources: initialResources,
      isLoaded: false,
      lastSync: 0,

      // Partial update (for player:state events with subset of fields)
      setResources: (partial) => set((state) => ({
        resources: { ...state.resources, ...partial },
        isLoaded: true,
        lastSync: Date.now(),
      })),

      // Full state update (for player:get response)
      setFullState: (data) => set({
        resources: data,
        isLoaded: true,
        lastSync: Date.now(),
      }),

      // Reset on disconnect
      reset: () => set({
        resources: initialResources,
        isLoaded: false,
        lastSync: 0,
      }),
    }),
    {
      name: 'idle-chronicle-player', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist stable resources, not combat stats that change rapidly
      partialize: (state) => ({
        resources: {
          // Currencies (stable)
          gold: state.resources.gold,
          crystals: state.resources.crystals,
          lotteryTickets: state.resources.lotteryTickets,
          // Crafting (stable)
          ether: state.resources.ether,
          etherDust: state.resources.etherDust,
          enchantCharges: state.resources.enchantCharges,
          protectionCharges: state.resources.protectionCharges,
          // Potions (stable)
          potionHaste: state.resources.potionHaste,
          potionAcumen: state.resources.potionAcumen,
          potionLuck: state.resources.potionLuck,
          // Keys (stable)
          keyWooden: state.resources.keyWooden,
          keyBronze: state.resources.keyBronze,
          keySilver: state.resources.keySilver,
          keyGold: state.resources.keyGold,
          // Character (stable)
          level: state.resources.level,
          exp: state.resources.exp,
          sp: state.resources.sp,
          // Combat stats - use defaults, will be overwritten by server
          stamina: initialResources.stamina,
          maxStamina: state.resources.maxStamina,
          mana: initialResources.mana,
          maxMana: state.resources.maxMana,
          exhaustedUntil: null,
          ps: initialResources.ps,
          psCap: state.resources.psCap,
        },
        lastSync: state.lastSync,
        // Don't persist isLoaded - always start as false
      }),
      // Merge persisted state with initial state
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<PlayerStore>;
        return {
          ...current,
          resources: {
            ...current.resources,
            ...(persistedState.resources || {}),
          },
          lastSync: persistedState.lastSync || 0,
          // isLoaded stays false until server confirms
          isLoaded: false,
        };
      },
    }
  )
);

// Selector hooks for specific resource groups
export const useGold = () => usePlayerStore((state) => state.resources.gold);
export const useCrystals = () => usePlayerStore((state) => state.resources.crystals);
export const useEther = () => usePlayerStore((state) => state.resources.ether);
export const useKeys = () => usePlayerStore((state) => ({
  wooden: state.resources.keyWooden,
  bronze: state.resources.keyBronze,
  silver: state.resources.keySilver,
  gold: state.resources.keyGold,
}));
export const usePotions = () => usePlayerStore((state) => ({
  haste: state.resources.potionHaste,
  acumen: state.resources.potionAcumen,
  luck: state.resources.potionLuck,
}));
export const useCombatStats = () => usePlayerStore((state) => ({
  stamina: state.resources.stamina,
  maxStamina: state.resources.maxStamina,
  mana: state.resources.mana,
  maxMana: state.resources.maxMana,
  exhaustedUntil: state.resources.exhaustedUntil,
}));

// Check if cached data is stale (older than 5 minutes)
export const useIsCacheStale = () => usePlayerStore((state) => {
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - state.lastSync > fiveMinutes;
});
