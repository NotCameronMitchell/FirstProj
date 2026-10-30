import type { Battle, Style, Unit } from '../combat/battle';
import type { HeroId } from '../types';

export type Target = 'enemy' | 'enemies' | 'self' | 'ally' | 'allies' | 'none';

export interface HeroDef {
  id: HeroId;
  name: string;
  role: string;
  blurb: string;
  row: 'front' | 'back';
  sprite: string;
  color: string;
  hp: number;
  atk: number;
  def: number;
  crit: number;
  dodge: number;
  quotes: string[];
  abilities: string[];
  ultimate: string;
  passive: string;
  weapons: string[];
}

export interface AbilityDef {
  id: string;
  hero: HeroId;
  name: string;
  kind: 'ability' | 'ultimate' | 'passive';
  /** Turns until it can be used again. */
  cd: number | ((rank: number) => number);
  /** Cooldown at the start of a fight (it ticks once before turn 1). */
  first?: number;
  target: Target;
  /** Quick buffs don't use up the hero's turn, but only one can be used per turn. */
  quick?: boolean;
  desc: (rank: number) => string;
  use?: (b: Battle, u: Unit, t: Unit | undefined, rank: number) => void;
}

export interface WeaponDef {
  id: string;
  hero: HeroId;
  name: string;
  desc: string;
  cost: number;
  target: 'enemy' | 'enemies';
  def?: number;
  parry?: number;
  dmgBonus?: number;
  attack: (b: Battle, u: Unit, t: Unit | undefined) => void;
}

export const MAX_RANK = 5;
/** Playable heroes, in roster order. Add a new hero here (and to HeroId, HEROES, its abilities and weapons). */
export const HERO_IDS: HeroId[] = ['cole', 'cam', 'james', 'mason'];
/** Heroes in a party. */
export const PARTY_SIZE = 4;
/** Slots on the roster screen; any beyond HERO_IDS show as "Coming soon". */
export const ROSTER_SLOTS = 8;

