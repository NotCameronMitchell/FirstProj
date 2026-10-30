export type HeroId = 'mason' | 'james' | 'cole' | 'cam';
export type Side = 'hero' | 'enemy';

export type StatusKind =
  | 'poison' // damage over time, stacks power
  | 'bleed' // damage over time, stacks power
  | 'burn' // damage over time, stacks power
  | 'meeting' // damage over time from the Middle Manager's meeting invite
  | 'regen' // power = heal per turn
  | 'empower' // power = fraction more damage dealt, stacks
  | 'weaken' // power = fraction less damage dealt, stacks
  | 'guard' // power = fraction less damage taken, stacks
  | 'dodge' // power = extra dodge chance, stacks
  | 'crit' // power = extra crit chance, stacks
  | 'protect' // takes no damage
  | 'reflect' // power = fraction of blocked damage sent back
  | 'stun' // skips its turns
  | 'confuse' // may hit itself or its allies; power = bonus damage
  | 'silence' // only basic attacks
  | 'taunt' // must attack `src`
  | 'away' // removed from the fight for a while
  | 'resolve' // bosses briefly resist stuns after one wears off
  // Tags from random events, shown for the whole fight (their stats are applied when the fight is built).
  | 'renekton'
  | 'tilted'
  | 'raffle'
  | 'party';

export interface Status {
  kind: StatusKind;
  dur: number;
  power: number;
  src?: number; // uid of the unit that applied it
}

export interface StatusInfo {
  label: string;
  short: string;
  color: string;
  good: boolean;
  hidden?: boolean;
  /** What it does, for tooltips. */
  desc: string;
}

export const STATUS_INFO: Record<StatusKind, StatusInfo> = {
  poison: { label: 'Poison', short: 'PSN', color: '#7cff4f', good: false, desc: 'Takes damage at the start of each turn. Stacks.' },
  bleed: { label: 'Bleed', short: 'BLD', color: '#ff4f6d', good: false, desc: 'Takes damage at the start of each turn. Stacks.' },
  burn: { label: 'Burn', short: 'BRN', color: '#ff9a1f', good: false, desc: 'Takes damage at the start of each turn. Stacks.' },
  meeting: { label: 'In a Meeting', short: 'MTG', color: '#b48cff', good: false, desc: 'Stuck in a meeting that could have been an email: takes damage every turn.' },
  regen: { label: 'Regen', short: 'RGN', color: '#5effc8', good: true, desc: 'Heals at the start of each turn.' },
  empower: { label: 'Damage Up', short: 'DMG+', color: '#ffd23f', good: true, desc: 'Deals more damage.' },
  weaken: { label: 'Damage Down', short: 'DMG-', color: '#c08aff', good: false, desc: 'Deals less damage.' },
  guard: { label: 'Guard', short: 'GRD', color: '#6fd3ff', good: true, desc: 'Takes less damage.' },
  dodge: { label: 'Dodge Up', short: 'DDG', color: '#a0f0ff', good: true, desc: 'More likely to dodge attacks.' },
  crit: { label: 'Crit Up', short: 'CRT', color: '#ffe37a', good: true, desc: 'More likely to land critical hits.' },
  protect: { label: 'Immune', short: 'IMM', color: '#ffffff', good: true, desc: 'Takes no damage.' },
  reflect: { label: 'Reflect', short: 'RFL', color: '#ff7ae0', good: true, desc: 'Sends part of blocked damage back at the attacker.' },
  stun: { label: 'Stunned', short: 'STUN', color: '#fff04f', good: false, desc: 'Skips its turn.' },
  confuse: { label: 'Confused', short: 'CONF', color: '#ff7ae0', good: false, desc: 'May attack itself or its allies instead.' },
  silence: { label: 'Silenced', short: 'SIL', color: '#9aa0b8', good: false, desc: 'Can only use basic attacks.' },
  taunt: { label: 'Taunted', short: 'TNT', color: '#ff5a3a', good: false, desc: 'Must attack the hero who taunted it.' },
  away: { label: 'Away', short: 'AWAY', color: '#9aa0b8', good: false, desc: "Pulled out of the fight. Can't act or be targeted." },
  resolve: { label: 'Resolve', short: 'RES', color: '#ffffff', good: true, hidden: true, desc: "Just shook off a stun; can't be stunned this turn." },
  renekton: { label: 'Renekton Buff', short: 'RNK', color: '#5aff7a', good: true, desc: '+5 attack for this fight.' },
  tilted: { label: 'Tilted', short: 'TILT', color: '#ff6a6a', good: false, desc: '-5% max health and -5 attack for this fight.' },
  raffle: { label: 'Raffle Winner', short: 'RAF', color: '#ffd23f', good: true, desc: '+20 attack for this fight.' },
  party: { label: 'Party Favor', short: 'PRTY', color: '#ffffff', good: true, desc: '+15 attack for this fight.' },
};

