import { Battle, makeUnit, type Unit } from '../combat/battle';
import { CLASSES, levelMult, skillRank } from '../data/classes';
import { BARGAINS, GEAR_EFFECTS, RELICS, RELIC_MAP } from '../data/effects';
import { ENEMIES, REGIONS, cycleOf, isBossWave, makeEnemy, regionIndex } from '../data/enemies';
import { rollGear } from '../data/gear';
import { Rng, randomSeed } from '../rng';
import type { ClassId, HeroState, MetaState, Reward, Row, RunState, StatMods } from '../types';

export const RUN_VERSION = 1;

export function newRun(party: { cls: ClassId; row: Row }[], meta: MetaState, seed = randomSeed()): RunState {
  const up = meta.upgrades;
  const run: RunState = {
    version: RUN_VERSION,
    seed,
    rngState: seed,
    wave: 1,
    heroes: party.map((p) => ({ cls: p.cls, row: p.row, level: 1 + (up.veteran ?? 0), gear: {} })),
    relics: [],
    bargains: [],
    rerolls: 1 + (up.fortune ?? 0),
    flaskCharges: up.flask ? (up.flask >= 3 ? 2 : 1) : 0,
    kills: 0,
    bossesSlain: 0,
    startedAt: Date.now(),
  };
  if (up.heirloom) {
    const rng = runRng(run);
    run.relics.push(rng.pick(RELICS).id);
    saveRng(run, rng);
  }
  return run;
}

export function runRng(run: RunState): Rng {
  return new Rng(run.rngState);
}

export function saveRng(run: RunState, rng: Rng): void {
  run.rngState = rng.state;
}

function metaMods(meta: MetaState): StatMods {
  const u = meta.upgrades;
  return { hpPct: (u.vigor ?? 0) * 0.06, atkPct: (u.strength ?? 0) * 0.05, armor: (u.endurance ?? 0) * 4 };
}

/** Builds the combat unit for a hero from class base stats, level, gear and upgrades. */
export function buildHero(h: HeroState, index: number, meta: MetaState): Unit {
  const c = CLASSES[h.cls];
  const lm = levelMult(h.level);
  const mods: Required<StatMods> = { hpPct: 0, atkPct: 0, armor: 0, speedPct: 0, crit: 0, critMult: 0, dodge: 0, lifesteal: 0, healPct: 0, energyPct: 0 };
  for (const m of [metaMods(meta), ...Object.values(h.gear).map((g) => g!.mods)]) {
    for (const [k, v] of Object.entries(m) as [keyof StatMods, number][]) mods[k] += v;
  }
  const u = makeUnit({
    side: 'hero',
    key: c.id,
    name: c.name,
    sprite: c.id,
    row: h.row,
    heroIndex: index,
    maxHp: Math.round(c.hp * lm * (1 + mods.hpPct)),
    atk: c.atk * lm * (1 + mods.atkPct),
    armor: c.armor + mods.armor + (h.level - 1) * 2,
    interval: c.interval / (1 + mods.speedPct),
    crit: (c.crit ?? 0.05) + mods.crit,
    critMult: (c.critMult ?? 1.5) + mods.critMult,
    dodge: Math.min(0.6, (c.dodge ?? 0) + mods.dodge),
    lifesteal: mods.lifesteal,
    healMult: 1 + mods.healPct,
    energyMult: 1 + mods.energyPct,
    energyPerAttack: c.energyPerAttack,
    ranged: c.ranged,
    attackKind: c.attackKind,
    targeting: c.targeting,
    skill: c.skill,
    skillName: c.skillName,
    basic: c.basic,
    skillRank: skillRank(h.level),
  });
  c.setup?.(u);
  return u;
}

export function waveEnemies(wave: number, rng: Rng): string[] {
  const region = REGIONS[regionIndex(wave)];
  if (isBossWave(wave)) return [region.boss, ...region.bossMinions];
  const local = ((wave - 1) % 10) + 1;
  let budget = 4 + Math.floor(local * 0.7) + cycleOf(wave);
  const ids: string[] = [];
  // Always lead with a front-liner so the formation makes sense.
  const fronts = region.roster.filter((id) => ENEMIES[id].row === 'front' && ENEMIES[id].cost <= Math.max(1, budget - 1));
  const lead = rng.pick(fronts.length ? fronts : region.roster);
  ids.push(lead);
  budget -= ENEMIES[lead].cost;
  while (budget > 0 && ids.length < 7) {
    const affordable = region.roster.filter((id) => ENEMIES[id].cost <= budget);
    if (!affordable.length) break;
    // Early waves of a region favour cheap enemies; later ones bring heavies.
    const id = rng.weighted(affordable, (i) => (ENEMIES[i].cost === 1 ? 3 : 1 + local / 4));
    ids.push(id);
    budget -= ENEMIES[id].cost;
  }
  return ids;
}

