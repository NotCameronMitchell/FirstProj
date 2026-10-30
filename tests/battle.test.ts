import { describe, expect, it } from 'vitest';
import { Battle } from '../src/combat/battle';
import { BOSS_POOL, ENEMIES } from '../src/data/enemies';
import { ABILITIES, HEROES, HERO_IDS, WEAPONS } from '../src/data/heroes';
import { autoBattle } from '../src/game/ai';
import { BOSSES_PER_CYCLE, STAGES_PER_CYCLE, buildBattle, cycleBosses, finishFight, heroStats, newRun, stageEnemies, stageInfo } from '../src/game/run';
import { freshMeta } from '../src/game/storage';
import { Rng } from '../src/rng';
import type { HeroId } from '../src/types';
import { simulateRun } from './helpers';

function party(weapons: Partial<Record<HeroId, string>> = {}) {
  const run = newRun(freshMeta(), 1);
  return run.heroes.map((h) => ({ id: h.id, hp: 999, ...heroStats(h, freshMeta()), ranks: {}, weapon: weapons[h.id] ?? h.weapon }));
}

describe('battle engine', () => {
  it('every fight ends', () => {
    for (let stage = 0; stage < 48; stage += 3) {
      const run = newRun(freshMeta(), stage);
      run.stage = stage;
      const b = buildBattle(run, freshMeta());
      autoBattle(b, 200);
      expect(b.outcome).not.toBeNull();
    }
  });

  it('every hero ability and weapon can be used', () => {
    for (const w of Object.keys(WEAPONS)) {
      const b = new Battle(party({ [WEAPONS[w].hero]: w }), [{ id: 'director', hpMult: 50, atkMult: 0.1 }], 3);
      const u = b.hero(WEAPONS[w].hero)!;
      expect(b.act(u.uid, 'attack', b.enemies()[0].uid)).toBe(true);
    }
    for (const id of HERO_IDS) {
      for (const ab of [...HEROES[id].abilities, HEROES[id].ultimate]) {
        const b = new Battle(party(), [{ id: 'manager', hpMult: 50, atkMult: 0.1 }, { id: 'nic_pouch', hpMult: 50, atkMult: 0.1 }], 5);
        const u = b.hero(id)!;
        u.cd[ab] = 0;
        expect(b.act(u.uid, ab, b.enemies()[0].uid), ab).toBe(true);
        expect(b.events.some((e) => e.t === 'cast' && e.name === ABILITIES[ab].name)).toBe(true);
      }
    }
  });

  it('a hero acts once per round, plus one quick buff', () => {
    const b = new Battle(party(), [{ id: 'manager', hpMult: 50, atkMult: 0.1 }], 1);
    for (const [hero, buff, other] of [['cole', 'golf_lesson', 'cft'], ['james', 'peptide_rage', 'fogo']] as const) {
      const u = b.hero(hero)!;
      expect(b.act(u.uid, buff)).toBe(true);
      expect(b.act(u.uid, other)).toBe(false);
      expect(b.act(u.uid, 'attack')).toBe(true);
      expect(b.act(u.uid, 'attack')).toBe(false);
    }
  });

  it('ultimates are ready on turn 4', () => {
    const b = new Battle(party(), [{ id: 'manager', hpMult: 100, atkMult: 0.01 }], 1);
    const cam = b.hero('cam')!;
    const ultReady = () => b.actions(cam).find((a) => a.id === 'nissan_titan')!.ready;
    for (let round = 1; round <= 3; round++) {
      expect(ultReady()).toBe(false);
      while (b.round === round) b.phase === 'hero' ? b.act(b.ready()[0].uid, 'attack') : b.enemyStep();
    }
    expect(ultReady()).toBe(true);
  });

  it('Cole comes back once per fight', () => {
    const b = new Battle(party(), [{ id: 'manager', hpMult: 100, atkMult: 0.01 }], 1);
    const cole = b.hero('cole')!;
    b.damage(cole, 9999, 'hit');
    expect(cole.alive).toBe(false);
    while (b.phase === 'hero') b.act(b.ready()[0].uid, 'attack');
    while (b.phase === 'enemy') b.enemyStep();
    expect(cole.alive).toBe(true);
    expect(cole.hp).toBe(cole.maxHp);
    b.damage(cole, 99999, 'hit');
    expect(cole.reviveNext).toBe(false);
  });

  it('Mason goes next when everyone is low, but it is capped', () => {
    const b = new Battle(party(), [{ id: 'manager', hpMult: 2, atkMult: 0.01 }, { id: 'nic_pouch', hpMult: 20, atkMult: 0.01 }], 1);
    for (const h of b.heroes()) b.damage(h, Math.ceil(h.maxHp * 0.9), 'hit');
    b.act(b.ready()[0].uid, 'attack');
    expect(b.hero('mason')!.alive).toBe(false);
    expect(b.events.some((e) => e.t === 'banner' && e.text === 'WE GO NEXT')).toBe(true);
    const boom = b.events.filter((e) => e.t === 'dmg' && e.kind === 'boom') as { uid: number; amount: number }[];
    for (const e of b.enemies()) {
      const hit = boom.find((x) => x.uid === e.uid)!;
      expect(hit.amount).toBeLessThanOrEqual(Math.round(e.maxHp * (e.boss ? 0.25 : 0.45)));
      expect(hit.amount).toBeGreaterThan(0);
    }
    expect(b.enemies().every((e) => e.alive)).toBe(true);
  });

  it('JimmyTrains bulks James up until it wears off', () => {
    const b = new Battle(party(), [{ id: 'manager', hpMult: 100, atkMult: 0.01 }], 1);
    const james = b.hero('james')!;
    james.altSprite = 'james_buff';
    james.cd.jimmytrains = 0;
    b.act(james.uid, 'jimmytrains');
    expect(james.sprite).toBe('james_buff');
    for (let i = 0; i < 400 && b.has(james, 'reflect'); i++) b.phase === 'hero' ? b.act(b.ready()[0]?.uid ?? -1, 'attack') || b.enemyStep() : b.enemyStep();
    expect(james.sprite).toBe(james.baseSprite);
  });

  it('stage layout: 3 random bosses per cycle, each after a minion fight, then the burger joint', () => {
    expect(STAGES_PER_CYCLE).toBe(BOSSES_PER_CYCLE * 2 + 1);
    for (const seed of [1, 2, 3, 99]) {
      const kinds = Array.from({ length: STAGES_PER_CYCLE }, (_, i) => stageInfo(i, seed).kind);
      expect(kinds.filter((k) => k === 'boss')).toHaveLength(BOSSES_PER_CYCLE);
      expect(kinds[STAGES_PER_CYCLE - 1]).toBe('bonus');
      expect(stageInfo(STAGES_PER_CYCLE, seed).kind).toBe('minion');
      const bosses = cycleBosses(seed, 0);
      expect(new Set(bosses).size).toBe(BOSSES_PER_CYCLE);
      for (const id of bosses) expect(BOSS_POOL).toContain(id);
      expect([1, 3, 5].map((i) => stageInfo(i, seed).boss)).toEqual(bosses);
    }
    // Different runs see different bosses.
    expect(new Set(Array.from({ length: 20 }, (_, s) => cycleBosses(s, 0).join())).size).toBeGreaterThan(1);
    const rng = new Rng(1);
    for (let s = 0; s < 32; s++) for (const id of stageEnemies(s, rng, 5)) expect(ENEMIES[id]).toBeDefined();
  });

  it('boss wins heal fully, always drop loot and give an extra upgrade pick', () => {
    const run = newRun(freshMeta(), 4);
    run.stage = 1;
    for (const h of run.heroes) h.hp = 5;
    const b = buildBattle(run, freshMeta());
    const res = finishFight(run, b, freshMeta());
    expect(res.fullHeal).toBe(true);
    expect(res.picks).toBe(4);
    expect(res.weapon).toBeDefined();
    for (const h of run.heroes) expect(h.hp).toBe(heroStats(h, freshMeta()).maxHp);
  });

  it('a party can be any heroes from the roster', () => {
    const run = newRun(freshMeta(), 9, {}, ['james', 'cam']);
    const b = buildBattle(run, freshMeta());
    expect(b.heroes().map((h) => h.key)).toEqual(['james', 'cam']);
    autoBattle(b, 200);
    expect(b.outcome).not.toBeNull();
  });

  it('the first fight is winnable', () => {
    for (let i = 0; i < 20; i++) expect(simulateRun(100 + i, freshMeta(), 1).cleared).toBe(1);
  });

  it('runs are deterministic for a seed', () => {
    expect(simulateRun(42, freshMeta(), 10).rounds).toEqual(simulateRun(42, freshMeta(), 10).rounds);
  });
});
