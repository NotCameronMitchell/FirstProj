import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_MAP, rollEvent } from '../src/data/events';
import { RIVAL_BOSS, RIVAL_EMPOWERED, STAGES_PER_CYCLE, buildBattle, finishFight, heroStats, newRun, scaling, stageInfo } from '../src/game/run';
import { freshMeta } from '../src/game/storage';
import { Rng } from '../src/rng';
import { GRIDS } from '../src/render/spriteData';
import type { HeroId, RunState } from '../src/types';

const meta = freshMeta();
const fresh = () => newRun(meta, 7);
const choose = (run: RunState, id: string, i: number) => EVENT_MAP[id].choices[i].apply(run, meta);
const unit = (run: RunState, id: HeroId) => buildBattle(run, meta).hero(id)!;
const baseAtk = (run: RunState, id: HeroId) => heroStats(run.heroes.find((h) => h.id === id)!, meta).atk;

describe('random events', () => {
  it('every event has art and at least one choice', () => {
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      if ('phone' in e.art) expect(GRIDS[e.art.phone]).toBeDefined();
    }
  });

  it('Renekton: accepting gives +5 attack for one fight; hanging up empowers the rival boss once', () => {
    const run = fresh();
    choose(run, 'renekton', 0);
    for (const h of run.heroes) {
      const u = unit(run, h.id);
      expect(u.atk).toBeCloseTo(baseAtk(run, h.id) + 5);
      expect(u.statuses.some((s) => s.kind === 'renekton')).toBe(true);
    }
    finishFight(run, buildBattle(run, meta), meta);
    expect(unit(run, 'cam').atk).toBeCloseTo(baseAtk(run, 'cam'));

    const run2 = fresh();
    choose(run2, 'renekton', 1);
    // The rival's next fight, wherever the run's boss draw puts it.
    run2.stage = Array.from({ length: 100 }, (_, s) => s).find((s) => stageInfo(s, run2.seed).kind === 'boss' && stageInfo(s, run2.seed).boss === RIVAL_BOSS)!;
    const rival = buildBattle(run2, meta).enemies().find((e) => e.key === RIVAL_BOSS)!;
    expect(rival.name).toContain('Empowered');
    expect(rival.maxHp).toBe(Math.round(310 * scaling(run2.stage).hp * RIVAL_EMPOWERED.hp));
    finishFight(run2, buildBattle(run2, meta), meta);
    expect(run2.rivalEmpowered).toBe(false);
  });

  it('The Local: going heals everyone and adds a 5% shield; skipping costs Cole 5%', () => {
    const run = fresh();
    for (const h of run.heroes) h.hp = 10;
    choose(run, 'the_local', 0);
    for (const h of run.heroes) {
      const u = unit(run, h.id);
      expect(u.hp).toBe(u.maxHp);
      expect(u.shield).toBe(Math.round(u.maxHp * 0.05));
    }
    const run2 = fresh();
    const cole = run2.heroes.find((h) => h.id === 'cole')!;
    const before = cole.hp;
    choose(run2, 'the_local', 1);
    expect(cole.hp).toBe(before - Math.round(heroStats(cole, meta).maxHp * 0.05));
  });

  it('Pool party: going gives +5% max HP; skipping gives Mason +10 attack for the run', () => {
    const run = fresh();
    const max = heroStats(run.heroes[0], meta).maxHp;
    choose(run, 'pool_party', 0);
    expect(heroStats(run.heroes[0], meta).maxHp).toBe(Math.round(max * 1.05));
    const run2 = fresh();
    const atk = baseAtk(run2, 'mason');
    choose(run2, 'pool_party', 1);
    expect(baseAtk(run2, 'mason')).toBeCloseTo(atk + 10);
  });

  it('OTR raffle: Cole +20 attack next fight, everyone else loses 5%', () => {
    const run = fresh();
    choose(run, 'otr_raffle', 0);
    expect(unit(run, 'cole').atk).toBeCloseTo(baseAtk(run, 'cole') + 20);
    for (const h of run.heroes) if (h.id !== 'cole') expect(h.hp).toBe(heroStats(h, meta).maxHp - Math.round(heroStats(h, meta).maxHp * 0.05));
  });

  it('Cam on the Rift: Tilted for the next fight', () => {
    const run = fresh();
    choose(run, 'rift', 0);
    const cam = unit(run, 'cam');
    const st = heroStats(run.heroes.find((h) => h.id === 'cam')!, meta);
    expect(cam.maxHp).toBe(Math.round(st.maxHp * 0.95));
    expect(cam.atk).toBeCloseTo(st.atk - 5);
    expect(cam.statuses.some((s) => s.kind === 'tilted')).toBe(true);
  });

  it('Holiday Party: +15 attack next fight, or +5% max health for the run', () => {
    const run = fresh();
    choose(run, 'holiday_party', 0);
    for (const h of run.heroes) expect(unit(run, h.id).atk).toBeCloseTo(baseAtk(run, h.id) + 15);
    const run2 = fresh();
    const max = heroStats(run2.heroes[0], meta).maxHp;
    choose(run2, 'holiday_party', 1);
    expect(heroStats(run2.heroes[0], meta).maxHp).toBe(Math.round(max * 1.05));
  });

  it('events about a hero only come up when that hero is in the party', () => {
    const run = newRun(meta, 7, {}, ['james', 'mason', 'cam']);
    run.stage = 1;
    const rng = new Rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const e = rollEvent(run, rng);
      if (e) seen.add(e.id);
    }
    expect(seen.has('the_local')).toBe(false);
    expect(seen.has('otr_raffle')).toBe(false);
    expect(seen.has('rift')).toBe(true);
  });

  it('events never repeat within a cycle and never come before the first fight', () => {
    const run = fresh();
    expect(rollEvent(run, new Rng(1))).toBeNull();
    run.stage = 1;
    const seen: string[] = [];
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const e = rollEvent(run, rng);
      if (e) seen.push(e.id);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(EVENTS.length);
    run.stage = STAGES_PER_CYCLE + 1;
    expect(Array.from({ length: 50 }, () => rollEvent(run, rng)).some(Boolean)).toBe(true);
  });
});
