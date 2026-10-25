import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../src/data/classes';
import { REGIONS, makeEnemy } from '../src/data/enemies';
import { buildBattle, newRun, waveEnemies } from '../src/game/run';
import { freshMeta } from '../src/game/storage';
import { Rng } from '../src/rng';
import { party, randomParty, simulateRun } from './helpers';

describe('battle engine', () => {
  it('every battle ends within the time limit', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 20; i++) {
      const run = newRun(party(randomParty(rng)), freshMeta(), i);
      run.wave = 1 + i * 3;
      const { battle } = buildBattle(run, freshMeta());
      let steps = 0;
      while (!battle.outcome && steps < 30 * 300) {
        battle.step(1 / 30);
        steps++;
      }
      expect(battle.outcome).not.toBeNull();
    }
  });

  it('every class can be built and casts its skill', () => {
    for (const cls of CLASS_IDS) {
      const run = newRun(party([cls, 'knight']), freshMeta(), 3);
      const { battle } = buildBattle(run, freshMeta());
      for (let i = 0; i < 30 * 20 && !battle.outcome; i++) battle.step(1 / 30);
      expect(battle.events.some((e) => e.t === 'cast')).toBe(true);
    }
  });

  it('wave 1 is winnable by any party of four', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 25; i++) {
      const { cleared } = simulateRun(randomParty(rng), 100 + i, freshMeta(), 1);
      expect(cleared).toBe(1);
    }
  });

  it('generates enemies for every region and boss', () => {
    const rng = new Rng(1);
    for (let w = 1; w <= REGIONS.length * 10; w++) {
      const ids = waveEnemies(w, rng);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(makeEnemy(id, w).maxHp).toBeGreaterThan(0);
    }
  });

  it('runs are deterministic for a seed', () => {
    const a = simulateRun(['knight', 'priest', 'ranger', 'sorcerer'], 42);
    const b = simulateRun(['knight', 'priest', 'ranger', 'sorcerer'], 42);
    expect(a.cleared).toBe(b.cleared);
    expect(a.times).toEqual(b.times);
  });
});
