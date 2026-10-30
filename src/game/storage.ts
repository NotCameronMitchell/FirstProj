import type { LeaderboardEntry, MetaState, RunState } from '../types';
import { RUN_VERSION } from './run';

const KEYS = { meta: 'qvb.meta', run: 'qvb.run', board: 'qvb.board' };

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
  return { version: 1, sauce: 0, totalSauce: 0, upgrades: {}, runs: 0, bestStage: 0, outfits: {}, ownedOutfits: [], party: [], achievements: [], stats: {} };
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
  const board = [...loadBoard(), entry].sort((a, b) => b.stage - a.stage || b.kills - a.kills).slice(0, 25);
  write(KEYS.board, board);
  return { board, rank: board.indexOf(entry) };
}
