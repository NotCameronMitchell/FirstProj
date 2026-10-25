import type { Rng } from '../rng';
import type { ClassId, Gear, GearSlot, Rarity, StatMods } from '../types';
import { CLASSES } from './classes';

const PREFIX = ['Rusted', 'Ashen', 'Grave-forged', 'Black Iron', 'Ember-kissed', 'Sanctified', 'Hollow', 'Bloodsoaked', 'Crow-picked', 'Moonless', 'Oathbound', 'Weeping'];
const SUFFIX = ['of the Ash', 'of Ruin', 'of the Fallen Gate', 'of the Last Dawn', 'of Black Tears', 'of the Lidless Eye', 'of Hollow Kings', 'of the Burning Way'];

const ARMOR: Record<ClassId, string> = {
  knight: 'Plate',
  ranger: 'Leathers',
  sorcerer: 'Robes',
  priest: 'Vestments',
  paladin: 'Mail',
  necromancer: 'Shroud',
  rogue: 'Cloak',
  artificer: 'Apron',
};
const TRINKETS = ['Talisman', 'Ring', 'Amulet', 'Seal', 'Locket', 'Charm'];

interface Legendary {
  name: string;
  slot: GearSlot;
  effect: string;
  mods: StatMods;
  lore: string;
}

const LEGENDARIES: Legendary[] = [
  { name: 'Fang of the Gaunt Hound', slot: 'weapon', effect: 'bleed_on_hit', mods: { atkPct: 0.2, crit: 0.05 }, lore: 'Pried from the jaw of the first hound. It never stopped biting.' },
  { name: 'Cinderheart', slot: 'weapon', effect: 'burn_on_hit', mods: { atkPct: 0.25 }, lore: 'Forged in the mountain, quenched in the blood of a wyrm.' },
  { name: "Headsman's Mercy", slot: 'weapon', effect: 'execute', mods: { atkPct: 0.2, critMult: 0.3 }, lore: 'It has ended four kings. It is patient about the fifth.' },
  { name: 'Thornmail of the Briar Saint', slot: 'armor', effect: 'thorns', mods: { hpPct: 0.25, armor: 15 }, lore: 'The saint grew roses on the battlefield. They grew back sharper.' },
  { name: 'Ember of Last Light', slot: 'trinket', effect: 'second_wind', mods: { hpPct: 0.15 }, lore: 'The last flame of the first fire, kept in a glass no larger than a tear.' },
  { name: 'Twice-Spoken Grimoire', slot: 'trinket', effect: 'echo_cast', mods: { energyPct: 0.1 }, lore: 'Every spell inside it is written once, and read twice.' },
  { name: 'Crown of Carrion', slot: 'trinket', effect: 'energy_on_kill', mods: { atkPct: 0.1, speedPct: 0.1 }, lore: 'Crows built it from the rings of the dead. They demand tribute.' },
  { name: 'Aegis of the Fallen Gate', slot: 'armor', effect: 'start_shield', mods: { hpPct: 0.2, armor: 20 }, lore: 'The gate fell. The shield that held it did not.' },
];

type ModKey = keyof StatMods;

/** Roll ranges per stat, scaled by rarity budget. */
const ROLLS: Record<GearSlot, [ModKey, number][]> = {
  weapon: [
    ['atkPct', 0.14],
    ['crit', 0.07],
    ['speedPct', 0.1],
    ['critMult', 0.3],
    ['lifesteal', 0.05],
  ],
  armor: [
    ['hpPct', 0.16],
    ['armor', 14],
    ['dodge', 0.05],
    ['healPct', 0.15],
  ],
  trinket: [
    ['energyPct', 0.14],
    ['speedPct', 0.08],
    ['hpPct', 0.1],
    ['atkPct', 0.08],
    ['crit', 0.05],
    ['lifesteal', 0.04],
  ],
};

const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.6, legendary: 2 };

