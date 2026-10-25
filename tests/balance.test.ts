import { it } from 'vitest';
import { Rng } from '../src/rng';
import { randomParty, simulateRun, upgradedMeta } from './helpers';

// Balance report; run with: VITE_BALANCE=1 npx vitest run tests/balance.test.ts
it.runIf(!!import.meta.env.VITE_BALANCE)('balance report', () => {
  for (const lvl of [0, 3, 6, 10]) {
    const rng = new Rng(99);
    const cleared: number[] = [];
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const r = simulateRun(randomParty(rng), 1000 + i, upgradedMeta(lvl));
      cleared.push(r.cleared);
      times.push(...r.times);
    }
    cleared.sort((a, b) => a - b);
    const q = (p: number) => cleared[Math.floor(p * (cleared.length - 1))];
    const avgT = times.reduce((a, b) => a + b, 0) / times.length;
    const hist: Record<number, number> = {};
    for (const c of cleared) hist[c + 1] = (hist[c + 1] ?? 0) + 1;
    console.log(`meta ${lvl}`, 'died on wave:', JSON.stringify(hist));
    console.log(`meta ${lvl}: waves p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${q(1)}  avg fight ${avgT.toFixed(1)}s`);
  }
}, 600_000);
