import type { FightStats } from '../combat/battle';
import type { MetaState } from '../types';

// Achievements are checked at a few moments (after a won fight, after an event
// choice) against all-time counters in MetaState.stats and the fight's stats.
// An achievement can unlock a skin: give the outfit in src/data/outfits.ts an
// `achievement` set to the achievement's id.

export interface AchievementCtx {
  meta: MetaState;
  /** Set after a won fight. */
  fight?: FightStats;
  /** Set after an event choice: "<event id>:<choice index>". */
  event?: string;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (c: AchievementCtx) => boolean;
}

const stat = (c: AchievementCtx, key: string) => c.meta.stats[key] ?? 0;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_day', name: 'First Day on the Job', desc: 'Win your first fight.', check: (c) => stat(c, 'fightsWon') >= 1 },
  { id: 'promoted', name: 'Promoted', desc: 'Defeat a boss.', check: (c) => stat(c, 'bossesBeaten') >= 1 },
  { id: 'performance_review', name: 'Performance Review', desc: 'Defeat 5 bosses (all-time).', check: (c) => stat(c, 'bossesBeaten') >= 5 },
  { id: 'lunch_break', name: 'Lunch Break', desc: "Make it to Villiam Burginson's.", check: (c) => stat(c, 'burgerReached') >= 1 },
  { id: 'secret_sauce', name: 'Secret Sauce', desc: "Win the fight at Villiam Burginson's.", check: (c) => stat(c, 'burgerWon') >= 1 },
  { id: 'glory_glory', name: 'Glory Glory', desc: "Win a fight in which Mason's We Go Next goes off.", check: (c) => !!c.fight?.weGoNext },
  { id: 'hotty_toddy', name: 'Hotty Toddy', desc: 'Win a fight after 9 Iron on Ciabatta brings Cole back.', check: (c) => !!c.fight?.coleRevived },
  { id: 'new_job', name: 'New Job, Who Dis?', desc: "Hit blackjack on James's Daily Dollar and win the fight.", check: (c) => !!c.fight?.blackjack },
  { id: 'drip_check', name: 'Drip Check', desc: 'Hit 3 or more enemies with one Nissan Titan and win the fight.', check: (c) => (c.fight?.titanHits ?? 0) >= 3 },
  { id: 'answered', name: 'Answered the Call', desc: "Pick up when Renekton calls.", check: (c) => c.event === 'renekton:0' },
  { id: 'ten_toes', name: 'Ten Toes Down', desc: 'Win 25 fights (all-time).', check: (c) => stat(c, 'fightsWon') >= 25 },
  { id: 'overtime', name: 'Overtime', desc: 'Reach the third cycle in a single run.', check: (c) => stat(c, 'bestCycle') >= 3 },
];

export const ACHIEVEMENT_MAP: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Unlocks every achievement whose condition now holds. Returns the new ones. */
export function checkAchievements(c: AchievementCtx): Achievement[] {
  const got: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (c.meta.achievements.includes(a.id) || !a.check(c)) continue;
    c.meta.achievements.push(a.id);
    got.push(a);
  }
  return got;
}

export function bumpStat(meta: MetaState, key: string, by = 1): void {
  meta.stats[key] = (meta.stats[key] ?? 0) + by;
}