export const HEROES: Record<HeroId, HeroDef> = {
  mason: {
    id: 'mason',
    name: 'Mason',
    role: 'Beastmaster',
    blurb: 'Commands his cats Bruno and Murphy, rages for AoE, and channels the power of marriage.',
    row: 'back',
    sprite: 'mason',
    color: '#ff4f6d',
    hp: 95,
    atk: 11,
    def: 0,
    crit: 0.08,
    dodge: 0.05,
    quotes: ['Wife BTW', "If it weren't for the brain fog I'd really have to experience this"],
    abilities: ['headbutt', 'lick', 'swipe', 'bite'],
    ultimate: 'wife_btw',
    passive: 'we_go_next',
    weapons: ['soccer_ball', 'trading_cards', 'potenuse'],
  },
  james: {
    id: 'james',
    name: 'James',
    role: 'Berserker',
    blurb: 'Gym bro tank. Armors up, self-heals, and hits one target very hard.',
    row: 'front',
    sprite: 'james',
    color: '#ffd23f',
    hp: 150,
    atk: 12,
    def: 0.12,
    crit: 0.05,
    dodge: 0,
    quotes: ['Type Shi Nah FR', 'Bih Ahh Boi'],
    abilities: ['peptide_rage', 'daily_dollar', 'fogo', 'throat_punch'],
    ultimate: 'jimmytrains',
    passive: 'uncrustable',
    weapons: ['golf_club', 'baseball_bat', 'offsets'],
  },
  cole: {
    id: 'cole',
    name: 'Cole',
    role: 'Melee DPS',
    blurb: 'Stacks up his next attack with burns, poisons and stuns, then swings.',
    row: 'front',
    sprite: 'cole',
    color: '#ff9a1f',
    hp: 110,
    atk: 14,
    def: 0.03,
    crit: 0.12,
    dodge: 0.1,
    quotes: ['RIP Dallas Mavericks', 'F*CK LANE KIFFIN'],
    abilities: ['cft', 'golf_lesson', 'argue_sales', 'ole_miss'],
    ultimate: 'transfer_uw',
    passive: 'nine_iron',
    weapons: ['putter', 'meme_barrage', 'murray_mobile'],
  },
  cam: {
    id: 'cam',
    name: 'Cam',
    role: 'Caster / Support',
    blurb: 'Corny jokes and random BS that confuse, stun and hurt every enemy at once.',
    row: 'back',
    sprite: 'cam',
    color: '#4fc3ff',
    hp: 90,
    atk: 11,
    def: 0,
    crit: 0.06,
    dodge: 0.05,
    quotes: ['Wagwan', 'SMH my head'],
    abilities: ['mind_goblin', 'iceland_story', 'would_you_rather', 'shopping_spree'],
    ultimate: 'nissan_titan',
    passive: 'aura_farming',
    weapons: ['ai_slop', 'new_fit', 'new_pc'],
  },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const atk = (n: number) => `${Math.round(n * 100)}% ATK`;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const roman = (r: number) => ROMAN[r] ?? String(r);

export function abilityCd(ab: AbilityDef, rank: number): number {
  return typeof ab.cd === 'function' ? ab.cd(rank) : ab.cd;
}

/** Picks `n` targets: the chosen one first, then random others. */
function spread(b: Battle, u: Unit, t: Unit | undefined, n: number): Unit[] {
  const foes = b.foesOf(u);
  const first = t && foes.includes(t) ? t : foes[0];
  if (!first) return [];
  const rest = b.rng.shuffle(foes.filter((f) => f !== first));
  return [first, ...rest].slice(0, n);
}

/** We Go Next's damage cap, as a share of each enemy's max HP. */
export function weGoNextCap(boss: boolean, rank: number): number {
  return (boss ? 0.25 : 0.45) + 0.05 * (rank - 1);
}

function maybeSay(b: Battle, u: Unit, chance = 0.35): void {
  if (b.rng.chance(chance)) b.say(u, b.rng.pick(HEROES[u.key as HeroId].quotes));
}

export const ABILITIES: Record<string, AbilityDef> = {
  // ---------------------------------------------------------------- Mason
  headbutt: {
    id: 'headbutt',
    hero: 'mason',
    name: 'Bruno: Headbutt',
    kind: 'ability',
    cd: 2,
    target: 'enemy',
    desc: (r) => `Bruno charges for ${atk(1.4 * (1 + 0.15 * (r - 1)))} damage${r >= 3 ? ` to ${r >= 5 ? 3 : 2} enemies` : ''}.`,
    use(b, u, t, r) {
      for (const e of spread(b, u, t, r >= 5 ? 3 : r >= 3 ? 2 : 1)) {
        b.anim(u, e, 'pet', { pet: 'bruno' });
        b.hit(u, e, 1.4 * (1 + 0.15 * (r - 1)));
      }
    },
  },
  lick: {
    id: 'lick',
    hero: 'mason',
    name: 'Bruno: Lick',
    kind: 'ability',
    cd: 2,
    target: 'enemy',
    desc: (r) => `Bruno licks ${r >= 5 ? 'every enemy' : r >= 3 ? '2 enemies' : 'one enemy'} for ${atk(0.5)} and poisons for ${atk(0.35 * (1 + 0.3 * (r - 1)))} a turn (3 turns).`,
    use(b, u, t, r) {
      const ts = r >= 5 ? b.foesOf(u) : spread(b, u, t, r >= 3 ? 2 : 1);
      for (const e of ts) {
        b.anim(u, e, 'pet', { pet: 'bruno' });
        if (b.hit(u, e, 0.5) > 0) b.dot(u, e, 'poison', 0.35 * (1 + 0.3 * (r - 1)), 3);
      }
    },
  },
  swipe: {
    id: 'swipe',
    hero: 'mason',
    name: 'Murphy: Swipe',
    kind: 'ability',
    cd: 3,
    target: 'enemies',
    desc: (r) => `Murphy swipes all enemies ${1 + Math.floor((r - 1) / 2)}x for ${atk(0.55 * (1 + 0.1 * (r - 1)))}, each adding Bleed (${atk(0.2)}/turn).`,
    use(b, u, _t, r) {
      const n = 1 + Math.floor((r - 1) / 2);
      for (let i = 0; i < n; i++) {
        b.anim(u, undefined, 'pet', { pet: 'murphy' });
        b.aoe('enemy', '255,79,109');
        for (const e of b.foesOf(u)) if (b.hit(u, e, 0.55 * (1 + 0.1 * (r - 1))) > 0) b.dot(u, e, 'bleed', 0.2, 3);
        if (i < n - 1) b.beat(0.25);
      }
    },
  },
  bite: {
    id: 'bite',
    hero: 'mason',
    name: 'Murphy: Bite',
    kind: 'ability',
    cd: 3,
    target: 'enemy',
    desc: (r) => `Murphy bites ${1 + Math.floor((r - 1) / 2)}x for ${atk(1.9 * (1 + 0.1 * (r - 1)))} each, inflicting Bleed (${atk(0.35)}/turn).`,
    use(b, u, t, r) {
      const n = 1 + Math.floor((r - 1) / 2);
      for (let i = 0; i < n; i++) {
        const e = t?.alive ? t : b.foesOf(u)[0];
        if (!e) return;
        b.anim(u, e, 'pet', { pet: 'murphy' });
        if (b.hit(u, e, 1.9 * (1 + 0.1 * (r - 1))) > 0) b.dot(u, e, 'bleed', 0.35, 3);
        if (i < n - 1) b.beat(0.25);
      }
    },
  },
  we_go_next: {
    id: 'we_go_next',
    hero: 'mason',
    name: 'We Go Next',
    kind: 'passive',
    cd: 0,
    target: 'none',
    desc: (r) =>
      `If every hero is below ${pct(0.15 + 0.02 * (r - 1))} HP, Mason blows himself up for ${pct(2 + 0.5 * (r - 1))} of the damage he has taken, to all enemies. Capped at ${pct(weGoNextCap(false, r))} of each enemy's max HP (${pct(weGoNextCap(true, r))} for bosses).`,
    use(b, u, _t, r) {
      u.passiveUsed = true;
      b.stats.weGoNext = true;
      const dmg = Math.max(1, Math.round(u.dmgTaken * (2 + 0.5 * (r - 1))));
      b.say(u, 'We go next.');
      b.emit({ t: 'banner', text: 'WE GO NEXT', sub: 'Mason' });
      b.beat(0.6);
      b.kill(u);
      b.shake(8);
      b.aoe('enemy', '255,154,31');
      for (const e of b.foesOf(u)) b.damage(e, Math.min(dmg, Math.max(1, Math.round(e.maxHp * weGoNextCap(e.boss, r)))), 'boom');
      b.beat(0.6);
    },
  },
  wife_btw: {
    id: 'wife_btw',
    hero: 'mason',
    name: 'Wife BTW',
    kind: 'ultimate',
    cd: 5,
    first: 4,
    target: 'self',
    desc: (r) => `Mason channels the power of being married: a shield worth ${pct(1 + 0.15 * (r - 1))} max HP and +${pct(0.2 + 0.1 * (r - 1))} damage for 3 turns.`,
    use(b, u, _t, r) {
      b.emit({ t: 'fx', kind: 'wife', uid: u.uid });
      b.beat(0.9);
      b.say(u, 'Wife BTW');
      b.anim(u, undefined, 'cast', { color: '#ff7ae0' });
      b.shieldUp(u, u.maxHp * (1 + 0.15 * (r - 1)));
      b.addStatus(u, 'empower', 4, 0.2 + 0.1 * (r - 1));
    },
  },

  // ---------------------------------------------------------------- James
  peptide_rage: {
    id: 'peptide_rage',
    hero: 'james',
    name: 'Peptide Rage',
    kind: 'ability',
    cd: (r) => (r >= 4 ? 2 : 3),
    target: 'self',
    quick: true,
    desc: (r) => `Quick. +${pct(0.1 + 0.03 * (r - 1))} damage and -${pct(0.15 + 0.03 * (r - 1))} damage taken for 2 turns. Stacks.${r >= 4 ? ' Cooldown 2.' : ''}`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#ff5a3a' });
      b.addStatus(u, 'empower', 3, 0.1 + 0.03 * (r - 1));
      b.addStatus(u, 'guard', 3, 0.15 + 0.03 * (r - 1));
      maybeSay(b, u, 0.25);
    },
  },
  daily_dollar: {
    id: 'daily_dollar',
    hero: 'james',
    name: 'Daily Dollar',
    kind: 'ability',
    cd: 2,
    target: 'enemy',
    desc: (r) =>
      `Blackjack on his phone (${pct(Math.min(0.75, 0.5 + 0.05 * (r - 1)))} to win). Win: deal ${pct(0.2 + 0.05 * (r - 1))} of his max HP. Lose: he loses ${pct(Math.max(0.01, 0.05 - 0.01 * (r - 1)))} max HP.`,
    use(b, u, t, r) {
      if (!t) return;
      const win = b.rng.chance(Math.min(0.75, 0.5 + 0.05 * (r - 1)));
      const dealer = b.rng.int(17, 20);
      if (win) {
        const me = b.rng.chance(0.3) ? 21 : b.rng.int(dealer + 1, 21);
        b.note(u, me === 21 ? 'BLACKJACK!' : `${me} vs ${dealer}: WIN`, '#ffd23f');
        if (me === 21) b.stats.blackjack = true;
        b.beat(0.35);
        b.anim(u, t, 'melee');
        b.hit(u, t, 0, { flat: u.maxHp * (0.2 + 0.05 * (r - 1)) });
        maybeSay(b, u, 0.3);
      } else {
        const bust = b.rng.chance(0.5);
        b.note(u, bust ? `${b.rng.int(22, 26)}: BUST` : `${b.rng.int(12, dealer - 1)} vs ${dealer}: LOSE`, '#9aa0b8');
        b.beat(0.35);
        b.damage(u, Math.max(1, Math.round(u.maxHp * Math.max(0.01, 0.05 - 0.01 * (r - 1)))), 'hit');
      }
    },
  },
  fogo: {
    id: 'fogo',
    hero: 'james',
    name: 'Dinner at Fogo',
    kind: 'ability',
    cd: 3,
    target: 'self',
    quick: true,
    desc: (r) => {
      const w = Math.max(0, 0.1 - 0.025 * (r - 1));
      return `Quick. Heals ${pct(0.2 + 0.05 * (r - 1))} max HP and blocks ${pct(0.3)} of damage for 2 turns${w > 0 ? `, but -${pct(w)} damage this turn (meat sweats)` : ''}.`;
    },
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#7cff4f' });
      b.heal(u, u.maxHp * (0.2 + 0.05 * (r - 1)));
      b.addStatus(u, 'guard', 3, 0.3);
      const w = Math.max(0, 0.1 - 0.025 * (r - 1));
      if (w > 0) b.addStatus(u, 'weaken', 1, w, undefined, true);
    },
  },
  throat_punch: {
    id: 'throat_punch',
    hero: 'james',
    name: 'Throat Punch',
    kind: 'ability',
    cd: 2,
    target: 'enemy',
    desc: (r) =>
      `${atk(1.8 * (1 + 0.15 * (r - 1)))} damage with a ${pct(Math.min(0.9, 0.5 + 0.1 * (r - 1)))} chance to stun for a turn.${r >= 4 ? ' Also Bleeds.' : ''}${r >= 5 ? ' And Burns.' : ''}`,
    use(b, u, t, r) {
      if (!t) return;
      b.anim(u, t, 'melee');
      if (b.hit(u, t, 1.8 * (1 + 0.15 * (r - 1))) > 0) {
        b.stun(t, 1, Math.min(0.9, 0.5 + 0.1 * (r - 1)));
        if (r >= 4) b.dot(u, t, 'bleed', 0.4, 3);
        if (r >= 5) b.dot(u, t, 'burn', 0.4, 3);
      }
    },
  },
  uncrustable: {
    id: 'uncrustable',
    hero: 'james',
    name: 'Uncrustable to the Esophagus',
    kind: 'passive',
    cd: 0,
    target: 'none',
    desc: (r) => `Every 3rd turn James devours an Uncrustable: heals ${pct(0.1 + 0.03 * (r - 1))} max HP and +${pct(0.05 + 0.03 * (r - 1))} damage for a turn.`,
    use(b, u, _t, r) {
      b.note(u, 'Uncrustable!', '#c08aff');
      b.heal(u, u.maxHp * (0.1 + 0.03 * (r - 1)));
      b.addStatus(u, 'empower', 1, 0.05 + 0.03 * (r - 1), undefined, true);
    },
  },
  jimmytrains: {
    id: 'jimmytrains',
    hero: 'james',
    name: 'JimmyTrains',
    kind: 'ultimate',
    cd: 5,
    first: 4,
    target: 'self',
    desc: (r) =>
      `Posts a new reel: taunts all enemies for 3 turns, takes no damage, and reflects ${pct(0.2 + 0.1 * (r - 1))} of what he would have taken.${r >= 3 ? ' Enemies deal 15% less damage.' : ''}`,
    use(b, u, _t, r) {
      b.say(u, 'New reel just dropped');
      b.anim(u, undefined, 'cast', { color: '#ffd23f' });
      // He bulks up for as long as the reel's effect lasts (see Battle.decrement).
      if (u.altSprite) {
        u.sprite = u.altSprite;
        b.emit({ t: 'sprite', uid: u.uid, sprite: u.sprite });
      }
      b.addStatus(u, 'protect', 4, 0);
      b.addStatus(u, 'reflect', 4, 0.2 + 0.1 * (r - 1), undefined, true);
      for (const e of b.foesOf(u)) {
        b.addStatus(e, 'taunt', 3, 0, u.uid, true);
        if (r >= 3) b.addStatus(e, 'weaken', 3, 0.15, undefined, true);
      }
      b.aoe('enemy', '255,90,58');
    },
  },

  // ---------------------------------------------------------------- Cole
  cft: {
    id: 'cft',
    hero: 'cole',
    name: 'CFT (Cole from Texas)',
    kind: 'ability',
    cd: 3,
    target: 'self',
    quick: true,
    desc: (r) => `Quick. +20% dodge for 3 turns (stacks). His next attack Burns for ${atk(0.4 * (1 + 0.25 * (r - 1)))} a turn.`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#ff9a1f' });
      b.addStatus(u, 'dodge', 4, 0.2);
      u.prep.burn = (u.prep.burn ?? 0) + u.atk * 0.4 * (1 + 0.25 * (r - 1)) * b.mult(u);
    },
  },
  golf_lesson: {
    id: 'golf_lesson',
    hero: 'cole',
    name: 'Golf Lesson',
    kind: 'ability',
    cd: 2,
    target: 'self',
    quick: true,
    desc: (r) => `Quick. His next attack deals +${pct(0.15 + 0.1 * (r - 1))} damage with a ${pct(0.3 + 0.05 * (r - 1))} chance to stun.`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#7cff4f' });
      u.prep.lesson = (u.prep.lesson ?? 0) + 0.15 + 0.1 * (r - 1);
      u.prep.stun = Math.max(u.prep.stun ?? 0, 0.3 + 0.05 * (r - 1));
      b.note(u, 'Lesson learned', '#7cff4f');
    },
  },
  argue_sales: {
    id: 'argue_sales',
    hero: 'cole',
    name: 'Argue with Sales',
    kind: 'ability',
    cd: 3,
    target: 'self',
    quick: true,
    desc: (r) =>
      `Quick. His next attack can't be dodged and poisons every enemy for ${atk(0.3 * (1 + 0.25 * (r - 1)))} a turn.${r >= 2 ? ` Also hits all enemies now for ${atk(0.3 * (r - 1))}.` : ''}`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#c08aff' });
      u.prep.argue = (u.prep.argue ?? 0) + u.atk * 0.3 * (1 + 0.25 * (r - 1)) * b.mult(u);
      if (r >= 2) {
        b.aoe('enemy', '192,138,255');
        for (const e of b.foesOf(u)) b.hit(u, e, 0.3 * (r - 1), { noDodge: true });
      }
      if (b.rng.chance(0.3)) b.say(u, 'F*CK LANE KIFFIN');
    },
  },
  ole_miss: {
    id: 'ole_miss',
    hero: 'cole',
    name: 'Ole Miss Win',
    kind: 'ability',
    cd: 4,
    target: 'self',
    quick: true,
    desc: (r) => `Quick. His team won: +${pct(0.2 + 0.05 * (r - 1))} damage for ${2 + Math.floor(r / 2)} turns.`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#ff4f6d' });
      b.addStatus(u, 'empower', 2 + Math.floor(r / 2), 0.2 + 0.05 * (r - 1));
      b.say(u, 'Hotty Toddy!');
    },
  },
  nine_iron: {
    id: 'nine_iron',
    hero: 'cole',
    name: '9 Iron on Ciabatta',
    kind: 'passive',
    cd: 0,
    target: 'none',
    desc: (r) => `Once per fight, if Cole dies he comes back next turn at full HP with a ${pct(0.1 + 0.1 * (r - 1))} max HP shield${r >= 2 ? ` and +${pct(0.1 * (r - 1))} damage` : ''}.`,
    use(b, u, _t, r) {
      b.note(u, '9 Iron on Ciabatta!', '#ffd23f');
      b.stats.coleRevived = true;
      b.shieldUp(u, u.maxHp * (0.1 + 0.1 * (r - 1)));
      if (r >= 2) b.addStatus(u, 'empower', 3, 0.1 * (r - 1), undefined, true);
    },
  },
  transfer_uw: {
    id: 'transfer_uw',
    hero: 'cole',
    name: 'Transfer to UW',
    kind: 'ultimate',
    cd: 6,
    first: 4,
    target: 'self',
    quick: true,
    desc: (r) =>
      `Quick. Cole evolves: regrows his hair, heals to full, gets a ${pct(1)} max HP shield and deals triple damage for ${r >= 3 ? 3 : 2} turns.${r >= 2 ? ` +${pct(0.1 * (r - 1))} dodge.` : ''}`,
    use(b, u, _t, r) {
      b.emit({ t: 'banner', text: 'TRANSFER TO UW', sub: 'Cole is evolving!' });
      b.shake(4);
      b.beat(0.6);
      u.sprite = u.altSprite ?? 'cole_uw';
      b.emit({ t: 'sprite', uid: u.uid, sprite: u.sprite });
      b.heal(u, u.maxHp);
      b.shieldUp(u, u.maxHp);
      b.addStatus(u, 'empower', r >= 3 ? 3 : 2, 2);
      if (r >= 2) b.addStatus(u, 'dodge', 4, 0.1 * (r - 1), undefined, true);
      b.say(u, "Hair's back, baby!");
    },
  },

  // ---------------------------------------------------------------- Cam
  mind_goblin: {
    id: 'mind_goblin',
    hero: 'cam',
    name: 'Mind Goblin',
    kind: 'ability',
    cd: 4,
    target: 'enemies',
    desc: (r) =>
      `Poisons every enemy for ${atk(0.25 * (1 + 0.3 * (r - 1)))} a turn (stacks). The next enemy to use an ability is stunned for ${r >= 3 ? 3 : 2} turns instead.`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#7cff4f' });
      b.aoe('enemy', '124,255,79');
      b.goblin = r >= 3 ? 3 : 2;
      for (const e of b.foesOf(u)) b.dot(u, e, 'poison', 0.25 * (1 + 0.3 * (r - 1)), 3);
    },
  },
  iceland_story: {
    id: 'iceland_story',
    hero: 'cam',
    name: 'Iceland Story',
    kind: 'ability',
    cd: 4,
    target: 'enemies',
    desc: (r) => `Stuns all enemies for a turn and deals ${atk(0.4 * (1 + 0.2 * (r - 1)))}.${r >= 3 ? ' -15% enemy damage for 2 turns.' : ''}${r >= 5 ? ' Burns them too.' : ''}`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#a0f0ff' });
      b.say(u, 'So there I was, in Iceland...');
      b.aoe('enemy', '160,240,255');
      for (const e of b.foesOf(u)) {
        b.hit(u, e, 0.4 * (1 + 0.2 * (r - 1)), { noDodge: true });
        b.stun(e, 1);
        if (r >= 3) b.addStatus(e, 'weaken', 2, 0.15, undefined, true);
        if (r >= 5) b.dot(u, e, 'burn', 0.3, 3);
      }
    },
  },
  would_you_rather: {
    id: 'would_you_rather',
    hero: 'cam',
    name: 'Would You Rather',
    kind: 'ability',
    cd: 3,
    target: 'enemies',
    desc: (r) => `Each enemy has a ${pct(Math.min(0.9, 0.5 + 0.08 * (r - 1)))} chance to be Confused and attack itself${r >= 2 ? ` for +${pct(0.15 * (r - 1))} damage` : ''}.`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#ff7ae0' });
      b.say(u, b.rng.pick(['Would you rather fight one horse-sized duck...', 'Would you rather have no elbows or no knees?']));
      for (const e of b.foesOf(u)) {
        if (b.rng.chance(Math.min(0.9, 0.5 + 0.08 * (r - 1)))) b.addStatus(e, 'confuse', 1, 0.15 * (r - 1), u.uid);
        else b.note(e, 'Unbothered', '#9aa0b8');
      }
    },
  },
  shopping_spree: {
    id: 'shopping_spree',
    hero: 'cam',
    name: 'Shopping Spree',
    kind: 'ability',
    cd: 4,
    target: 'allies',
    desc: (r) =>
      `Every ally gets 3 random buffs for 2 turns (+${pct(0.25 * (r - 1))} strength), with a ${pct(0.1 + 0.05 * (r - 1))} chance to block all damage for 2 turns.`,
    use(b, u, _t, r) {
      b.anim(u, undefined, 'cast', { color: '#ffd23f' });
      const s = 1 + 0.25 * (r - 1);
      const lucky = b.rng.chance(0.1 + 0.05 * (r - 1));
      for (const a of b.alliesOf(u)) {
        const picks = b.rng.shuffle(['empower', 'guard', 'dodge', 'crit', 'regen'] as const).slice(0, 3);
        for (const k of picks) {
          if (k === 'regen') b.addStatus(a, 'regen', 3, a.maxHp * 0.06 * s);
          else b.addStatus(a, k, 3, (k === 'crit' ? 0.2 : 0.15) * s);
        }
        if (lucky) b.addStatus(a, 'protect', 3, 0);
      }
      if (lucky) b.say(u, 'Everything was on sale');
    },
  },
  aura_farming: {
    id: 'aura_farming',
    hero: 'cam',
    name: 'Aura Farming',
    kind: 'passive',
    cd: 0,
    target: 'none',
    desc: (r) => `Every turn Cam takes, he gains +${pct(0.03 + 0.01 * (r - 1))} damage and effect strength until the fight ends.`,
  },
  nissan_titan: {
    id: 'nissan_titan',
    hero: 'cam',
    name: 'Nissan Titan',
    kind: 'ultimate',
    cd: 5,
    first: 4,
    target: 'enemies',
    desc: (r) => `A spectral Nissan Titan runs everyone over: ${atk(3 * (1 + 0.25 * (r - 1)))} to all enemies and stuns them for 2 turns.`,
    use(b, u, _t, r) {
      b.emit({ t: 'banner', text: 'NISSAN TITAN', sub: 'Beep beep' });
      b.anim(u, undefined, 'cast', { color: '#4fc3ff' });
      b.beat(0.4);
      b.emit({ t: 'fx', kind: 'truck', uid: u.uid });
      b.beat(0.45);
      b.shake(10);
      b.aoe('enemy', '79,195,255');
      let hits = 0;
      for (const e of b.foesOf(u)) {
        if (b.hit(u, e, 3 * (1 + 0.25 * (r - 1)), { noDodge: true }) > 0) hits++;
        b.stun(e, 2);
      }
      b.stats.titanHits = Math.max(b.stats.titanHits, hits);
    },
  },
};

