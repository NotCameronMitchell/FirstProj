import { Battle, type EnemySetup, type HeroSetup } from '../combat/battle';
import { BOSS_POOL, BURGER_CREW, ENEMIES, MINIONS_EARLY, MINIONS_LATE } from '../data/enemies';
import { ABILITIES, HEROES, HERO_IDS, MAX_RANK, STARTING_WEAPON, WEAPONS, rankable, roman } from '../data/heroes';
import { metaLevel } from '../data/meta';
import { outfitOf, outfitSprite, outfitUltSprite } from '../data/outfits';
import { Rng } from '../rng';
import type { HeroId, HeroState, MetaState, RunState, ShopItem, StatKey, Upgrade } from '../types';

export const RUN_VERSION = 1;
/** Minion fights before each boss. */
export const MINIONS_PER_BOSS = 1;
/** Bosses drawn from the pool each cycle. */
export const BOSSES_PER_CYCLE = 3;
/** Each cycle: (minion fights, boss) for each boss drawn, then the bonus fight. */
export const STAGES_PER_CYCLE = BOSSES_PER_CYCLE * (MINIONS_PER_BOSS + 1) + 1;

/** The bosses a run faces in a cycle: a random draw from the pool, fixed by the run's seed. */
export function cycleBosses(seed: number, cycle: number): string[] {
  const rng = new Rng((seed ^ Math.imul(cycle + 1, 0x9e3779b1)) >>> 0);
  return rng.shuffle([...BOSS_POOL]).slice(0, Math.min(BOSSES_PER_CYCLE, BOSS_POOL.length));
}

export interface StageInfo {
  kind: 'minion' | 'boss' | 'bonus';
  cycle: number;
  index: number; // within the cycle
  boss?: string;
  title: string;
}

/** What a stage is. Pass the run's seed so the right bosses are drawn. */
export function stageInfo(stage: number, seed = 0): StageInfo {
  const cycle = Math.floor(stage / STAGES_PER_CYCLE);
  const index = stage % STAGES_PER_CYCLE;
  if (index === STAGES_PER_CYCLE - 1) return { kind: 'bonus', cycle, index, title: "Villiam Burginson's" };
  const group = MINIONS_PER_BOSS + 1;
  const bosses = cycleBosses(seed, cycle);
  const boss = bosses[Math.floor(index / group) % bosses.length];
  if (index % group === MINIONS_PER_BOSS) return { kind: 'boss', cycle, index, boss, title: ENEMIES[boss].name };
  return { kind: 'minion', cycle, index, boss, title: `The Office ${Math.floor(index / group) + 1}-${(index % group) + 1}` };
}

/** The burger crew is scaled like this many stages into the cycle (it's the last stage, but shouldn't be the hardest). */
export const BURGER_LEVEL = 4;

/** Enemy stat multipliers for a stage. */
export function scaling(stage: number): { hp: number; atk: number } {
  const { cycle, index, kind } = stageInfo(stage);
  const i = kind === 'bonus' ? BURGER_LEVEL : index;
  return { hp: (0.8 + 1.0 * i) * Math.pow(2.4, cycle), atk: (1.4 + 0.6 * i) * Math.pow(2.1, cycle) };
}

export function stageEnemies(stage: number, rng: Rng, seed = 0): string[] {
  const info = stageInfo(stage, seed);
  if (info.kind === 'bonus') return [...BURGER_CREW, 'crew'];
  const bossNum = Math.floor(info.index / (MINIONS_PER_BOSS + 1));
  const pool = bossNum < 2 && info.cycle === 0 ? MINIONS_EARLY : [...MINIONS_EARLY, ...MINIONS_LATE];
  if (info.kind === 'boss') return [info.boss!, rng.pick(pool), rng.pick(pool)];
  const n = Math.min(5, 2 + Math.floor(bossNum / 2) + (info.cycle > 0 ? 1 : 0));
  return Array.from({ length: n }, () => rng.pick(pool));
}

export function runRng(run: RunState): Rng {
  return new Rng(run.rngState);
}

export function saveRng(run: RunState, rng: Rng): void {
  run.rngState = rng.state;
}

/** The sprite a hero wears this run. */
export function heroSprite(run: RunState | null, hero: HeroId): string {
  return outfitSprite(outfitOf(hero, run?.outfits));
}

