// ═══════════════════════════════════════════════════════════
// PLAYER STORE - Global state for player resources (v1.8.19)
// Uses Zustand for cross-tab synchronization
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';

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

export const usePlayerStore = create<PlayerStore>((set) => ({
  resources: initialResources,
  isLoaded: false,

  // Partial update (for player:state events with subset of fields)
  setResources: (partial) => set((state) => ({
    resources: { ...state.resources, ...partial },
    isLoaded: true,
  })),

  // Full state update (for player:get response)
  setFullState: (data) => set({
    resources: data,
    isLoaded: true,
  }),

  // Reset on disconnect
  reset: () => set({
    resources: initialResources,
    isLoaded: false,
  }),
}));

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
