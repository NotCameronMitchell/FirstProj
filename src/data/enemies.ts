import type { Battle, Style, Unit } from '../combat/battle';

export interface EnemySkill {
  id: string;
  name: string;
  cd: number;
  first?: number;
  ult?: boolean;
  use: (b: Battle, u: Unit) => void;
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  blurb: string;
  hp: number;
  atk: number;
  def?: number;
  dodge?: number;
  crit?: number;
  boss?: boolean;
  style: Style;
  color?: string;
  quotes?: string[];
  /** Checked in order each turn; the first one off cooldown is used. */
  skills: EnemySkill[];
}

/** Hits every hero for `mult` x ATK. */
function aoe(b: Battle, u: Unit, mult: number, color: string): Unit[] {
  b.anim(u, undefined, 'cast', { color: `rgb(${color})` });
  b.aoe('hero', color);
  const hs = b.foesOf(u);
  for (const h of hs) b.hit(u, h, mult);
  return hs;
}

function single(b: Battle, u: Unit, mult: number, style: Style = 'melee'): Unit | undefined {
  const t = b.pickHeroTarget(u);
  if (!t) return undefined;
  b.anim(u, t, style);
  return b.hit(u, t, mult) > 0 ? t : undefined;
}

/** The hero hitting hardest right now (the HR Rep and the Logistics Director single them out). */
function strongest(b: Battle, u: Unit): Unit | undefined {
  return b.foesOf(u).sort((x, y) => y.atk * b.mult(y) - x.atk * b.mult(x))[0];
}

function quip(b: Battle, u: Unit, chance = 0.5): void {
  const q = ENEMIES[u.key].quotes;
  if (q && b.rng.chance(chance)) b.say(u, b.rng.pick(q));
}