export function rollRarity(rng: Rng, wave: number): Rarity {
  const r = rng.next();
  if (r < 0.03 + wave * 0.004) return 'legendary';
  if (r < 0.25 + wave * 0.01) return 'rare';
  return 'common';
}

export function rollGear(rng: Rng, cls: ClassId, wave: number, slot?: GearSlot): Gear {
  const rarity = rollRarity(rng, wave);
  const growth = 1 + wave * 0.02;
  if (rarity === 'legendary') {
    const pool = slot ? LEGENDARIES.filter((l) => l.slot === slot) : LEGENDARIES;
    const l = rng.pick(pool);
    const mods: StatMods = {};
    for (const [k, v] of Object.entries(l.mods) as [ModKey, number][]) mods[k] = round(k, v * growth);
    return { name: l.name, slot: l.slot, rarity, mods, effect: l.effect, lore: l.lore };
  }
  slot ??= rng.pick<GearSlot>(['weapon', 'armor', 'trinket']);
  const base = slot === 'weapon' ? CLASSES[cls].weapon : slot === 'armor' ? ARMOR[cls] : rng.pick(TRINKETS);
  const statCount = rarity === 'rare' ? 2 : 1;
  const healer = cls === 'priest' || cls === 'paladin';
  const pool = ROLLS[slot].filter(([k]) => healer || k !== 'healPct');
  const options = rng.shuffle(pool).slice(0, statCount);
  const mods: StatMods = {};
  for (const [k, v] of options) {
    mods[k] = round(k, v * RARITY_MULT[rarity] * (0.8 + rng.next() * 0.4) * growth * (statCount === 2 ? 0.75 : 1));
  }
  let name = `${rng.pick(PREFIX)} ${base}`;
  if (rarity === 'rare') name += ` ${rng.pick(SUFFIX)}`;
  return { name, slot, rarity, mods, lore: rng.pick(GEAR_LORE) };
}

function round(k: ModKey, v: number): number {
  return k === 'armor' ? Math.round(v) : Math.round(v * 100) / 100;
}

const GEAR_LORE = [
  'Taken from a soldier who no longer needed it. He objected, briefly.',
  'The previous owner\'s initials are scratched out. Yours will be too, someday.',
  'It smells of ash and old rain.',
  'Found beside a grace that had gone out.',
  'Forged for a war nobody remembers the cause of.',
  'There is a little dried blood in the seams. It is not yours. Yet.',
  'Black iron, from the Dark Lord\'s forges. It does not care who wields it.',
  'It hums faintly when the Throne is near.',
];

const MOD_LABEL: Record<ModKey, (v: number) => string> = {
  hpPct: (v) => `+${pct(v)} HP`,
  atkPct: (v) => `+${pct(v)} ATK`,
  armor: (v) => `+${v} Armor`,
  speedPct: (v) => `+${pct(v)} Speed`,
  crit: (v) => `+${pct(v)} Crit`,
  critMult: (v) => `+${pct(v)} Crit Dmg`,
  dodge: (v) => `+${pct(v)} Dodge`,
  lifesteal: (v) => `+${pct(v)} Lifesteal`,
  healPct: (v) => `+${pct(v)} Healing`,
  energyPct: (v) => `+${pct(v)} Skill Charge`,
};

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function describeMods(mods: StatMods): string[] {
  return (Object.entries(mods) as [ModKey, number][]).map(([k, v]) => MOD_LABEL[k](v));
}

/** Rough power score so the UI can show upgrade/downgrade arrows. */
export function gearScore(g: Gear | undefined): number {
  if (!g) return 0;
  const w: Record<ModKey, number> = { hpPct: 1, atkPct: 1.2, armor: 0.012, speedPct: 1.1, crit: 1, critMult: 0.4, dodge: 1.2, lifesteal: 1.5, healPct: 0.5, energyPct: 0.8 };
  let s = 0;
  for (const [k, v] of Object.entries(g.mods) as [ModKey, number][]) s += v * w[k];
  if (g.effect) s += 0.3;
  return s;
}
