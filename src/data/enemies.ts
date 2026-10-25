import { makeUnit, type Unit } from '../combat/battle';
import type { AttackKind, Row } from '../types';
import type { Targeting } from '../combat/battle';

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  row: Row;
  hp: number;
  atk: number;
  armor?: number;
  interval: number;
  crit?: number;
  dodge?: number;
  lifesteal?: number;
  ranged?: boolean;
  attackKind?: AttackKind;
  targeting?: Targeting;
  cost: number;
  boss?: boolean;
  size?: number;
  lore: string;
  /** Called after the unit is created, to attach behaviour. */
  setup?: (u: Unit) => void;
}

/** Repeats `fn` every `period` seconds of the unit's life. */
function every(u: Unit, key: string, period: number, dt: number, fn: () => void): void {
  u.timers[key] = (u.timers[key] ?? period * 0.6) - dt;
  if (u.timers[key] <= 0) {
    u.timers[key] += period;
    fn();
  }
}

function onHitStatus(kind: 'burn' | 'bleed', chance: number, powerMult: number, dur = 3) {
  return (u: Unit) => {
    u.onHitLand = (b, self, tgt, dmg) => {
      if (dmg > 0 && b.rng.chance(chance)) b.addStatus(tgt, kind, dur, self.atk * powerMult, self);
    };
  };
}

