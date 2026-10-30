import { rollEvent } from '../src/data/events';
import { autoBattle } from '../src/game/ai';
import { applyUpgrade, buildBattle, buyItem, finishFight, newRun, rollDraft, rollShop, runRng, saveRng, useSecondWind } from '../src/game/run';
import { freshMeta } from '../src/game/storage';
import type { MetaState } from '../src/types';

/** Plays a whole run headlessly with the AI, picking upgrades and shop items at random. */
export function simulateRun(seed: number, meta: MetaState = freshMeta(), maxStage = 64) {
  const run = newRun(meta, seed);
  const rounds: number[] = [];
  while (run.stage < maxStage) {
    const battle = buildBattle(run, meta);
    const outcome = autoBattle(battle);
    rounds.push(battle.round);
    if (outcome !== 'win') {
      if (useSecondWind(run, meta)) continue;
      break;
    }
    const { picks } = finishFight(run, battle, meta);
    const rng = runRng(run);
    for (let step = 0; step < picks; step++) applyUpgrade(run, meta, rng.pick(rollDraft(run, rng, step, picks)));
    for (const item of rng.shuffle(rollShop(run, meta, rng))) buyItem(run, meta, item);
    run.stage++;
    const ev = rollEvent(run, rng);
    if (ev) rng.pick(ev.choices).apply(run, meta);
    saveRng(run, rng);
  }
  return { cleared: run.stage, rounds, run };
}

export function upgradedMeta(level: number): MetaState {
  const m = freshMeta();
  m.upgrades = { vet: level, sauce: level, signing: Math.min(5, level), benefits: Math.min(5, level), mentor: Math.min(3, Math.floor(level / 3)) };
  if (level >= 5) m.upgrades.second_wind = 1;
  return m;
}
