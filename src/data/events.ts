import { RIVAL_BOSS, RIVAL_EMPOWERED, applyStat, heroStats, stageInfo } from '../game/run';
import { ENEMIES } from './enemies';
import type { Rng } from '../rng';
import type { FightMod, HeroId, MetaState, RunState } from '../types';

// Random events that can happen between fights, after the shop.
// Each one shows a little scene, then one or more choices.

export interface EventChoice {
  label: string;
  /** What happened, shown after the choice. */
  result: string;
  style?: 'accept' | 'decline';
  apply: (run: RunState, meta: MetaState) => void;
}

export interface RunEvent {
  id: string;
  title: string;
  text: string;
  /** How the scene is drawn: a ringing phone, a hero's sprite, or the whole party. */
  art: { phone: string } | { hero: HeroId } | { party: true };
  /** Heroes who must be in the party for the event to come up. */
  requires?: HeroId[];
  choices: EventChoice[];
}

/** Chance of an event after each shop visit. */
export const EVENT_CHANCE = 0.35;

function hero(run: RunState, id: HeroId) {
  return run.heroes.find((h) => h.id === id)!;
}

function nextFight(run: RunState, mod: FightMod): void {
  (run.nextFight ??= []).push(mod);
}

/** Lose a share of max HP from current HP (never below 1). */
function hurt(run: RunState, meta: MetaState, id: HeroId, pct: number): void {
  const h = hero(run, id);
  h.hp = Math.max(1, h.hp - Math.round(heroStats(h, meta).maxHp * pct));
}

export const EVENTS: RunEvent[] = [
  {
    id: 'renekton',
    title: 'Renekton is calling',
    text: 'A phone lights up. The caller ID shows a humanoid alligator.',
    art: { phone: 'renekton' },
    choices: [
      {
        label: 'Accept',
        style: 'accept',
        result: 'Renekton Buff! Every hero gets +5 attack for the next fight.',
        apply: (run) => nextFight(run, { hero: 'all', atk: 5, tag: 'renekton' }),
      },
      {
        label: 'Hang up',
        style: 'decline',
        result: `You hung up on Renekton. Somewhere, ${ENEMIES[RIVAL_BOSS].name} gets stronger: +${Math.round((RIVAL_EMPOWERED.hp - 1) * 100)}% health and +${Math.round((RIVAL_EMPOWERED.atk - 1) * 100)}% damage the next time you face them.`,
        apply: (run) => {
          run.rivalEmpowered = true;
        },
      },
    ],
  },
  {
    id: 'the_local',
    title: 'Trip to The Local',
    text: 'Cole wants to go to The Local. Are you coming?',
    art: { hero: 'cole' },
    requires: ['cole'],
    choices: [
      {
        label: "Let's go",
        style: 'accept',
        result: 'Good times. The whole party heals to full and starts the next fight with a 5% shield.',
        apply: (run, meta) => {
          for (const h of run.heroes) h.hp = heroStats(h, meta).maxHp;
          nextFight(run, { hero: 'all', shieldPct: 0.05 });
        },
      },
      {
        label: 'Not tonight',
        style: 'decline',
        result: 'Cole goes alone and loses 5% of his health.',
        apply: (run, meta) => hurt(run, meta, 'cole', 0.05),
      },
    ],
  },
  {
    id: 'pool_party',
    title: 'AM Pool Party',
    text: "There's a pool party this morning. Do you go?",
    art: { hero: 'mason' },
    requires: ['mason'],
    choices: [
      {
        label: 'Cannonball',
        style: 'accept',
        result: 'Refreshing. Every hero gets +5% max health for the rest of the run.',
        apply: (run, meta) => applyStat(run, meta, 'all', 'hp', 0.05),
      },
      {
        label: 'Skip it',
        style: 'decline',
        result: 'Mason stays home and channels it: +10 attack for the rest of the run.',
        apply: (run) => {
          const m = hero(run, 'mason');
          m.atkFlat = (m.atkFlat ?? 0) + 10;
        },
      },
    ],
  },
  {
    id: 'otr_raffle',
    title: 'OTR Raffle Drawing',
    text: 'The OTR raffle is drawn... and Cole wins!',
    art: { hero: 'cole' },
    requires: ['cole'],
    choices: [
      {
        label: 'Collect the prize',
        result: 'Cole gets +20 attack for the next fight. Everyone else loses 5% health from the jealousy.',
        apply: (run, meta) => {
          nextFight(run, { hero: 'cole', atk: 20, tag: 'raffle' });
          for (const h of run.heroes) if (h.id !== 'cole') hurt(run, meta, h.id, 0.05);
        },
      },
    ],
  },
  {
    id: 'rift',
    title: 'Cam on the Rift',
    text: 'Cam queued up a few games last night. It did not go well.',
    art: { hero: 'cam' },
    requires: ['cam'],
    choices: [
      {
        label: 'SMH my head',
        result: 'Cam is Tilted: -5% max health and -5 attack for the next fight.',
        apply: (run) => nextFight(run, { hero: 'cam', hpPct: -0.05, atk: -5, tag: 'tilted' }),
      },
    ],
  },
  {
    id: 'holiday_party',
    title: 'Holiday Party',
    text: 'The office holiday party is in full swing. What do you do?',
    art: { party: true },
    choices: [
      {
        label: "Search the women's bathroom",
        result: 'You find some suspicious white powder. Every hero gets +15 attack for the next fight.',
        apply: (run) => nextFight(run, { hero: 'all', atk: 15, tag: 'party' }),
      },
      {
        label: 'Hit the open bar',
        result: 'Free drinks all night. Every hero gets +5% max health for the rest of the run.',
        apply: (run, meta) => applyStat(run, meta, 'all', 'hp', 0.05),
      },
    ],
  },
];

export const EVENT_MAP: Record<string, RunEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Maybe picks an event before the next fight; each event happens at most once per cycle. */
export function rollEvent(run: RunState, rng: Rng): RunEvent | null {
  if (run.stage === 0 || !rng.chance(EVENT_CHANCE)) return null;
  const cycle = stageInfo(run.stage, run.seed).cycle;
  const seen = new Set(run.eventsSeen ?? []);
  const party = new Set(run.heroes.map((h) => h.id));
  const options = EVENTS.filter((e) => !seen.has(`${cycle}:${e.id}`) && (e.requires ?? []).every((id) => party.has(id)));
  if (!options.length) return null;
  const e = rng.pick(options);
  (run.eventsSeen ??= []).push(`${cycle}:${e.id}`);
  return e;
}
