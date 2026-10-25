import type { Hooks, Unit } from '../combat/battle';
import type { RunState } from '../types';

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  lore: string;
  hooks: Hooks;
  /** Applied once when picked (bargains that grant levels, rerolls...). */
  onAcquire?: (run: RunState) => void;
  /** For bargains: the price, shown in red. */
  curse?: string;
  emberBonus?: number;
  extraChoices?: number;
}

const stat = (fn: (u: Unit) => void): Hooks => ({ heroMod: (u) => fn(u) });

export const RELICS: RelicDef[] = [
  {
    id: 'grave_salt',
    name: 'Grave Salt',
    desc: 'Heroes gain +15% max HP.',
    lore: 'Scattered on the dead so they stay dead. Eaten by the living so they stay living.',
    hooks: stat((u) => (u.maxHp = u.hp = Math.round(u.maxHp * 1.15))),
  },
  {
    id: 'black_whetstone',
    name: 'Black Whetstone',
    desc: 'Heroes gain +12% attack.',
    lore: 'Quarried from the foundations of the Black Fortress. It sharpens resentment too.',
    hooks: stat((u) => (u.atk *= 1.12)),
  },
  {
    id: 'raven_feather',
    name: 'Raven Feather',
    desc: 'Heroes gain +10% critical chance.',
    lore: 'Ravens always know where the weak point is. They have had practice.',
    hooks: stat((u) => (u.crit += 0.1)),
  },
  {
    id: 'cracked_hourglass',
    name: 'Cracked Hourglass',
    desc: 'Heroes attack 12% faster.',
    lore: 'The sand runs upward now. Time is in a hurry to be done with this age.',
    hooks: stat((u) => (u.interval /= 1.12)),
  },
  {
    id: 'iron_vow',
    name: 'Iron Vow',
    desc: 'Heroes gain +20 armor.',
    lore: 'An oath sworn on cold iron. It is heavier than any armor and holds better.',
    hooks: stat((u) => (u.armor += 20)),
  },
  {
    id: 'leech_tooth',
    name: 'Leech Tooth',
    desc: 'Heroes gain 7% lifesteal.',
    lore: 'Pulled from the mouth of a blood-saint. It is still thirsty.',
    hooks: stat((u) => (u.lifesteal += 0.07)),
  },
  {
    id: 'golden_seed',
    name: 'Golden Seed',
    desc: 'Skills charge 20% faster.',
    lore: 'A seed of the Great Tree. Plant it in a hero and something grows.',
    hooks: stat((u) => (u.energyMult *= 1.2)),
  },
  {
    id: 'warding_sigil',
    name: 'Warding Sigil',
    desc: 'Heroes begin each battle shielded for 15% of max HP.',
    lore: 'Drawn in the dirt with a finger dipped in grace.',
    hooks: {
      onStart: (b) => {
        for (const h of b.alive('hero')) b.addShield(h, h.maxHp * 0.15);
      },
    },
  },
  {
    id: 'plague_censer',
    name: 'Plague Censer',
    desc: 'Enemies take 10% more damage.',
    lore: 'The smoke finds the cracks in armor. Then it finds the cracks in men.',
    hooks: { enemyMod: (u) => (u.dmgTakenMult *= 1.1) },
  },
  {
    id: 'corpse_pyre',
    name: 'Corpse Pyre',
    desc: 'Slain enemies burst into flame, burning all other enemies.',
    lore: 'Pile the dead high enough and the fire feeds itself.',
    hooks: {
      onKill: (b, _k, victim) => {
        for (const f of b.alive('enemy')) b.addStatus(f, 'burn', 3, victim.maxHp * 0.02);
      },
    },
  },
  {
    id: 'martyrs_bell',
    name: "Martyr's Bell",
    desc: 'When a hero falls, the rest heal 30% and deal 30% more damage for 6s.',
    lore: 'It rings once for each of the fallen. It has rung a great deal.',
    hooks: {
      onAllyDeath: (b) => {
        for (const h of b.alive('hero')) {
          b.heal(null, h, h.maxHp * 0.3);
          b.addStatus(h, 'empower', 6, 30);
        }
      },
    },
  },
  {
    id: 'tarnished_crown',
    name: 'Tarnished Crown',
    desc: 'Earn 40% more Embers this run.',
    lore: 'Every pretender wears one. None of them fit.',
    hooks: {},
    emberBonus: 0.4,
  },
  {
    id: 'dawns_edge',
    name: "Dawn's Edge",
    desc: 'Heroes deal double damage for the first 3s of each battle.',
    lore: 'The first light of a day that never came, trapped in a blade.',
    hooks: {
      onStart: (b) => {
        for (const h of b.alive('hero')) b.addStatus(h, 'empower', 3, 100);
      },
    },
  },
  {
    id: 'grace_lantern',
    name: 'Lantern of Grace',
    desc: 'Heroes regenerate 1.5% of max HP per second.',
    lore: 'A golden flame that remembers being a guiding light.',
    hooks: {
      onStart: (b) => {
        for (const h of b.alive('hero')) b.addStatus(h, 'regen', 999, h.maxHp * 0.015);
      },
    },
  },
  {
    id: 'shattered_rune',
    name: 'Shard of the Great Rune',
    desc: 'Heroes gain +8% HP, attack and attack speed.',
    lore: 'A sliver of the law that once held the world together.',
    hooks: stat((u) => {
      u.maxHp = u.hp = Math.round(u.maxHp * 1.08);
      u.atk *= 1.08;
      u.interval /= 1.08;
    }),
  },
  {
    id: 'headsmans_oath',
    name: "Headsman's Oath",
    desc: 'Heroes deal 40% more damage to enemies below 35% HP.',
    lore: 'Mercy is a swift blade. The headsman was very merciful.',
    hooks: {
      onHit: (b, src, tgt, dmg, info) => {
        if (tgt.alive && tgt.hp < tgt.maxHp * 0.35) b.dealDamage(src, tgt, dmg * 0.4, { ...info, trueDmg: true, noProc: true, canCrit: false, noDodge: true });
      },
    },
  },
  {
    id: 'crow_mother',
    name: 'Mother of Crows',
    desc: 'Critical hits cause bleeding.',
    lore: 'Her children pick at every wound until it opens.',
    hooks: {
      onHit: (b, src, tgt, _d, info) => {
        if (info.crit) b.addStatus(tgt, 'bleed', 3, src.atk * 0.3, src);
      },
    },
  },
  {
    id: 'stormcall_horn',
    name: 'Stormcaller Horn',
    desc: 'Every 5s, lightning strikes a random enemy.',
    lore: 'Blown once, by a giant, at the end of the last age. The storm never left.',
    hooks: {
      onTick: (b, dt) => {
        const next = (b.scratch.storm ?? 3) - dt;
        b.scratch.storm = next <= 0 ? next + 5 : next;
        if (next > 0) return;
        const heroes = b.alive('hero');
        const foes = b.alive('enemy');
        if (!heroes.length || !foes.length) return;
        const power = Math.max(...heroes.map((h) => h.atk)) * 1.6;
        const tgt = b.rng.pick(foes);
        b.emit({ t: 'aoe', side: 'enemy', kind: 'bolt' });
        b.dealDamage(null, tgt, power, { kind: 'bolt', noDodge: true });
      },
    },
  },
  {
    id: 'bone_phylactery',
    name: 'Bone Phylactery',
    desc: 'Summoned allies have +60% HP and damage.',
    lore: 'A jar with something inside that knocks, politely, to be let out.',
    hooks: {
      heroMod: (u) => {
        if (!u.summon) return;
        u.maxHp = u.hp = Math.round(u.maxHp * 1.6);
        u.atk *= 1.6;
      },
    },
  },
  {
    id: 'godslayer_seal',
    name: "Godslayer's Seal",
    desc: 'Heroes deal 30% more damage to bosses.',
    lore: 'Pressed into the wax of a single decree: that gods may die.',
    hooks: { enemyMod: (u) => u.boss && (u.dmgTakenMult *= 1.3) },
  },
  {
    id: 'thornroot',
    name: 'Thornroot Heart',
    desc: 'Heroes reflect 15% of damage taken to the attacker.',
    lore: 'Its roots grew through a knight\'s ribs. He did not seem to mind.',
    hooks: {
      onHurt: (b, _h, src, dmg) => {
        if (src && src.alive && dmg > 0) b.dealDamage(null, src, dmg * 0.15, { kind: 'reflect', trueDmg: true, noProc: true, noDodge: true });
      },
    },
  },
  {
    id: 'sentinel_horn',
    name: 'Sentinel Horn',
    desc: 'Front-row heroes gain +20% max HP and +10 armor.',
    lore: 'Sounded at the gate when the line must hold.',
    hooks: stat((u) => {
      if (u.row !== 'front') return;
      u.maxHp = u.hp = Math.round(u.maxHp * 1.2);
      u.armor += 10;
    }),
  },
  {
    id: 'far_sight',
    name: 'Eye of the Far Watcher',
    desc: 'Back-row heroes gain +20% attack.',
    lore: 'Taken from a watchtower sentinel who saw too far.',
    hooks: stat((u) => u.row === 'back' && !u.summon && (u.atk *= 1.2)),
  },
];