export type StatKey = 'hp' | 'atk' | 'crit' | 'dodge' | 'def';

export interface HeroState {
  id: HeroId;
  hp: number;
  hpMult: number;
  atkMult: number;
  crit: number;
  dodge: number;
  def: number;
  ranks: Record<string, number>;
  weapon: string;
  weapons: string[];
  /** Flat attack added for the rest of the run (events). */
  atkFlat?: number;
}

/** A change that lasts for the next fight only (from a random event). */
export interface FightMod {
  hero: HeroId | 'all';
  atk?: number; // flat attack
  hpPct?: number; // max HP change, e.g. -0.05
  shieldPct?: number; // starting shield as a fraction of max HP
  tag?: 'renekton' | 'tilted' | 'raffle' | 'party';
}

export type Upgrade =
  | { kind: 'rank'; hero: HeroId; ability: string }
  | { kind: 'stat'; hero: HeroId | 'all'; stat: StatKey; amount: number; name: string };

export interface ShopItem {
  kind: 'heal' | 'stat' | 'rank' | 'weapon';
  name: string;
  desc: string;
  cost: number;
  hero?: HeroId;
  stat?: StatKey;
  amount?: number;
  ability?: string;
  weapon?: string;
  sold?: boolean;
}

export type Pending =
  | { kind: 'draft'; step: number; options: Upgrade[]; total?: number }
  | { kind: 'shop'; items: ShopItem[] }
  | { kind: 'event'; id: string; choice?: number };

export interface RunState {
  version: number;
  seed: number;
  rngState: number;
  stage: number; // the next fight to play, counted from 0 across cycles
  heroes: HeroState[];
  pto: number;
  kills: number;
  fightsWon: number;
  sauceEarned: number;
  secondWind: boolean;
  startedAt: number;
  /** Outfit id per hero, chosen on the Suit Up screen. */
  outfits?: Partial<Record<HeroId, string>>;
  pending?: Pending;
  /** Modifiers for the next fight. */
  nextFight?: FightMod[];
  /** Hung up on Renekton: the rival boss is stronger the next time it's fought. */
  rivalEmpowered?: boolean;
  /** Events already seen, as "<cycle>:<event id>". */
  eventsSeen?: string[];
}

export interface MetaState {
  version: number;
  sauce: number;
  totalSauce: number;
  upgrades: Record<string, number>;
  runs: number;
  bestStage: number;
  /** Last outfit picked for each hero. */
  outfits: Partial<Record<HeroId, string>>;
  /** Outfits bought with Village Sauce. */
  ownedOutfits: string[];
  /** The last party picked on the Suit Up screen. */
  party: HeroId[];
  /** Unlocked achievement ids. */
  achievements: string[];
  /** All-time counters that achievements read. */
  stats: Record<string, number>;
}

export interface LeaderboardEntry {
  stage: number;
  fights: number;
  kills: number;
  sauce: number;
  date: number;
}