export const ENEMIES: Record<string, EnemyDef> = {
  // ------------------------------------------------------------ minions
  energy_drink: {
    id: 'energy_drink',
    name: 'Energy Drink',
    sprite: 'energy_drink',
    blurb: '300mg of caffeine with legs. Sometimes hits twice.',
    hp: 34,
    atk: 6,
    dodge: 0.08,
    style: 'melee',
    skills: [
      {
        id: 'rush',
        name: 'Caffeine Rush',
        cd: 3,
        first: 1,
        use(b, u) {
          single(b, u, 0.8);
          b.beat(0.2);
          single(b, u, 0.8);
        },
      },
    ],
  },
  tallboy: {
    id: 'tallboy',
    name: 'Tallboy Energy',
    sprite: 'tallboy',
    blurb: 'A 24oz can that hypes up its friends.',
    hp: 52,
    atk: 7,
    style: 'melee',
    skills: [
      {
        id: 'sugar',
        name: 'Sugar Rush',
        cd: 3,
        first: 1,
        use(b, u) {
          b.anim(u, undefined, 'cast', { color: '#ffd23f' });
          for (const a of b.alliesOf(u)) b.addStatus(a, 'empower', 2, 0.25);
        },
      },
    ],
  },
  nic_pouch: {
    id: 'nic_pouch',
    name: 'Nicotine Pouch',
    sprite: 'nic_pouch',
    blurb: 'Tucked in a lip somewhere. Its hits Poison.',
    hp: 26,
    atk: 5,
    dodge: 0.1,
    style: 'melee',
    skills: [
      {
        id: 'tuck',
        name: 'Lip Tuck',
        cd: 2,
        use(b, u) {
          const t = single(b, u, 0.9);
          if (t) b.dot(u, t, 'poison', 0.5, 3);
        },
      },
    ],
  },
  pouch_tin: {
    id: 'pouch_tin',
    name: 'Pouch Tin',
    sprite: 'pouch_tin',
    blurb: 'A whole tin of them. Sturdy, and it weakens the party.',
    hp: 60,
    atk: 6,
    def: 0.15,
    style: 'melee',
    skills: [
      {
        id: 'mint',
        name: 'Cool Mint Cloud',
        cd: 4,
        first: 1,
        use(b, u) {
          for (const h of aoe(b, u, 0.4, '160,240,255')) b.addStatus(h, 'weaken', 2, 0.15, undefined, true);
        },
      },
    ],
  },
  reply_all: {
    id: 'reply_all',
    name: 'Reply-All Guy',
    sprite: 'reply_all',
    blurb: 'Hits everyone, every time.',
    hp: 42,
    atk: 6,
    style: 'ranged',
    color: '#ffffff',
    quotes: ['Per my last email...', 'Adding the whole team!', 'Thanks all!!'],
    skills: [
      {
        id: 'reply',
        name: 'Reply All',
        cd: 2,
        first: 1,
        use(b, u) {
          quip(b, u, 0.4);
          aoe(b, u, 0.6, '255,255,255');
        },
      },
    ],
  },
  fish_guy: {
    id: 'fish_guy',
    name: 'Microwave Fish Guy',
    sprite: 'fish_guy',
    blurb: 'Reheats salmon in the break room. Poisons everyone.',
    hp: 46,
    atk: 5,
    style: 'ranged',
    color: '#7cff4f',
    quotes: ["It's just salmon!", 'Lunch time'],
    skills: [
      {
        id: 'salmon',
        name: 'Reheated Salmon',
        cd: 3,
        first: 1,
        use(b, u) {
          quip(b, u, 0.5);
          for (const h of aoe(b, u, 0.2, '124,255,79')) b.dot(u, h, 'poison', 0.4, 3);
        },
      },
    ],
  },
  loud_typer: {
    id: 'loud_typer',
    name: 'Mechanical Keyboard Guy',
    sprite: 'loud_typer',
    blurb: 'CLACK CLACK CLACK. Can stun.',
    hp: 38,
    atk: 7,
    style: 'melee',
    quotes: ['Blue switches, baby'],
    skills: [
      {
        id: 'clack',
        name: 'CLACK CLACK',
        cd: 3,
        first: 1,
        use(b, u) {
          quip(b, u, 0.3);
          const t = single(b, u, 0.9);
          if (t) b.stun(t, 1, 0.6);
        },
      },
    ],
  },
  close_talker: {
    id: 'close_talker',
    name: 'Close Talker',
    sprite: 'close_talker',
    blurb: 'Way too close. Weakens whoever he corners.',
    hp: 48,
    atk: 7,
    style: 'melee',
    quotes: ['So anyway...', 'Got a sec?'],
    skills: [
      {
        id: 'corner',
        name: 'Got a Sec?',
        cd: 3,
        use(b, u) {
          quip(b, u, 0.5);
          const t = single(b, u, 1);
          if (t) b.addStatus(t, 'weaken', 2, 0.25);
        },
      },
    ],
  },

  // ------------------------------------------------------------ bosses
  manager: {
    id: 'manager',
    name: 'The Middle Manager',
    sprite: 'manager',
    blurb: 'Tall, balding and always smiling. Buries the party in memos and traps people in meetings.',
    hp: 240,
    atk: 11,
    boss: true,
    style: 'ranged',
    color: '#4fc3ff',
    quotes: ['Quick sync?', "Let's circle back.", 'Per my last memo...'],
    skills: [
      {
        id: 'meeting',
        name: 'Meeting Invite',
        cd: 5,
        first: 3,
        ult: true,
        use(b, u) {
          const t = b.pickHeroTarget(u);
          if (!t) return;
          b.say(u, 'This could have been an email');
          b.anim(u, t, 'cast', { color: '#b48cff' });
          b.addStatus(t, 'stun', 3);
          b.dot(u, t, 'meeting', 0.6, 3);
        },
      },
      {
        id: 'memos',
        name: 'Memo Storm',
        cd: 2,
        first: 1,
        use(b, u) {
          quip(b, u, 0.4);
          aoe(b, u, 0.8, '79,195,255');
        },
      },
    ],
  },
  mascot: {
    id: 'mascot',
    name: 'The Corporate Mascot',
    sprite: 'mascot',
    blurb: "The company's eagle mascot, and it has a deafening screech.",
    hp: 270,
    atk: 12,
    boss: true,
    style: 'melee',
    skills: [
      {
        id: 'allhands',
        name: 'All-Hands Screech',
        cd: 5,
        first: 3,
        ult: true,
        use(b, u) {
          b.say(u, 'SKREEEEE!');
          for (const h of aoe(b, u, 0.3, '255,122,224')) {
            b.stun(h, 1);
            b.dot(u, h, 'poison', 0.5, 3);
          }
        },
      },
      {
        id: 'screech',
        name: 'Screech',
        cd: 2,
        first: 1,
        use(b, u) {
          b.shake(3);
          aoe(b, u, 0.75, '200,200,220');
        },
      },
    ],
  },
  legacy_code: {
    id: 'legacy_code',
    name: 'Legacy Code',
    sprite: 'legacy_code',
    blurb: 'Twenty years of spaghetti code that came alive. Hits hard and can lock out every ability.',
    hp: 290,
    atk: 13,
    def: 0.1,
    boss: true,
    style: 'melee',
    quotes: ['NullReferenceException', 'TODO: fix later', 'segfault (core dumped)'],
    skills: [
      {
        id: 'update',
        name: 'Mandatory Update',
        cd: 5,
        first: 3,
        ult: true,
        use(b, u) {
          b.say(u, 'Restart required. Do not turn off your computer.');
          b.anim(u, undefined, 'cast', { color: '#7cff4f' });
          b.aoe('hero', '124,255,79');
          for (const h of b.foesOf(u)) b.addStatus(h, 'silence', 2);
        },
      },
      {
        id: 'overflow',
        name: 'Stack Overflow',
        cd: 2,
        first: 1,
        use(b, u) {
          quip(b, u, 0.4);
          const t = b.pickHeroTarget(u);
          if (!t) return;
          for (let i = 0; i < 3 && t.alive; i++) {
            b.anim(u, t, 'melee');
            b.hit(u, t, 0.6);
            b.beat(0.15);
          }
        },
      },
    ],
  },
  hr_rep: {
    id: 'hr_rep',
    name: 'The HR Rep',
    sprite: 'hr_rep',
    blurb: 'Cardigan, clipboard, zero tolerance. Crowd control, AoE, and she comes down hardest on your top performer.',
    hp: 280,
    atk: 13,
    dodge: 0.15,
    boss: true,
    style: 'melee',
    quotes: ["Let's keep it professional.", "I'm going to need that in writing.", 'This is going in your file.'],
    skills: [
      {
        id: 'complaint',
        name: 'Formal Complaint',
        cd: 5,
        first: 3,
        ult: true,
        use(b, u) {
          const top = strongest(b, u);
          b.say(u, top ? `${top.name}, a word.` : 'Everyone, a word.');
          b.anim(u, undefined, 'cast', { color: '#ffd23f' });
          b.aoe('hero', '255,210,63');
          b.shake(5);
          for (const h of b.foesOf(u)) {
            b.hit(u, h, h === top ? 2.4 : 1, { noDodge: true });
            b.stun(h, 1);
          }
        },
      },
      {
        id: 'writeup',
        name: 'Write-Up',
        cd: 3,
        first: 2,
        use(b, u) {
          const top = strongest(b, u);
          const tgt = top && b.rng.chance(0.5) ? top : b.pickHeroTarget(u);
          if (!tgt) return;
          quip(b, u, 0.5);
          b.anim(u, tgt, 'melee');
          if (b.hit(u, tgt, 1.1) > 0) b.stun(tgt, 1);
        },
      },
      {
        id: 'policy',
        name: 'Policy Update',
        cd: 2,
        first: 1,
        use(b, u) {
          aoe(b, u, 0.6, '255,154,31');
        },
      },
    ],
  },
  director: {
    id: 'director',
    name: 'The Logistics Director',
    sprite: 'director',
    blurb: 'Hi-vis vest, hard hat, endless reroutes. Turns heroes against each other and reassigns your best one.',
    hp: 310,
    atk: 13,
    boss: true,
    style: 'melee',
    quotes: ['Per the logistics plan...', "That's not in the SOP.", 'Rerouting.'],
    skills: [
      {
        id: 'reassign',
        name: 'Reassignment',
        cd: 6,
        first: 3,
        ult: true,
        use(b, u) {
          const t = strongest(b, u) ?? b.pickHeroTarget(u);
          if (!t) return;
          b.say(u, `${t.name}, you've been reassigned.`);
          b.anim(u, t, 'cast', { color: '#9aa0b8' });
          b.addStatus(t, 'away', 3);
        },
      },
      {
        id: 'reroute',
        name: 'Reroute Shipment',
        cd: 2,
        first: 1,
        use(b, u) {
          quip(b, u, 0.4);
          const hs = b.rng.shuffle(b.foesOf(u)).slice(0, 2);
          b.anim(u, undefined, 'cast', { color: '#ff7ae0' });
          for (const h of hs) {
            b.hit(u, h, 0.6);
            b.addStatus(h, 'confuse', 1, 0, u.uid);
          }
        },
      },
    ],
  },

  // ------------------------------------------------------------ Villiam Burginson's
  crew: {
    id: 'crew',
    name: 'Crew Member',
    sprite: 'crew',
    blurb: 'Would you like fries with that?',
    hp: 48,
    atk: 8,
    dodge: 0.08,
    style: 'ranged',
    color: '#ffd23f',
    quotes: ['Would you like fries with that?', 'Pull up to the window!'],
    skills: [
      {
        id: 'fries',
        name: 'Fry Toss',
        cd: 3,
        first: 1,
        use(b, u) {
          quip(b, u, 0.4);
          aoe(b, u, 0.6, '255,210,63');
        },
      },
    ],
  },
  cook: {
    id: 'cook',
    name: 'Line Cook',
    sprite: 'cook',
    blurb: 'Flings hot grease.',
    hp: 55,
    atk: 9,
    style: 'melee',
    quotes: ['Order up!', 'Behind!', 'Heard, chef.'],
    skills: [
      {
        id: 'grease',
        name: 'Hot Grease',
        cd: 2,
        first: 1,
        use(b, u) {
          quip(b, u, 0.3);
          const t = single(b, u, 0.9, 'ranged');
          if (t) b.dot(u, t, 'burn', 0.7, 3);
        },
      },
    ],
  },
  coworker: {
    id: 'coworker',
    name: 'Coworker',
    sprite: 'coworker',
    blurb: 'Covers shifts and patches up the crew.',
    hp: 44,
    atk: 7,
    style: 'melee',
    quotes: ['Can you cover my shift?', "I'm on break."],
    skills: [
      {
        id: 'cover',
        name: 'Cover My Shift',
        cd: 3,
        first: 1,
        use(b, u) {
          const hurt = b.alliesOf(u).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
          if (!hurt) return;
          quip(b, u, 0.3);
          b.anim(u, undefined, 'cast', { color: '#5effc8' });
          b.heal(hurt, hurt.maxHp * 0.25);
          b.addStatus(hurt, 'guard', 2, 0.2);
        },
      },
    ],
  },
};

/** Bosses a cycle can draw from. Add new bosses here (and give them story lines in src/data/story.ts). */
export const BOSS_POOL = ['manager', 'mascot', 'legacy_code', 'hr_rep', 'director'];
export const MINIONS_EARLY = ['energy_drink', 'nic_pouch', 'reply_all', 'close_talker'];
export const MINIONS_LATE = ['tallboy', 'pouch_tin', 'fish_guy', 'loud_typer'];
export const BURGER_CREW = ['crew', 'cook', 'coworker'];
