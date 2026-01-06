import type { BuffType, SoulshotGrade, StatType } from '../constants/game';

// ═══════════════════════════════════════════════════════════
// CLIENT → SERVER EVENTS
// ═══════════════════════════════════════════════════════════

export interface C2S_TapBatch {
  event: 'tap:batch';
  data: {
    taps: number;
    timestamp: number;
  };
}

export interface C2S_UpgradeStat {
  event: 'upgrade:stat';
  data: {
    stat: StatType;
    levels: number;
  };
}

export interface C2S_UpgradeWeapon {
  event: 'upgrade:weapon';
  data: {
    toWeaponCode: string;
  };
}

export interface C2S_ToggleSoulshot {
  event: 'soulshot:toggle';
  data: {
    grade: SoulshotGrade | null;
  };
}

export interface C2S_UseBuff {
  event: 'buff:use';
  data: {
    buffType: BuffType;
  };
}

export interface C2S_UseSkill {
  event: 'skill:use';
  data: {
    skillCode: 'power_strike' | 'haste';
  };
}

export type ClientToServerEvent =
  | C2S_TapBatch
  | C2S_UpgradeStat
  | C2S_UpgradeWeapon
  | C2S_ToggleSoulshot
  | C2S_UseBuff
  | C2S_UseSkill;

// ═══════════════════════════════════════════════════════════
// SERVER → CLIENT EVENTS
// ═══════════════════════════════════════════════════════════

export interface DamageHit {
  odamage: string;
  username: string;
  dmg: number;
  crit: boolean;
  ts: number;
}

export interface UserState {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  level: number;
  exp: string;
  // Legacy stats
  str: number;
  dex: number;
  luck: number;
  pAtk: number;
  critChance: number;
  critDamage: number;
  attackSpeed: number;
  // L2 Core Attributes (NEW)
  power: number;
  agility: number;
  vitality: number;
  intellect: number;
  spirit: number;
  // L2 Derived Stats (NEW)
  physicalPower: number;
  maxHealth: number;
  physicalDefense: number;
  // L2 Stamina System (NEW)
  stamina: number;
  maxStamina: number;
  exhaustedUntil: number | null;  // timestamp when exhaustion ends
  // Legacy energy (kept for backward compatibility)
  energy: number;
  maxEnergy: number;
  energyRegen: number;
  // Mana (for future skills)
  mana: number;
  maxMana: number;
  manaRegen: number;
  // Currencies
  gold: string;
  ancientCoin: number;
  soulshotNG: number;
  soulshotD: number;
  soulshotC: number;
  activeSoulshot: SoulshotGrade | null;
  weaponCode: string | null;
  weaponEnchant: number;
  totalDamage: string;
  totalClicks: string;
  bossesKilled: number;
}

export interface BossState {
  id: string;
  code: string;
  name: string;
  title: string | null;
  hp: string;
  maxHp: string;
  hpPercent: number;
  defense: number;
  thornsDamage: number;  // L2: обратка босса (тратит stamina игрока)
  ragePhase: number;
}

export interface GameConfig {
  tickIntervalMs: number;
  batchIntervalMs: number;
  maxTapsPerBatch: number;
}

export interface S2C_AuthSuccess {
  event: 'auth:success';
  data: {
    user: UserState;
    boss: BossState;
    config: GameConfig;
  };
}

export interface S2C_BossState {
  event: 'boss:state';
  data: {
    hp: string;
    maxHp: string;
    hpPercent: number;
    ragePhase: number;
    playersOnline: number;
    serverDps: string;
    damageFeed: DamageHit[];
  };
}

export interface S2C_TapResult {
  event: 'tap:result';
  data: {
    accepted: number;
    rejected: number;
    totalDamage: string;
    crits: number;
    goldEarned: string;
    soulshotsUsed: number;
    newEnergy: number;
    newBossHp: string;
    // L2 Stamina (NEW)
    stamina: number;
    maxStamina: number;
    thornsTaken: number;
    staminaCost: number;
  };
}

// L2: Hero exhausted event (NEW)
export interface S2C_HeroExhausted {
  event: 'hero:exhausted';
  data: {
    until: number;      // timestamp when exhaustion ends
    duration: number;   // duration in ms
  };
}

// L2: Combat tick event (NEW) - for auto-attack results
export interface S2C_CombatTick {
  event: 'combat:tick';
  data: {
    damage: number;
    stamina: number;
    maxStamina: number;
    thornsTaken: number;
    sessionDamage: number;
  };
}

export interface Reward {
  itemCode: string;
  itemName: string;
  quantity: number;
  rarity: string;
}

export interface S2C_BossKilled {
  event: 'boss:killed';
  data: {
    finalBlow: {
      odamage: string;
      username: string;
    };
    yourContribution: {
      damage: string;
      percent: number;
      rank: number;
    };
    rewards: Reward[];
    totalParticipants: number;
    nextBoss: {
      code: string;
      name: string;
      hp: string;
      spawnIn: number;
    };
  };
}

export interface S2C_RagePhase {
  event: 'boss:rage';
  data: {
    phase: number;
    rewardMultiplier: number;
    message: string;
  };
}

export interface S2C_UserUpdate {
  event: 'user:update';
  data: Partial<UserState>;
}

export interface S2C_Error {
  event: 'error';
  data: {
    code: string;
    message: string;
  };
}

export type ServerToClientEvent =
  | S2C_AuthSuccess
  | S2C_BossState
  | S2C_TapResult
  | S2C_BossKilled
  | S2C_RagePhase
  | S2C_UserUpdate
  | S2C_Error
  | S2C_HeroExhausted   // L2 (NEW)
  | S2C_CombatTick;     // L2 (NEW)