function strike(b: Battle, u: Unit, t: Unit | undefined, mult: number, style: Style, extra: { noDodge?: boolean; color?: string } = {}): number {
  const e = t?.alive ? t : b.foesOf(u)[0];
  if (!e) return 0;
  b.anim(u, e, style, { color: extra.color });
  return b.hit(u, e, mult, { weapon: true, noDodge: extra.noDodge });
}

export const WEAPONS: Record<string, WeaponDef> = {
  // Mason
  soccer_ball: {
    id: 'soccer_ball',
    hero: 'mason',
    name: 'Soccer Ball',
    desc: `Kicks one enemy for ${atk(1.3)}. Scales with ATK.`,
    cost: 0,
    target: 'enemy',
    attack: (b, u, t) => void strike(b, u, t, 1.3, 'ranged', { color: '#ffffff' }),
  },
  trading_cards: {
    id: 'trading_cards',
    hero: 'mason',
    name: 'Pack of Trading Cards',
    desc: 'Rips a pack: deals 30% to 230% ATK depending on the pull. A holo rare (1 in 20) crits for double.',
    cost: 22,
    target: 'enemy',
    attack(b, u, t) {
      const roll = b.rng.int(1, 20);
      b.note(u, roll === 20 ? 'HOLO RARE!' : roll <= 3 ? 'All commons...' : `Pulled a ${roll}`, roll === 20 ? '#ffd23f' : '#ffffff');
      strike(b, u, t, (0.2 + roll * 0.1) * (roll === 20 ? 2 : 1), 'ranged', { color: '#ffd23f' });
    },
  },
  potenuse: {
    id: 'potenuse',
    hero: 'mason',
    name: 'High on Potenuse',
    desc: "Copies the last hit another hero landed, +1. (100% ATK if nobody's hit yet.)",
    cost: 20,
    target: 'enemy',
    attack(b, u, t) {
      const last = b.lastHeroHit && b.lastHeroHit.uid !== u.uid ? b.lastHeroHit.amount : 0;
      const e = t?.alive ? t : b.foesOf(u)[0];
      if (!e) return;
      b.anim(u, e, 'ranged', { color: '#c08aff' });
      if (last > 0) b.hit(u, e, 0, { flat: last + 1, pierce: true, weapon: true });
      else b.hit(u, e, 1, { weapon: true });
    },
  },
  // James
  golf_club: {
    id: 'golf_club',
    hero: 'james',
    name: 'Regripped Golf Club',
    desc: `Ribbed for her pleasure. ${atk(1.4)} to one enemy and can't be dodged.`,
    cost: 0,
    target: 'enemy',
    attack: (b, u, t) => void strike(b, u, t, 1.4, 'melee', { noDodge: true }),
  },
  baseball_bat: {
    id: 'baseball_bat',
    hero: 'james',
    name: 'College Baseball Bat',
    desc: `${atk(1.6)} to one enemy. While equipped James parries 20% of attacks.`,
    cost: 20,
    target: 'enemy',
    parry: 0.2,
    attack: (b, u, t) => void strike(b, u, t, 1.6, 'melee'),
  },
  offsets: {
    id: 'offsets',
    hero: 'james',
    name: 'Offsets',
    desc: `${atk(1.4)} to one enemy, taunting it for 2 turns and draining 20% mana (pushes its next ability back a turn).`,
    cost: 22,
    target: 'enemy',
    attack(b, u, t) {
      const e = t?.alive ? t : b.foesOf(u)[0];
      if (!e) return;
      if (strike(b, u, e, 1.4, 'melee') > 0) {
        b.addStatus(e, 'taunt', 2, 0, u.uid);
        for (const k of Object.keys(e.cd)) e.cd[k]++;
        b.note(e, '-20% mana', '#4fc3ff');
      }
    },
  },
  // Cole
  putter: {
    id: 'putter',
    hero: 'cole',
    name: 'New Putter',
    desc: `Hits one enemy 1-3 times for ${atk(0.7)} each.`,
    cost: 0,
    target: 'enemy',
    attack(b, u, t) {
      const n = b.rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        strike(b, u, t, 0.7, 'melee');
        if (i < n - 1) b.beat(0.18);
      }
    },
  },
  meme_barrage: {
    id: 'meme_barrage',
    hero: 'cole',
    name: 'Meme Barrage',
    desc: `Sends 5 memes at random enemies for ${atk(0.3)} each, each one adding Poison.`,
    cost: 20,
    target: 'enemies',
    attack(b, u) {
      for (let i = 0; i < 5; i++) {
        const foes = b.foesOf(u);
        if (!foes.length) return;
        const e = b.rng.pick(foes);
        b.anim(u, e, 'ranged', { color: '#7cff4f' });
        if (b.hit(u, e, 0.3, { weapon: true }) > 0) b.dot(u, e, 'poison', 0.15, 3);
        b.beat(0.12);
      }
    },
  },
  murray_mobile: {
    id: 'murray_mobile',
    hero: 'cole',
    name: 'The Murray Mobile',
    desc: `Runs one enemy over for ${atk(1.7)}. While equipped Cole takes 20% less damage.`,
    cost: 25,
    target: 'enemy',
    def: 0.2,
    attack: (b, u, t) => void strike(b, u, t, 1.7, 'melee'),
  },
  // Cam
  ai_slop: {
    id: 'ai_slop',
    hero: 'cam',
    name: 'AI Slop',
    desc: `${atk(0.45)} to every enemy and Poison (${atk(0.2)}/turn).`,
    cost: 0,
    target: 'enemies',
    attack(b, u) {
      b.anim(u, undefined, 'cast', { color: '#7cff4f' });
      b.aoe('enemy', '124,255,79');
      for (const e of b.foesOf(u)) if (b.hit(u, e, 0.45, { weapon: true }) > 0) b.dot(u, e, 'poison', 0.2, 3);
    },
  },
  new_fit: {
    id: 'new_fit',
    hero: 'cam',
    name: 'New Fit',
    desc: `${atk(0.7)} to one enemy with a 40% chance to stun it, and Burn (${atk(0.3)}/turn).`,
    cost: 20,
    target: 'enemy',
    attack(b, u, t) {
      const e = t?.alive ? t : b.foesOf(u)[0];
      if (!e) return;
      if (strike(b, u, e, 0.7, 'ranged', { color: '#ff9a1f' }) > 0) {
        b.stun(e, 1, 0.4);
        b.dot(u, e, 'burn', 0.3, 3);
      }
    },
  },
  new_pc: {
    id: 'new_pc',
    hero: 'cam',
    name: 'New PC',
    desc: `${atk(1.1)} to one enemy. While equipped, all of Cam's damage and effects are 25% stronger.`,
    cost: 25,
    target: 'enemy',
    dmgBonus: 0.25,
    attack: (b, u, t) => void strike(b, u, t, 1.1, 'ranged', { color: '#4fc3ff' }),
  },
};

export const STARTING_WEAPON: Record<HeroId, string> = { mason: 'soccer_ball', james: 'golf_club', cole: 'putter', cam: 'ai_slop' };

/** Abilities that can be ranked up for a hero (abilities, ultimate and passive). */
export function rankable(id: HeroId): string[] {
  const d = HEROES[id];
  return [...d.abilities, d.ultimate, d.passive];
}
