import { CLASSES, CLASS_IDS } from '../src/data/classes';
import { applyReward, bargainDue, buildBattle, completeWave, newRun, rollBargains, rollRewards, runRng, saveRng } from '../src/game/run';
import { freshMeta } from '../src/game/storage';
import { Rng } from '../src/rng';
import type { ClassId, MetaState } from '../src/types';

export function party(ids: ClassId[]) {
  return ids.map((cls) => ({ cls, row: CLASSES[cls].row }));
}

export function randomParty(rng: Rng, size = 4): ClassId[] {
  return rng.shuffle(CLASS_IDS.slice()).slice(0, size);
}

/** Plays a whole run headlessly, choosing rewards at random. Returns waves cleared and fight times. */
export function simulateRun(ids: ClassId[], seed: number, meta: MetaState = freshMeta(), maxWave = 80) {
  const run = newRun(party(ids), meta, seed);
  const times: number[] = [];
  while (run.wave <= maxWave) {
    const { battle } = buildBattle(run, meta);
    let steps = 0;
    while (!battle.outcome && steps < 30 * 240) {
      battle.step(1 / 30);
      steps++;
    }
    times.push(battle.time);
    if (battle.outcome !== 'win') break;
    completeWave(run, battle);
    const rng = runRng(run);
    const opts = rollRewards(run, meta, rng);
    applyReward(run, rng.pick(opts));
    if (bargainDue(run) && rng.chance(0.5)) {
      const b = rollBargains(run, rng);
      if (b.length) applyReward(run, rng.pick(b));
    }
    saveRng(run, rng);
  }
  return { cleared: run.wave - 1, times, run };
}

export function upgradedMeta(level: number): MetaState {
  const m = freshMeta();
  m.upgrades = { vigor: level, strength: level, endurance: Math.min(5, level), fortune: Math.min(4, level) };
  if (level >= 5) m.upgrades.flask = 1;
  return m;
}