export const BARGAINS: RelicDef[] = [
  {
    id: 'burning_eye',
    name: 'Pact of the Burning Eye',
    desc: 'Heroes deal +40% damage.',
    curse: 'Heroes lose 1.5% max HP per second in battle.',
    lore: 'The eye offers sight. It asks only that you burn in it.',
    hooks: {
      heroMod: (u) => (u.dmgMult *= 1.4),
      onTick: (b, dt) => {
        for (const h of b.alive('hero')) {
          if (h.summon) continue;
          h.hp -= h.maxHp * 0.015 * dt;
          if (h.hp <= 0) b.kill(h, null);
        }
      },
    },
  },
  {
    id: 'blood_oath',
    name: 'Blood Oath',
    desc: 'Heroes gain +20% attack and 15% lifesteal.',
    curse: 'Healing received is halved.',
    lore: 'Sign in blood. Pay in blood. The ink never dries.',
    hooks: stat((u) => {
      u.atk *= 1.2;
      u.lifesteal += 0.15;
      u.healTakenMult *= 0.5;
    }),
  },
  {
    id: 'crown_of_thorns',
    name: 'Crown of Thorns',
    desc: 'Heroes reflect 40% of damage taken.',
    curse: 'Heroes have 20% less max HP.',
    lore: 'Wear it and every blow returns. So does every memory.',
    hooks: {
      heroMod: (u) => (u.maxHp = u.hp = Math.round(u.maxHp * 0.8)),
      onHurt: (b, _h, src, dmg) => {
        if (src && src.alive && dmg > 0) b.dealDamage(null, src, dmg * 0.4, { kind: 'reflect', trueDmg: true, noProc: true, noDodge: true });
      },
    },
  },
  {
    id: 'frenzy',
    name: 'Embrace the Frenzy',
    desc: 'Heroes attack 40% faster.',
    curse: 'Enemies have 30% more HP.',
    lore: 'A madness that comes from the moon. It makes the hands quick and the heart quicker.',
    hooks: {
      heroMod: (u) => (u.interval /= 1.4),
      enemyMod: (u) => (u.maxHp = u.hp = Math.round(u.maxHp * 1.3)),
    },
  },
  {
    id: 'hollow_oath',
    name: 'Oath of the Hollow',
    desc: 'Each hero defies death once per battle.',
    curse: 'Enemies deal 20% more damage.',
    lore: 'You will not die. You will simply stop being you.',
    hooks: {
      heroMod: (u) => !u.summon && (u.cheatDeath += 1),
      enemyMod: (u) => (u.dmgMult *= 1.2),
    },
  },
  {
    id: 'black_tithe',
    name: 'The Black Tithe',
    desc: '+1 reward choice and +3 rerolls.',
    curse: 'Enemies attack 20% faster.',
    lore: 'The Dark Lord\'s taxmen are generous with loans.',
    hooks: { enemyMod: (u) => (u.interval /= 1.2) },
    onAcquire: (run) => (run.rerolls += 3),
    extraChoices: 1,
  },
  {
    id: 'lidless_bargain',
    name: 'Bargain with the Lidless Eye',
    desc: 'Heroes gain +20% critical chance and +50% critical damage.',
    curse: 'Every 8s the Eye marks a hero: +50% damage taken for 4s.',
    lore: 'It sees every weakness. It shares. It also watches.',
    hooks: {
      heroMod: (u) => {
        u.crit += 0.2;
        u.critMult += 0.5;
      },
      onTick: (b, dt) => {
        b.scratch.eye = (b.scratch.eye ?? 4) - dt;
        if (b.scratch.eye > 0) return;
        b.scratch.eye += 8;
        const hs = b.alive('hero');
        if (hs.length) b.addStatus(b.rng.pick(hs), 'mark', 4, 50);
      },
    },
  },
  {
    id: 'ember_debt',
    name: 'Ember Debt',
    desc: 'All heroes immediately gain 2 levels.',
    curse: 'Enemies have 20% more HP and damage.',
    lore: 'Borrowed strength, borrowed time. The interest is paid in ash.',
    hooks: {
      enemyMod: (u) => {
        u.maxHp = u.hp = Math.round(u.maxHp * 1.2);
        u.dmgMult *= 1.2;
      },
    },
    onAcquire: (run) => {
      for (const h of run.heroes) h.level += 2;
    },
  },
  {
    id: 'starved_saint',
    name: 'The Starved Saint',
    desc: 'Heroes gain +35% max HP.',
    curse: 'Heroes deal 15% less damage.',
    lore: 'She fasted until she was nothing but faith. Faith is very durable.',
    hooks: stat((u) => {
      u.maxHp = u.hp = Math.round(u.maxHp * 1.35);
      u.dmgMult *= 0.85;
    }),
  },
];