export function newRun(meta: MetaState, seed: number, outfits: Partial<Record<HeroId, string>> = {}, party: HeroId[] = HERO_IDS): RunState {
  const rng = new Rng(seed);
  const heroes: HeroState[] = party.map((id) => {
    const h: HeroState = { id, hp: 0, hpMult: 1, atkMult: 1, crit: 0, dodge: 0, def: 0, ranks: {}, weapon: STARTING_WEAPON[id], weapons: [STARTING_WEAPON[id]] };
    for (let i = 0; i < metaLevel(meta.upgrades, 'mentor'); i++) {
      const opts = rankable(id).filter((a) => (h.ranks[a] ?? 1) < MAX_RANK);
      const a = rng.pick(opts);
      h.ranks[a] = (h.ranks[a] ?? 1) + 1;
    }
    return h;
  });
  const run: RunState = {
    version: RUN_VERSION,
    seed,
    rngState: rng.state,
    stage: 0,
    heroes,
    pto: 15 * metaLevel(meta.upgrades, 'signing'),
    kills: 0,
    fightsWon: 0,
    sauceEarned: 0,
    secondWind: metaLevel(meta.upgrades, 'second_wind') > 0,
    startedAt: Date.now(),
    outfits: { ...outfits },
  };
  for (const h of run.heroes) h.hp = heroStats(h, meta).maxHp;
  return run;
}

export function heroStats(h: HeroState, meta: MetaState): { maxHp: number; atk: number; def: number; crit: number; dodge: number } {
  const d = HEROES[h.id];
  return {
    maxHp: Math.round(d.hp * h.hpMult * (1 + 0.06 * metaLevel(meta.upgrades, 'vet'))),
    atk: d.atk * h.atkMult * (1 + 0.05 * metaLevel(meta.upgrades, 'sauce')) + (h.atkFlat ?? 0),
    def: Math.min(0.5, d.def + h.def),
    crit: Math.min(0.6, d.crit + h.crit),
    dodge: Math.min(0.4, d.dodge + h.dodge),
  };
}

/** The boss who gets stronger when you hang up on Renekton, and by how much. */
export const RIVAL_BOSS = 'director';
export const RIVAL_EMPOWERED = { hp: 1.5, atk: 1.3 };

export function buildBattle(run: RunState, meta: MetaState): Battle {
  const rng = runRng(run);
  const ids = stageEnemies(run.stage, rng, run.seed);
  const s = scaling(run.stage);
  const enemies: EnemySetup[] = ids.map((id) =>
    id === RIVAL_BOSS && run.rivalEmpowered ? { id, hpMult: s.hp * RIVAL_EMPOWERED.hp, atkMult: s.atk * RIVAL_EMPOWERED.atk, suffix: 'Empowered' } : { id, hpMult: s.hp, atkMult: s.atk },
  );
  const heroes: HeroSetup[] = run.heroes.map((h) => {
    const o = outfitOf(h.id, run.outfits);
    const st = heroStats(h, meta);
    const mods = (run.nextFight ?? []).filter((m) => m.hero === 'all' || m.hero === h.id);
    const maxHp = Math.max(1, Math.round(st.maxHp * (1 + mods.reduce((a, m) => a + (m.hpPct ?? 0), 0))));
    return {
      id: h.id,
      ...st,
      hp: Math.min(h.hp, maxHp),
      maxHp,
      atk: Math.max(1, st.atk + mods.reduce((a, m) => a + (m.atk ?? 0), 0)),
      shield: maxHp * mods.reduce((a, m) => a + (m.shieldPct ?? 0), 0),
      tags: mods.flatMap((m) => (m.tag ? [m.tag] : [])),
      ranks: h.ranks,
      weapon: h.weapon,
      sprite: outfitSprite(o),
      altSprite: outfitUltSprite(o),
    };
  });
  // The run's rng isn't advanced here, so a fight interrupted by closing the
  // app replays with the same enemies when the run is resumed.
  return new Battle(heroes, enemies, rng.int(0, 2 ** 31));
}

export interface FightResult {
  pto: number;
  sauce: number;
  weapon?: { hero: HeroId; id: string };
  /** Boss wins heal the party to full. */
  fullHeal: boolean;
  /** Upgrade picks after this fight (bosses give an extra one). */
  picks: number;
}

