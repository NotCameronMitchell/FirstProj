import { makeUnit, type Battle, type Unit } from '../combat/battle';
import type { AttackKind, ClassId, Row } from '../types';
import type { Targeting } from '../combat/battle';

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  role: string;
  row: Row;
  hp: number;
  atk: number;
  armor: number;
  interval: number;
  crit?: number;
  critMult?: number;
  dodge?: number;
  ranged: boolean;
  attackKind: AttackKind;
  targeting: Targeting;
  energyPerAttack: number;
  skillName: string;
  /** Skill description per rank (1..3). */
  skillDesc: (rank: number) => string;
  skill: (b: Battle, u: Unit) => void;
  basic?: (b: Battle, u: Unit) => boolean;
  setup?: (u: Unit) => void;
  weapon: string;
  lore: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Tarnished Knight',
    title: 'the Unbowed',
    role: 'Tank',
    row: 'front',
    hp: 320,
    atk: 13,
    armor: 45,
    interval: 1.25,
    ranged: false,
    attackKind: 'melee',
    targeting: 'front',
    energyPerAttack: 24,
    skillName: 'Greatshield Bulwark',
    skillDesc: (r) =>
      `Taunt all foes for ${3 + r * 0.5}s and raise a shield of ${pct(0.14 + r * 0.06)} max HP.` +
      (r >= 3 ? ' Allies gain a small shield too.' : ''),
    skill: (b, u) => {
      const r = u.skillRank;
      b.addStatus(u, 'taunt', 3 + r * 0.5, 0, u);
      b.addShield(u, u.maxHp * (0.14 + r * 0.06));
      if (r >= 3) for (const a of b.allies(u)) if (a !== u) b.addShield(a, a.maxHp * 0.1);
    },
    weapon: 'Longsword',
    lore: 'Cast out of grace, called back by it. The knight remembers nothing but the oath.',
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    title: 'of the Ashwood',
    role: 'Marksman',
    row: 'back',
    hp: 150,
    atk: 21,
    armor: 10,
    interval: 1.05,
    crit: 0.12,
    ranged: true,
    attackKind: 'arrow',
    targeting: 'lowest',
    energyPerAttack: 20,
    skillName: 'Piercing Volley',
    skillDesc: (r) => `Loose ${2 + r} arrows at random foes for 110% damage each, causing bleed.`,
    skill: (b, u) => {
      const n = 2 + u.skillRank;
      for (let i = 0; i < n; i++) {
        const foes = b.foes(u);
        if (!foes.length) return;
        const t = b.rng.pick(foes);
        b.after(i * 0.09, () => {
          if (!t.alive || !u.alive) return;
          b.strike(u, t, 1.1, { isSkill: true }, (d) => d > 0 && b.addStatus(t, 'bleed', 3, u.atk * 0.25, u));
        });
      }
    },
    weapon: 'Longbow',
    lore: 'The forests burned. The ranger did not. Every arrow is fletched with ash.',
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Glintstone Sorcerer',
    title: 'of the Star-Academy',
    role: 'Area damage',
    row: 'back',
    hp: 125,
    atk: 18,
    armor: 5,
    interval: 1.5,
    ranged: true,
    attackKind: 'bolt',
    targeting: 'random',
    energyPerAttack: 26,
    skillName: 'Glintstone Comet',
    skillDesc: (r) => `Call down a comet that strikes every foe for ${pct(1.1 + r * 0.35)} damage.`,
    skill: (b, u) => {
      b.emit({ t: 'aoe', side: 'enemy', kind: 'bolt' });
      b.emit({ t: 'shake', power: 3 });
      const mult = 1.1 + u.skillRank * 0.35;
      b.after(0.3, () => {
        for (const f of b.foes(u)) b.dealDamage(u, f, u.atk * mult, { kind: 'bolt', isSkill: true });
      });
    },
    weapon: 'Glintstone Staff',
    lore: 'Stars are only stones that remember falling. The sorcerer reminds them.',
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    title: 'of the Withered Tree',
    role: 'Healer',
    row: 'back',
    hp: 140,
    atk: 11,
    armor: 10,
    interval: 1.3,
    ranged: true,
    attackKind: 'holy',
    targeting: 'random',
    energyPerAttack: 20,
    skillName: 'Sacred Litany',
    skillDesc: (r) =>
      `Heal all allies for ${pct(1.2 + r * 0.3)} attack plus 6% of their max HP.` +
      (r >= 2 ? ' Grants regeneration.' : '') +
      (r >= 3 ? ' Revives one fallen hero once per battle.' : ''),
    basic: (b, u) => {
      const wounded = b.allies(u).filter((a) => a.hp / a.maxHp < 0.85);
      if (!wounded.length) return false;
      const t = wounded.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
      b.emit({ t: 'proj', from: u.uid, to: t.uid, kind: 'holy', dur: 0.25 });
      b.after(0.25, () => b.heal(u, t, u.atk * 1.7));
      return true;
    },
    skill: (b, u) => {
      const r = u.skillRank;
      b.emit({ t: 'aoe', side: 'hero', kind: 'holy' });
      if (r >= 3 && !u.flags.revived) {
        const fallen = b.heroes().find((h) => !h.alive);
        if (fallen) {
          u.flags.revived = true;
          b.revive(fallen, 0.35);
        }
      }
      for (const a of b.allies(u)) {
        b.heal(u, a, u.atk * (1.2 + r * 0.3) + a.maxHp * 0.06);
        if (r >= 2) b.addStatus(a, 'regen', 4, a.maxHp * 0.015);
      }
    },
    weapon: 'Censer',
    lore: 'The Great Tree is dead, but its sap still runs in her prayers.',
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    title: 'of the Golden Order',
    role: 'Bruiser / support',
    row: 'front',
    hp: 260,
    atk: 15,
    armor: 32,
    interval: 1.2,
    ranged: false,
    attackKind: 'melee',
    targeting: 'front',
    energyPerAttack: 20,
    skillName: 'Golden Vow',
    skillDesc: (r) =>
      `All allies deal ${10 + r * 10}% more damage for 5s. Smite a foe for 150% and shield yourself.`,
    skill: (b, u) => {
      const r = u.skillRank;
      b.emit({ t: 'aoe', side: 'hero', kind: 'holy' });
      for (const a of b.allies(u)) b.addStatus(a, 'empower', 5, 10 + r * 10);
      b.addShield(u, u.maxHp * 0.15);
      const t = b.pickTarget(u);
      if (t) b.strike(u, t, 1.5, { kind: 'holy', isSkill: true });
    },
    weapon: 'Warhammer',
    lore: 'The Order fell. Its law did not. The paladin carries it like a burning coal.',
  },
  necromancer: {
    id: 'necromancer',
    name: 'Necromancer',
    title: 'of the Deathroot',
    role: 'Summoner',
    row: 'back',
    hp: 125,
    atk: 13,
    armor: 5,
    interval: 1.35,
    ranged: true,
    attackKind: 'shadow',
    targeting: 'random',
    energyPerAttack: 18,
    skillName: 'Raise the Fallen',
    skillDesc: (r) =>
      `Raise ${r >= 2 ? 2 : 1} skeleton${r >= 2 ? 's' : ''} to fight in the front row (max 3).` +
      (r >= 3 ? ' Skeletons are empowered.' : '') +
      ' Gains energy whenever a foe dies.',
    setup: (u) => {
      u.onOtherDeath = (_b, self, dead) => {
        if (dead.side !== self.side) self.energy += 12 * self.energyMult;
      };
    },
    skill: (b, u) => {
      const r = u.skillRank;
      const count = r >= 2 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        if (b.allies(u).filter((a) => a.key === 'skeleton').length >= 3) return;
        b.spawn(skeleton(u, r));
      }
    },
    weapon: 'Bone Scepter',
    lore: 'Death is a door. She has learned to hold it open just long enough.',
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    title: 'of the Severed Hand',
    role: 'Assassin',
    row: 'front',
    hp: 160,
    atk: 16,
    armor: 15,
    interval: 0.75,
    crit: 0.25,
    critMult: 1.8,
    dodge: 0.15,
    ranged: false,
    attackKind: 'melee',
    targeting: 'front',
    energyPerAttack: 14,
    skillName: 'Shadowstep',
    skillDesc: (r) =>
      `Vanish and strike the weakest foe anywhere for ${pct(2.5 + r * 0.5)} damage, always critical.` +
      (r >= 2 ? ' Leaves them bleeding.' : ''),
    skill: (b, u) => {
      const t = b.pickTarget(u, 'assassin');
      if (!t) return;
      b.strike(u, t, 2.5 + u.skillRank * 0.5, { isSkill: true, forceCrit: true, noDodge: true }, (d) => {
        if (d > 0 && u.skillRank >= 2) b.addStatus(t, 'bleed', 4, u.atk * 0.5, u);
      });
    },
    weapon: 'Twin Daggers',
    lore: 'A thief of the old court. She stole a crown once. She intends to steal the throne.',
  },
  artificer: {
    id: 'artificer',
    name: 'Artificer',
    title: 'of the Black Forge',
    role: 'Burn / control',
    row: 'back',
    hp: 140,
    atk: 14,
    armor: 15,
    interval: 1.2,
    ranged: true,
    attackKind: 'fire',
    targeting: 'random',
    energyPerAttack: 22,
    skillName: 'Firepot Barrage',
    skillDesc: (r) =>
      `Hurl ${r >= 3 ? 4 : 3} firepots at random foes for 100% damage, setting them ablaze.` +
      (r >= 2 ? ' The first target is stunned.' : ''),
    skill: (b, u) => {
      const r = u.skillRank;
      const n = r >= 3 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const foes = b.foes(u);
        if (!foes.length) return;
        const t = b.rng.pick(foes);
        b.after(i * 0.12, () => {
          if (!t.alive || !u.alive) return;
          b.strike(u, t, 1, { isSkill: true }, (d) => {
            if (d <= 0) return;
            b.addStatus(t, 'burn', 3, u.atk * (0.25 + r * 0.1), u);
            if (i === 0 && r >= 2) b.addStatus(t, 'stun', 1.2);
          });
        });
      }
    },
    weapon: 'Firepot Sling',
    lore: 'He builds what the forges of the Dark Lord taught him, and turns it back on them.',
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

function skeleton(owner: Unit, rank: number): Unit {
  const s = makeUnit({
    side: owner.side,
    key: 'skeleton',
    name: 'Risen Skeleton',
    sprite: 'skeleton',
    row: 'front',
    maxHp: Math.round(owner.maxHp * 0.7),
    atk: owner.atk * 0.65,
    armor: 10,
    interval: 1.1,
    summon: true,
    energyPerAttack: 0,
  });
  if (rank >= 3) s.dmgMult = 1.3;
  return s;
}

/** Skill rank goes up at hero levels 4 and 7. */
export function skillRank(level: number): number {
  return level >= 7 ? 3 : level >= 4 ? 2 : 1;
}

export function levelMult(level: number): number {
  return 1 + 0.16 * (level - 1);
}
