// Permanent upgrades bought with Village Sauce between runs.

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: (lvl: number) => string;
  max: number;
  cost: (lvl: number) => number;
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'vet', name: 'Seasoned Veterans', desc: (l) => `Heroes start with +${l * 6}% max HP.`, max: 10, cost: (l) => 8 + 8 * l },
  { id: 'sauce', name: 'Secret Sauce', desc: (l) => `Heroes deal +${l * 5}% damage.`, max: 10, cost: (l) => 8 + 8 * l },
  { id: 'signing', name: 'Signing Bonus', desc: (l) => `Start each run with ${l * 15} PTO Hours.`, max: 5, cost: (l) => 6 + 6 * l },
  { id: 'benefits', name: 'Better Benefits', desc: (l) => `Heal an extra ${l * 8}% after every fight.`, max: 5, cost: (l) => 6 + 6 * l },
  { id: 'mentor', name: 'Mentorship Program', desc: (l) => `Each hero starts with ${l} random ability rank-up${l === 1 ? '' : 's'}.`, max: 3, cost: (l) => 20 + 20 * l },
  { id: 'menu', name: 'Expanded Menu', desc: (l) => `The shop stocks ${l} extra item${l === 1 ? '' : 's'}.`, max: 2, cost: (l) => 15 + 12 * l },
  { id: 'second_wind', name: 'Second Wind', desc: () => 'Once per run, a party wipe revives everyone at 40% HP.', max: 1, cost: () => 40 },
];

export const metaLevel = (upgrades: Record<string, number>, id: string) => upgrades[id] ?? 0;
