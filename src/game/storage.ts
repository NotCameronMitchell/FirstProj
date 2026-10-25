import type { LeaderboardEntry, MetaState, RunState } from '../types';
import { RUN_VERSION } from './run';

const KEYS = { meta: 'fott.meta', run: 'fott.run', board: 'fott.board' };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the game still plays without saving.
  }
}

export function freshMeta(): MetaState {
  return { version: 1, embers: 0, upgrades: {}, runs: 0, bestWave: 0, seenLore: [] };
}

export function loadMeta(): MetaState {
  return { ...freshMeta(), ...(read<MetaState>(KEYS.meta) ?? {}) };
}

export function saveMeta(meta: MetaState): void {
  write(KEYS.meta, meta);
}

export function loadRun(): RunState | null {
  const r = read<RunState>(KEYS.run);
  return r && r.version === RUN_VERSION ? r : null;
}

export function saveRun(run: RunState | null): void {
  write(KEYS.run, run);
}

export function loadBoard(): LeaderboardEntry[] {
  return read<LeaderboardEntry[]>(KEYS.board) ?? [];
}

export function recordRun(entry: LeaderboardEntry): { board: LeaderboardEntry[]; rank: number } {
  const board = [...loadBoard(), entry].sort((a, b) => b.wave - a.wave || b.kills - a.kills).slice(0, 50);
  write(KEYS.board, board);
  return { board, rank: board.indexOf(entry) };
}

/** Best result for each distinct party composition (order-independent). */
export function bestByParty(board: LeaderboardEntry[]): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const e of board) {
    const k = [...e.party].sort().join('+');
    const cur = best.get(k);
    if (!cur || e.wave > cur.wave) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => b.wave - a.wave);
}