/** Gear effects, keyed by id. `owner` is the hero wearing it. */
export const GEAR_EFFECTS: Record<string, { desc: string; hooks: Hooks }> = {
  bleed_on_hit: {
    desc: 'Attacks cause bleeding.',
    hooks: {
      onHit: (b, src, tgt, _d, _i, owner) => src === owner && b.addStatus(tgt, 'bleed', 3, src.atk * 0.3, src),
    },
  },
  burn_on_hit: {
    desc: 'Attacks set foes ablaze.',
    hooks: {
      onHit: (b, src, tgt, _d, _i, owner) => src === owner && b.addStatus(tgt, 'burn', 3, src.atk * 0.3, src),
    },
  },
  execute: {
    desc: '+60% damage to foes below 30% HP.',
    hooks: {
      onHit: (b, src, tgt, dmg, info, owner) => {
        if (src === owner && tgt.alive && tgt.hp < tgt.maxHp * 0.3)
          b.dealDamage(src, tgt, dmg * 0.6, { ...info, trueDmg: true, noProc: true, canCrit: false, noDodge: true });
      },
    },
  },
  thorns: {
    desc: 'Reflect 30% of damage taken.',
    hooks: {
      onHurt: (b, hero, src, dmg, owner) => {
        if (hero === owner && src && src.alive && dmg > 0)
          b.dealDamage(null, src, dmg * 0.3, { kind: 'reflect', trueDmg: true, noProc: true, noDodge: true });
      },
    },
  },
  second_wind: {
    desc: 'Once per battle, heal 40% when below 30% HP.',
    hooks: {
      onHurt: (b, hero, _s, _d, owner) => {
        if (hero !== owner || hero.flags.secondWind || hero.hp <= 0 || hero.hp > hero.maxHp * 0.3) return;
        hero.flags.secondWind = true;
        b.heal(null, hero, hero.maxHp * 0.4);
      },
    },
  },
  echo_cast: {
    desc: '30% chance to cast skills twice.',
    hooks: {
      onCast: (b, caster, owner) => {
        if (caster !== owner || caster.flags.echoing || !b.rng.chance(0.3)) return;
        caster.flags.echoing = true;
        b.after(0.4, () => {
          if (caster.alive && caster.skill) caster.skill(b, caster);
          caster.flags.echoing = false;
        });
      },
    },
  },
  energy_on_kill: {
    desc: 'Killing blows grant 50 energy.',
    hooks: { onKill: (_b, killer, _v, owner) => killer === owner && owner && (owner.energy += 50) },
  },
  start_shield: {
    desc: 'Begin each battle shielded for 35% of max HP.',
    hooks: { onStart: (b, owner) => owner && b.addShield(owner, owner.maxHp * 0.35) },
  },
};

