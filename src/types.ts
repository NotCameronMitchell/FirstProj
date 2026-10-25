export type ClassId =
  | 'knight'
  | 'ranger'
  | 'sorcerer'
  | 'priest'
  | 'paladin'
  | 'necromancer'
  | 'rogue'
  | 'artificer';

export type Row = 'front' | 'back';
export type Side = 'hero' | 'enemy';
export type AttackKind = 'melee' | 'arrow' | 'bolt' | 'fire' | 'holy' | 'shadow' | 'claw';

export type StatusKind =
  | 'burn' // damage over time, stacks power
  | 'bleed' // damage over time, stacks power
  | 'stun' // cannot act
  | 'taunt' // forces enemies to target this unit
  | 'haste' // power = % faster attacks
  | 'empower' // power = % more damage dealt
  | 'weaken' // power = % less damage dealt
  | 'mark' // power = % more damage taken
  | 'regen'; // power = heal per second

export interface Status {
  kind: StatusKind;
  dur: number;
  power: number;
  src?: number; // uid of the unit that applied it
}

/** Additive modifiers applied when a unit is built (gear, upgrades, relics). */
export interface StatMods {
  hpPct?: number;
  atkPct?: number;
  armor?: number;
  speedPct?: number;
  crit?: number;
  critMult?: number;
  dodge?: number;
  lifesteal?: number;
  healPct?: number;
  energyPct?: number;
}

export type GearSlot = 'weapon' | 'armor' | 'trinket';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface Gear {
  name: string;
  slot: GearSlot;
  rarity: Rarity;
  mods: StatMods;
  effect?: string; // id into GEAR_EFFECTS
  lore: string;
}

export interface HeroState {
  cls: ClassId;
  row: Row;
  level: number;
  gear: Partial<Record<GearSlot, Gear>>;
}

export type Reward =
  | { kind: 'level'; hero: number }
  | { kind: 'relic'; id: string }
  | { kind: 'gear'; hero: number; gear: Gear }
  | { kind: 'bargain'; id: string };

export interface RunState {
  version: number;
  seed: number;
  rngState: number;
  wave: number; // the next wave to fight (1-based)
  heroes: HeroState[];
  relics: string[];
  bargains: string[];
  rerolls: number;
  flaskCharges: number;
  kills: number;
  bossesSlain: number;
  startedAt: number;
  /** Reward choices waiting to be made, so a run can resume on the reward screen. */
  pending?: { title: string; options: Reward[]; bargain?: boolean };
}

export interface MetaState {
  version: number;
  embers: number;
  upgrades: Record<string, number>;
  runs: number;
  bestWave: number;
  seenLore: string[];
}

export interface LeaderboardEntry {
  wave: number;
  party: ClassId[];
  kills: number;
  date: number;
  embers: number;
}
