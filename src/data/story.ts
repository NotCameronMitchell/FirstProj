// Story text: dialogue shown at key moments in a run, and what each boss says
// before the fight and after you beat them. All of it is placeholder writing,
// meant to be rewritten. A line's speaker is a hero id, an enemy id, or any
// name; known ids get their portrait shown.

export interface Line {
  speaker: string;
  text: string;
}

export interface BossLines {
  intro: Line[];
  defeat: Line[];
}

/** Shown when a run starts. */
export const RUN_INTRO: Line[] = [
  { speaker: 'Narrator', text: 'Legend says the Village Sauce at Villiam Burginson\'s can cure any case of the Mondays.' },
  { speaker: 'Narrator', text: 'Between the party and the sauce stand the office, its minions, and the people who run the place.' },
  { speaker: 'mason', text: "If it weren't for the brain fog I'd really have to experience this." },
  { speaker: 'cole', text: "Let's go get the sauce." },
];

/** Shown before the burger joint fight. */
export const BURGER_INTRO: Line[] = [
  { speaker: 'Narrator', text: "The elevator doors open on a smell of fries. You're at Villiam Burginson's." },
  { speaker: 'crew', text: "Village Sauce? That's for employees only." },
];

/** Shown after the burger joint is cleared. */
export const BURGER_DEFEAT: Line[] = [
  { speaker: 'Narrator', text: 'The Village Sauce is yours. For now.' },
  { speaker: 'Narrator', text: 'Back at the office, the next quarter is about to start. Everyone looks a little tougher.' },
];

/** What each boss says. Bosses without an entry just fight. */
export const BOSS_LINES: Record<string, BossLines> = {
  manager: {
    intro: [
      { speaker: 'manager', text: 'Hey team! Quick sync before you go anywhere?' },
      { speaker: 'manager', text: "I've blocked off the rest of your afternoon." },
    ],
    defeat: [{ speaker: 'manager', text: "Okay, let's take this offline." }],
  },
  mascot: {
    intro: [{ speaker: 'mascot', text: 'SKREEEEE! (The mascot does not want you to leave.)' }],
    defeat: [{ speaker: 'mascot', text: '...skree.' }],
  },
  legacy_code: {
    intro: [{ speaker: 'legacy_code', text: '// TODO: stop these four from getting the sauce' }],
    defeat: [{ speaker: 'legacy_code', text: 'Process exited with code 0.' }],
  },
  hr_rep: {
    intro: [
      { speaker: 'hr_rep', text: "We've received some complaints about the four of you." },
      { speaker: 'hr_rep', text: "Let's schedule a conversation. Right now." },
    ],
    defeat: [{ speaker: 'hr_rep', text: "Fine. But this is going in your file." }],
  },
  director: {
    intro: [{ speaker: 'director', text: 'Per the logistics plan, none of you are leaving this floor.' }],
    defeat: [{ speaker: 'director', text: "I'll reroute. I always reroute." }],
  },
};

/** Extra intro line when the rival boss has been empowered by a hung-up call. */
export const RIVAL_EMPOWERED_LINE: Line = { speaker: 'director', text: 'Renekton told me you hung up on him.' };