/** Applies a won fight to the run: health, currency and loot. */
export function finishFight(run: RunState, battle: Battle, meta: MetaState): FightResult {
  const rng = runRng(run);
  const info = stageInfo(run.stage, run.seed);
  const boss = info.kind === 'boss';
  run.nextFight = [];
  if (info.boss === RIVAL_BOSS && boss) run.rivalEmpowered = false;
  const healPct = 0.2 + 0.08 * metaLevel(meta.upgrades, 'benefits');
  for (const h of run.heroes) {
    const u = battle.hero(h.id)!;
    const max = heroStats(h, meta).maxHp;
    if (boss) h.hp = max;
    else h.hp = u.alive ? Math.min(max, u.hp + Math.round(max * healPct)) : Math.round(max * 0.3);
  }
  run.kills += battle.kills;
  run.fightsWon++;
  let pto = boss ? 30 + 8 * info.cycle : info.kind === 'bonus' ? 25 : 9 + 2 * info.cycle;
  let sauce = 0;
  if (info.kind === 'bonus') {
    sauce = 20 + 10 * info.cycle + 5 * battle.heroes().filter((u) => u.alive).length;
    run.sauceEarned += sauce;
  }
  let weapon: FightResult['weapon'];
  // Bosses always drop a weapon (or extra PTO once you own them all); the burger joint sometimes does.
  if (boss || (info.kind === 'bonus' && rng.chance(0.6))) {
    const opts = unownedWeapons(run);
    if (opts.length) {
      const id = rng.pick(opts);
      const h = run.heroes.find((x) => x.id === WEAPONS[id].hero)!;
      h.weapons.push(id);
      weapon = { hero: h.id, id };
    } else if (boss) pto += 15;
  }
  run.pto += pto;
  saveRng(run, rng);
  return { pto, sauce, weapon, fullHeal: boss, picks: boss ? 4 : 3 };
}

/** Weapons not yet owned by heroes in the party. */
export function unownedWeapons(run: RunState): string[] {
  return Object.keys(WEAPONS).filter((id) => {
    const h = run.heroes.find((x) => x.id === WEAPONS[id].hero);
    return h && !h.weapons.includes(id);
  });
}

// ---------------------------------------------------------------- upgrades
interface StatUp {
  stat: StatKey;
  amount: number;
  name: string;
}

const STAT_UPS: StatUp[] = [
  { stat: 'hp', amount: 0.15, name: 'Gym Membership' },
  { stat: 'atk', amount: 0.12, name: 'Pre-Workout' },
  { stat: 'crit', amount: 0.06, name: 'Lucky Socks' },
  { stat: 'dodge', amount: 0.05, name: 'New Kicks' },
  { stat: 'def', amount: 0.05, name: 'Ergonomic Chair' },
];
const PARTY_UPS: StatUp[] = [
  { stat: 'hp', amount: 0.07, name: 'Team Lunch' },
  { stat: 'atk', amount: 0.06, name: 'Pizza Party' },
];

export function statText(stat: StatKey, amount: number): string {
  const p = `+${Math.round(amount * 100)}%`;
  return { hp: `${p} max HP`, atk: `${p} damage`, crit: `${p} crit chance`, dodge: `${p} dodge`, def: `${p} damage reduction` }[stat];
}

function rankOptions(run: RunState): Upgrade[] {
  const out: Upgrade[] = [];
  for (const h of run.heroes) for (const a of rankable(h.id)) if ((h.ranks[a] ?? 1) < MAX_RANK) out.push({ kind: 'rank', hero: h.id, ability: a });
  return out;
}

/**
 * Three choices. The first pick after every win only offers ability upgrades;
 * after a boss (four picks) the first two do.
 */
export function rollDraft(run: RunState, rng: Rng, step: number, total = 3): Upgrade[] {
  const ranks = rng.shuffle(rankOptions(run));
  const stats: Upgrade[] = [];
  for (const h of run.heroes) for (const s of STAT_UPS) stats.push({ kind: 'stat', hero: h.id, ...s });
  for (const s of PARTY_UPS) stats.push({ kind: 'stat', hero: 'all', ...s });
  rng.shuffle(stats);
  if ((step === 0 || (total > 3 && step === 1)) && ranks.length >= 3) return ranks.slice(0, 3);
  const pool = [...ranks.slice(0, 2), ...stats.slice(0, 3)];
  return rng.shuffle(pool).slice(0, 3);
}