export function buildBattle(run: RunState, meta: MetaState): { battle: Battle; rng: Rng } {
  const rng = runRng(run);
  const flaskLvl = meta.upgrades.flask ?? 0;
  const battle = new Battle(new Rng(rng.int(0, 2 ** 31)), {
    flaskCharges: run.flaskCharges,
    flaskPower: 0.3 + flaskLvl * 0.15,
  });
  for (const id of [...run.relics, ...run.bargains]) battle.addEffect(RELIC_MAP[id].hooks);
  const heroes = run.heroes.map((h, i) => buildHero(h, i, meta));
  run.heroes.forEach((h, i) => {
    for (const g of Object.values(h.gear)) if (g?.effect) battle.addEffect(GEAR_EFFECTS[g.effect].hooks, heroes[i]);
  });
  for (const u of heroes) battle.spawn(u);
  for (const id of waveEnemies(run.wave, rng)) battle.spawn(makeEnemy(id, run.wave));
  battle.start();
  saveRng(run, rng);
  return { battle, rng };
}

export function choiceCount(run: RunState, meta: MetaState): number {
  let n = 3 + (meta.upgrades.grace ? 1 : 0);
  for (const id of run.bargains) n += RELIC_MAP[id].extraChoices ?? 0;
  return n;
}

/** Rewards after a normal wave: a mix of level-ups, relics and gear. */
export function rollRewards(run: RunState, meta: MetaState, rng: Rng): Reward[] {
  const n = choiceCount(run, meta);
  const boss = isBossWave(run.wave - 1);
  const out: Reward[] = [];
  const relicPool = rng.shuffle(RELICS.filter((r) => !run.relics.includes(r.id)).map((r) => r.id));
  const usedHeroes = new Set<number>();
  const pickHero = () => {
    const free = run.heroes.map((_, i) => i).filter((i) => !usedHeroes.has(i));
    const i = rng.pick(free.length ? free : run.heroes.map((_, j) => j));
    usedHeroes.add(i);
    return i;
  };
  for (let i = 0; i < n; i++) {
    const kind = boss ? 'relic' : rng.weighted(['level', 'relic', 'gear'] as const, (k) => (k === 'level' ? 4 : k === 'gear' ? 4 : 2));
    if (kind === 'relic' && relicPool.length) {
      out.push({ kind: 'relic', id: relicPool.pop()! });
    } else if (kind === 'gear' || (kind === 'relic' && !relicPool.length && rng.chance(0.5))) {
      const hero = pickHero();
      out.push({ kind: 'gear', hero, gear: rollGear(rng, run.heroes[hero].cls, run.wave) });
    } else {
      out.push({ kind: 'level', hero: pickHero() });
    }
  }
  return out;
}

export function rollBargains(run: RunState, rng: Rng): Reward[] {
  const pool = rng.shuffle(BARGAINS.filter((b) => !run.bargains.includes(b.id)).map((b) => b.id));
  return pool.slice(0, 2).map((id) => ({ kind: 'bargain', id }));
}

/** A Dark Bargain is offered midway through each region. */
export function bargainDue(run: RunState): boolean {
  return (run.wave - 1) % 10 === 5 && run.bargains.length < BARGAINS.length;
}

export function applyReward(run: RunState, r: Reward): void {
  switch (r.kind) {
    case 'level':
      run.heroes[r.hero].level++;
      break;
    case 'gear':
      run.heroes[r.hero].gear[r.gear.slot] = r.gear;
      break;
    case 'relic':
      run.relics.push(r.id);
      RELIC_MAP[r.id].onAcquire?.(run);
      break;
    case 'bargain':
      run.bargains.push(r.id);
      RELIC_MAP[r.id].onAcquire?.(run);
      break;
  }
}

/** Called after a won wave: bosses grant every hero a level. */
export function completeWave(run: RunState, battle: Battle): void {
  run.kills += battle.kills;
  if (battle.flaskUsed) run.flaskCharges = battle.flaskCharges;
  if (isBossWave(run.wave)) {
    run.bossesSlain++;
    for (const h of run.heroes) h.level++;
  }
  run.wave++;
}

export function embersEarned(run: RunState, meta: MetaState): number {
  const cleared = run.wave - 1;
  let base = cleared * 4 + Math.pow(cleared, 1.35) + run.bossesSlain * 40 + Math.floor(run.kills / 4);
  let mult = 1 + (meta.upgrades.kindling ?? 0) * 0.1;
  for (const id of run.relics) mult += RELIC_MAP[id].emberBonus ?? 0;
  base *= mult;
  return Math.round(base);
}
