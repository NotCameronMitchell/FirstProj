import { it } from 'vitest';
import { STAGES_PER_CYCLE, stageInfo } from '../src/game/run';
import { simulateRun, upgradedMeta } from './helpers';

// Balance report; run with: VITE_BALANCE=1 npx vitest run tests/balance.test.ts --silent=false
it.runIf(!!import.meta.env.VITE_BALANCE)('balance report', () => {
  for (const lvl of [0, 3, 6, 10]) {
    const cleared: number[] = [];
    const rounds: number[] = [];
    const byKind: Record<string, number[]> = { minion: [], boss: [], bonus: [] };
    for (let i = 0; i < 60; i++) {
      const r = simulateRun(1000 + i, upgradedMeta(lvl));
      cleared.push(r.cleared);
      rounds.push(...r.rounds);
      r.rounds.forEach((n, s) => byKind[stageInfo(s, r.run.seed).kind].push(n));
    }
    cleared.sort((a, b) => a - b);
    const q = (p: number) => cleared[Math.floor(p * (cleared.length - 1))];
    const hist: Record<string, number> = {};
    for (const c of cleared) {
      const s = stageInfo(c);
      const k = `${s.cycle + 1}-${s.index + 1}${s.kind === 'boss' ? 'B' : s.kind === 'bonus' ? '$' : ''}`;
      hist[k] = (hist[k] ?? 0) + 1;
    }
    const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
    const bonus = (c: number) => STAGES_PER_CYCLE * c - 1; // stage index of cycle c's burger fight (1-based c)
    const pct = (n: number) => `${Math.round((100 * n) / cleared.length)}%`;
    console.log(
      `meta ${lvl}: reached burger 1: ${pct(cleared.filter((c) => c >= bonus(1)).length)}, beat it: ${pct(cleared.filter((c) => c > bonus(1)).length)}, beat burger 2: ${pct(cleared.filter((c) => c > bonus(2)).length)}`,
    );
    console.log(`meta ${lvl}: died at`, JSON.stringify(hist));
    console.log(`meta ${lvl}: fights won p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${q(1)}  avg rounds/fight ${avg.toFixed(1)}`, Object.entries(byKind).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(1)}`).join(' '));
  }
}, 600_000);