export interface UpgradeDef {
  id: string;
  name: string;
  desc: (lvl: number) => string;
  max: number;
  cost: (lvl: number) => number;
}

/** Permanent upgrades bought with Embers between runs. */
export const UPGRADES: UpgradeDef[] = [
  { id: 'vigor', name: 'Vigor', desc: (l) => `Heroes gain +${l * 6}% max HP.`, max: 10, cost: (l) => 30 + l * 25 },
  { id: 'strength', name: 'Strength', desc: (l) => `Heroes gain +${l * 5}% attack.`, max: 10, cost: (l) => 30 + l * 25 },
  { id: 'endurance', name: 'Endurance', desc: (l) => `Heroes gain +${l * 4} armor.`, max: 5, cost: (l) => 40 + l * 30 },
  {
    id: 'flask',
    name: 'Crimson Flask',
    desc: (l) => `When the party falls, revive everyone at ${30 + l * 15}% HP. ${l >= 3 ? 'Twice' : 'Once'} per run.`,
    max: 3,
    cost: (l) => [120, 260, 600][l] ?? 0,
  },
  { id: 'grace', name: 'Sight of Grace', desc: () => 'See 4 reward choices instead of 3.', max: 1, cost: () => 400 },
  { id: 'fortune', name: 'Rune of Fortune', desc: (l) => `Start each run with ${1 + l} rerolls.`, max: 4, cost: (l) => 60 + l * 60 },
  { id: 'heirloom', name: 'Heirloom', desc: () => 'Begin each run with a random relic.', max: 1, cost: () => 300 },
  { id: 'kindling', name: 'Rekindling', desc: (l) => `Earn +${l * 10}% Embers.`, max: 5, cost: (l) => 50 + l * 40 },
  { id: 'veteran', name: 'Veteran Warband', desc: (l) => `Heroes start at level ${1 + l}.`, max: 2, cost: (l) => [350, 800][l] ?? 0 },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries([...RELICS, ...BARGAINS].map((r) => [r.id, r]));