const E: EnemyDef[] = [
  // ---- Region I: The Ashen Plains ----
  {
    id: 'hollow',
    name: 'Hollow Soldier',
    sprite: 'hollow',
    row: 'front',
    hp: 150,
    atk: 11,
    armor: 10,
    interval: 1.3,
    cost: 1,
    lore: 'He kept marching after the war ended. After his name ended. After he did.',
  },
  {
    id: 'hollow_archer',
    name: 'Hollow Archer',
    sprite: 'hollow_archer',
    row: 'back',
    hp: 95,
    atk: 12,
    interval: 1.6,
    ranged: true,
    attackKind: 'arrow',
    cost: 1,
    lore: 'Her arrows are rusted. So is her aim. It does not matter; there are many of her.',
  },
  {
    id: 'carrion_hound',
    name: 'Carrion Hound',
    sprite: 'hound',
    row: 'front',
    hp: 95,
    atk: 7,
    interval: 0.7,
    dodge: 0.1,
    attackKind: 'claw',
    cost: 1,
    setup: onHitStatus('bleed', 0.25, 0.3),
    lore: 'Bred to clear battlefields of the dead. The dead were not enough.',
  },
  {
    id: 'grave_warden',
    name: 'Grave Warden',
    sprite: 'warden',
    row: 'front',
    hp: 340,
    atk: 15,
    armor: 55,
    interval: 1.8,
    cost: 3,
    lore: 'Sworn to guard the barrows. Nobody told him the barrows were empty.',
  },
  {
    id: 'grafted_hand',
    name: 'Grafted Arm',
    sprite: 'grafted_hand',
    row: 'front',
    hp: 130,
    atk: 9,
    interval: 1.0,
    attackKind: 'claw',
    cost: 99,
    lore: 'It still wears a ring. It still wants it back.',
  },
  {
    id: 'morgrath',
    name: 'Morgrath, the Grafted Lord',
    sprite: 'morgrath',
    row: 'front',
    hp: 1400,
    atk: 17,
    armor: 30,
    interval: 1.4,
    cost: 99,
    boss: true,
    size: 2,
    lore: 'He sewed the limbs of the fallen to his own. He calls it a gift. He calls it a crown.',
    setup: (u) => {
      u.tick = (b, self, dt) => {
        every(self, 'graft', 8, dt, () => {
          const hands = b.allies(self).filter((a) => a.key === 'grafted_hand').length;
          if (hands >= 4) return;
          b.emit({ t: 'cast', uid: self.uid, name: 'Graft' });
          for (let i = 0; i < 2; i++) b.spawn(scaledAdd(self, 'grafted_hand'));
        });
      };
      u.onHurt = (b, self) => {
        if (!self.flags.enraged && self.hp < self.maxHp * 0.5) {
          self.flags.enraged = true;
          b.emit({ t: 'banner', text: 'Morgrath tears at his grafts!' });
          b.addStatus(self, 'haste', 999, 50);
        }
      };
    },
  },

  // ---- Region II: The Black Fortress ----
  {
    id: 'uruk_brute',
    name: 'Uruk Brute',
    sprite: 'uruk',
    row: 'front',
    hp: 300,
    atk: 19,
    armor: 25,
    interval: 1.5,
    cost: 2,
    setup: (u) => {
      u.onHitLand = (b, _self, tgt, dmg) => {
        if (dmg > 0 && b.rng.chance(0.15)) b.addStatus(tgt, 'stun', 0.6);
      };
    },
    lore: 'Bred in the pits beneath the fortress. It has never seen the sun. It hates you for having seen it.',
  },
  {
    id: 'uruk_crossbow',
    name: 'Uruk Crossbowman',
    sprite: 'uruk_crossbow',
    row: 'back',
    hp: 170,
    atk: 22,
    armor: 15,
    interval: 1.9,
    ranged: true,
    attackKind: 'arrow',
    cost: 2,
    lore: 'The bolts are black iron, forged in a furnace that never cools.',
  },
  {
    id: 'warg',
    name: 'Warg',
    sprite: 'warg',
    row: 'front',
    hp: 190,
    atk: 12,
    armor: 10,
    interval: 0.8,
    attackKind: 'claw',
    cost: 2,
    setup: onHitStatus('bleed', 0.3, 0.35),
    lore: 'Wolves that drank from the fortress cisterns. They grew. They grew hungry.',
  },
  {
    id: 'fortress_shaman',
    name: 'Fortress Shaman',
    sprite: 'shaman',
    row: 'back',
    hp: 180,
    atk: 10,
    armor: 10,
    interval: 1.6,
    ranged: true,
    attackKind: 'shadow',
    cost: 3,
    setup: (u) => {
      u.energyPerAttack = 34;
      u.skillName = 'Dark Chant';
      u.skill = (b, self) => {
        const allies = b.allies(self);
        const t = allies.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
        b.heal(self, t, t.maxHp * 0.25);
        for (const a of allies) b.addStatus(a, 'empower', 4, 20);
      };
    },
    lore: 'He whispers the Dark Lord\'s name into wounds, and they close out of fear.',
  },
  {
    id: 'iron_warden',
    name: 'The Iron Warden',
    sprite: 'iron_warden',
    row: 'front',
    hp: 3600,
    atk: 26,
    armor: 85,
    interval: 1.7,
    cost: 99,
    boss: true,
    size: 2,
    lore: 'Gatekeeper of the Black Fortress. Beneath the iron there is only more iron, and an eye that never closes.',
    setup: (u) => {
      u.tick = (b, self, dt) => {
        every(self, 'slam', 6, dt, () => {
          b.emit({ t: 'cast', uid: self.uid, name: 'Ground Slam' });
          b.emit({ t: 'shake', power: 5 });
          const front = b.foes(self).filter((f) => f.row === 'front');
          for (const f of front.length ? front : b.foes(self)) {
            b.dealDamage(self, f, self.atk * 1.3, { kind: 'melee', isSkill: true });
            b.addStatus(f, 'stun', 1.2);
          }
        });
        every(self, 'gaze', 9, dt, () => {
          const foes = b.foes(self);
          if (!foes.length) return;
          const t = b.rng.pick(foes);
          b.emit({ t: 'banner', text: `The Lidless Gaze falls upon the ${t.name}` });
          b.addStatus(t, 'mark', 5, 50);
        });
      };
    },
  },

  // ---- Region III: The Mount of Cinders ----
  {
    id: 'cinder_imp',
    name: 'Cinder Imp',
    sprite: 'imp',
    row: 'back',
    hp: 170,
    atk: 17,
    interval: 1.2,
    dodge: 0.15,
    ranged: true,
    attackKind: 'fire',
    cost: 2,
    setup: onHitStatus('burn', 0.4, 0.3),
    lore: 'Sparks from the mountain that learned to laugh.',
  },
  {
    id: 'magma_golem',
    name: 'Magma Golem',
    sprite: 'golem',
    row: 'front',
    hp: 680,
    atk: 25,
    armor: 45,
    interval: 2.0,
    cost: 4,
    setup: onHitStatus('burn', 1, 0.35),
    lore: 'The mountain\'s heart, given legs and a grudge.',
  },
  {
    id: 'flame_cultist',
    name: 'Flame Cultist',
    sprite: 'cultist',
    row: 'back',
    hp: 240,
    atk: 15,
    armor: 10,
    interval: 1.5,
    ranged: true,
    attackKind: 'fire',
    cost: 3,
    setup: (u) => {
      u.energyPerAttack = 30;
      u.skillName = 'Rite of Embers';
      u.skill = (b, self) => {
        for (const a of b.allies(self)) {
          b.addStatus(a, 'empower', 5, 30);
          b.addStatus(a, 'haste', 5, 20);
        }
      };
    },
    lore: 'They walk into the fire to be reborn. Most are not.',
  },
  {
    id: 'ash_wraith',
    name: 'Ash Wraith',
    sprite: 'wraith',
    row: 'front',
    hp: 260,
    atk: 22,
    interval: 1.1,
    dodge: 0.35,
    attackKind: 'shadow',
    targeting: 'back',
    cost: 3,
    lore: 'Ash that remembers being a person. It drifts past shields toward softer things.',
  },
  {
    id: 'vyrmora',
    name: 'Vyrmora, the Ember Wyrm',
    sprite: 'vyrmora',
    row: 'front',
    hp: 6000,
    atk: 34,
    armor: 50,
    interval: 1.6,
    cost: 99,
    boss: true,
    size: 2,
    lore: 'The last dragon of the old world sleeps in the mountain. It is not asleep.',
    setup: (u) => {
      u.tick = (b, self, dt) => {
        every(self, 'breath', 7, dt, () => {
          b.emit({ t: 'cast', uid: self.uid, name: 'Cinder Breath' });
          b.emit({ t: 'aoe', side: 'hero', kind: 'fire' });
          b.emit({ t: 'shake', power: 4 });
          for (const f of b.foes(self)) {
            b.dealDamage(self, f, self.atk * 0.9, { kind: 'fire', isSkill: true });
            b.addStatus(f, 'burn', 4, self.atk * 0.2, self);
          }
        });
      };
      u.onHurt = (b, self) => {
        if (!self.flags.molted && self.hp < self.maxHp * 0.5) {
          self.flags.molted = true;
          b.emit({ t: 'banner', text: 'Vyrmora\'s scales run molten!' });
          b.addShield(self, self.maxHp * 0.2);
        }
        if (!self.flags.enraged && self.hp < self.maxHp * 0.25) {
          self.flags.enraged = true;
          b.addStatus(self, 'haste', 999, 40);
        }
      };
    },
  },

  // ---- Region IV: The Shattered Throne ----
  {
    id: 'throne_knight',
    name: 'Throne Knight',
    sprite: 'throne_knight',
    row: 'front',
    hp: 860,
    atk: 32,
    armor: 70,
    interval: 1.6,
    cost: 4,
    setup: (u) => {
      u.tick = (b, self, dt) => every(self, 'guard', 8, dt, () => b.addShield(self, self.maxHp * 0.2));
    },
    lore: 'The king\'s guard did not abandon him. That was their mistake.',
  },
  {
    id: 'fallen_templar',
    name: 'Fallen Templar',
    sprite: 'templar',
    row: 'front',
    hp: 560,
    atk: 28,
    armor: 40,
    interval: 1.2,
    lifesteal: 0.3,
    attackKind: 'melee',
    cost: 3,
    lore: 'Once a paladin. The gold flaked off. What was underneath was hungry.',
  },
  {
    id: 'hollow_sorcerer',
    name: 'Hollow Sorcerer',
    sprite: 'hollow_sorcerer',
    row: 'back',
    hp: 360,
    atk: 26,
    armor: 10,
    interval: 1.8,
    ranged: true,
    attackKind: 'bolt',
    cost: 3,
    setup: (u) => {
      u.energyPerAttack = 34;
      u.skillName = 'Dark Comet';
      u.skill = (b, self) => {
        b.emit({ t: 'aoe', side: 'hero', kind: 'shadow' });
        for (const f of b.foes(self)) b.dealDamage(self, f, self.atk * 0.8, { kind: 'shadow', isSkill: true });
      };
    },
    lore: 'The academy\'s brightest. Their stars went out one by one.',
  },
  {
    id: 'crowned_wight',
    name: 'Crowned Wight',
    sprite: 'wight',
    row: 'back',
    hp: 440,
    atk: 24,
    armor: 20,
    interval: 1.4,
    ranged: true,
    attackKind: 'shadow',
    cost: 4,
    setup: (u) => {
      u.onHitLand = (b, _s, tgt, dmg) => dmg > 0 && b.addStatus(tgt, 'weaken', 3, 25);
    },
    lore: 'A pretender to the throne, crowned in the dark. There have been many.',
  },
  {
    id: 'hollow_king',
    name: 'The Hollow King',
    sprite: 'hollow_king',
    row: 'front',
    hp: 10000,
    atk: 42,
    armor: 60,
    interval: 1.5,
    cost: 99,
    boss: true,
    size: 2,
    lore: 'He sat the throne until he became it. To end the age, the throne must fall.',
    setup: (u) => {
      u.tick = (b, self, dt) => {
        every(self, 'decree', 9, dt, () => {
          if (b.allies(self).filter((a) => a.key === 'throne_knight').length >= 2) return;
          b.emit({ t: 'cast', uid: self.uid, name: 'Royal Decree' });
          b.spawn(scaledAdd(self, 'throne_knight', 0.35));
        });
        every(self, 'drain', 10, dt, () => {
          b.emit({ t: 'cast', uid: self.uid, name: 'Drain of Ages' });
          b.emit({ t: 'aoe', side: 'hero', kind: 'shadow' });
          let total = 0;
          for (const f of b.foes(self)) total += b.dealDamage(self, f, self.atk * 0.7, { kind: 'shadow', isSkill: true });
          b.heal(null, self, total);
        });
      };
      u.onHurt = (b, self) => {
        if (!self.flags.fall && self.hp < self.maxHp * 0.3) {
          self.flags.fall = true;
          b.emit({ t: 'banner', text: 'THE THRONE BEGINS TO FALL' });
          b.emit({ t: 'shake', power: 8 });
          b.addStatus(self, 'haste', 999, 60);
          b.addStatus(self, 'empower', 999, 30);
        }
      };
    },
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(E.map((e) => [e.id, e]));

export interface Region {
  name: string;
  subtitle: string;
  roster: string[];
  boss: string;
  bossMinions: string[];
  intro: string;
  sky: [string, string];
}

export const REGIONS: Region[] = [
  {
    name: 'The Ashen Plains',
    subtitle: 'where the war ended and no one stopped fighting',
    roster: ['hollow', 'hollow_archer', 'carrion_hound', 'grave_warden'],
    boss: 'morgrath',
    bossMinions: ['hollow', 'hollow_archer'],
    intro: 'Grey snow falls that is not snow. The banners of a dead kingdom still fly.',
    sky: ['#2a2430', '#6b5a5a'],
  },
  {
    name: 'The Black Fortress',
    subtitle: 'seat of the Dark Lord\'s iron will',
    roster: ['uruk_brute', 'uruk_crossbow', 'warg', 'fortress_shaman'],
    boss: 'iron_warden',
    bossMinions: ['uruk_brute', 'uruk_crossbow'],
    intro: 'A tower of black iron pierces the clouds. At its peak, an eye of fire turns toward you.',
    sky: ['#120c10', '#5a1e14'],
  },
  {
    name: 'The Mount of Cinders',
    subtitle: 'the forge-heart of the world',
    roster: ['cinder_imp', 'magma_golem', 'flame_cultist', 'ash_wraith'],
    boss: 'vyrmora',
    bossMinions: ['flame_cultist', 'cinder_imp'],
    intro: 'The ground glows. The air tastes of iron and old dragons.',
    sky: ['#1a0806', '#a8361a'],
  },
  {
    name: 'The Shattered Throne',
    subtitle: 'where the age must end',
    roster: ['throne_knight', 'fallen_templar', 'hollow_sorcerer', 'crowned_wight'],
    boss: 'hollow_king',
    bossMinions: ['fallen_templar', 'crowned_wight'],
    intro: 'The great rune is broken. Its shards hang in the air like frozen lightning.',
    sky: ['#0c0a18', '#3e3466'],
  },
];

export const WAVES_PER_REGION = 10;

export function regionIndex(wave: number): number {
  return Math.floor((wave - 1) / WAVES_PER_REGION) % REGIONS.length;
}

/** Each full pass through all regions is a new cycle ("Ascension"). */
export function cycleOf(wave: number): number {
  return Math.floor((wave - 1) / (WAVES_PER_REGION * REGIONS.length));
}

export function isBossWave(wave: number): boolean {
  return wave % WAVES_PER_REGION === 0;
}

export function waveScale(wave: number): { hp: number; atk: number } {
  const w = wave - 1;
  const cycle = cycleOf(wave);
  const c = Math.pow(2, cycle);
  return { hp: Math.pow(1.06, w) * c, atk: Math.pow(1.045, w) * c };
}

export function makeEnemy(id: string, wave: number): Unit {
  const d = ENEMIES[id];
  const s = waveScale(wave);
  const u = makeUnit({
    side: 'enemy',
    key: d.id,
    name: d.name,
    sprite: d.sprite,
    row: d.row,
    maxHp: Math.round(d.hp * s.hp),
    atk: d.atk * s.atk,
    armor: d.armor ?? 0,
    interval: d.interval,
    crit: d.crit ?? 0.05,
    dodge: d.dodge ?? 0,
    lifesteal: d.lifesteal ?? 0,
    ranged: d.ranged ?? false,
    attackKind: d.attackKind ?? 'melee',
    targeting: d.targeting ?? (d.ranged ? 'random' : 'front'),
    boss: d.boss ?? false,
    size: d.size ?? 1,
    energyPerAttack: 0,
  });
  d.setup?.(u);
  return u;
}

/** Adds summoned by a boss share its scaling so they stay relevant. */
function scaledAdd(boss: Unit, id: string, frac = 1): Unit {
  const d = ENEMIES[id];
  const bd = ENEMIES[boss.key];
  const ratio = boss.atk / bd.atk;
  const hpRatio = boss.maxHp / bd.hp;
  const u = makeEnemy(id, 1);
  u.maxHp = u.hp = Math.round(d.hp * hpRatio * frac);
  u.atk = d.atk * ratio * Math.max(0.6, frac);
  u.summon = true;
  return u;
}