export function upgradeText(u: Upgrade): { title: string; desc: string } {
  if (u.kind === 'stat') return { title: u.name, desc: `${u.hero === 'all' ? 'Whole party' : HEROES[u.hero].name}: ${statText(u.stat, u.amount)}` };
  const ab = ABILITIES[u.ability];
  return { title: `${ab.name}`, desc: ab.desc(1) };
}

export function rankOf(run: RunState, hero: HeroId, ability: string): number {
  return run.heroes.find((h) => h.id === hero)!.ranks[ability] ?? 1;
}

export function applyStat(run: RunState, meta: MetaState, hero: HeroId | 'all', stat: StatKey, amount: number): void {
  for (const h of run.heroes) {
    if (hero !== 'all' && h.id !== hero) continue;
    const before = heroStats(h, meta).maxHp;
    if (stat === 'hp') h.hpMult += amount;
    else if (stat === 'atk') h.atkMult += amount;
    else h[stat] += amount;
    h.hp += heroStats(h, meta).maxHp - before;
  }
}

export function applyUpgrade(run: RunState, meta: MetaState, u: Upgrade): void {
  if (u.kind === 'stat') applyStat(run, meta, u.hero, u.stat, u.amount);
  else {
    const h = run.heroes.find((x) => x.id === u.hero)!;
    h.ranks[u.ability] = Math.min(MAX_RANK, (h.ranks[u.ability] ?? 1) + 1);
  }
}

// ---------------------------------------------------------------- shop
export function rollShop(run: RunState, meta: MetaState, rng: Rng): ShopItem[] {
  const items: ShopItem[] = [{ kind: 'heal', name: 'Break Room Snacks', desc: 'Heal the whole party 40%.', cost: 10 }];
  const weapons = rng.shuffle(unownedWeapons(run)).slice(0, 2);
  for (const id of weapons) {
    const w = WEAPONS[id];
    items.push({ kind: 'weapon', name: w.name, desc: `${HEROES[w.hero].name}'s weapon. ${w.desc}`, cost: w.cost + 3 * stageInfo(run.stage, run.seed).cycle, hero: w.hero, weapon: id });
  }
  const extras = 3 + metaLevel(meta.upgrades, 'menu') - weapons.length + 1;
  for (let i = 0; i < extras; i++) {
    const h = rng.pick(run.heroes);
    const roll = rng.next();
    if (roll < 0.35) {
      const opts = rankable(h.id).filter((a) => (h.ranks[a] ?? 1) < MAX_RANK);
      if (opts.length) {
        const a = rng.pick(opts);
        const r = h.ranks[a] ?? 1;
        items.push({ kind: 'rank', name: `Training: ${ABILITIES[a].name}`, desc: `${HEROES[h.id].name}: rank ${roman(r)} → ${roman(r + 1)}`, cost: 22, hero: h.id, ability: a });
        continue;
      }
    }
    const s = rng.pick(STAT_UPS);
    const amount = s.amount * 0.8;
    items.push({ kind: 'stat', name: s.name, desc: `${HEROES[h.id].name}: ${statText(s.stat, amount)}`, cost: 14, hero: h.id, stat: s.stat, amount });
  }
  return items;
}

export function buyItem(run: RunState, meta: MetaState, item: ShopItem): boolean {
  if (item.sold || run.pto < item.cost) return false;
  if (item.kind === 'rank') {
    const h = run.heroes.find((x) => x.id === item.hero)!;
    if ((h.ranks[item.ability!] ?? 1) >= MAX_RANK) return false;
    h.ranks[item.ability!] = (h.ranks[item.ability!] ?? 1) + 1;
  } else if (item.kind === 'stat') applyStat(run, meta, item.hero!, item.stat!, item.amount!);
  else if (item.kind === 'weapon') {
    const h = run.heroes.find((x) => x.id === item.hero)!;
    if (!h.weapons.includes(item.weapon!)) h.weapons.push(item.weapon!);
    h.weapon = item.weapon!;
  } else {
    for (const h of run.heroes) {
      const max = heroStats(h, meta).maxHp;
      h.hp = Math.min(max, h.hp + Math.round(max * 0.4));
    }
  }
  run.pto -= item.cost;
  item.sold = true;
  return true;
}

export const REROLL_COST = 5;

/** Revives the party after a wipe if Second Wind is still available. */
export function useSecondWind(run: RunState, meta: MetaState): boolean {
  if (!run.secondWind) return false;
  run.secondWind = false;
  for (const h of run.heroes) h.hp = Math.round(heroStats(h, meta).maxHp * 0.4);
  return true;
}
