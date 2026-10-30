import type { ActionOpt, Battle, Unit } from '../combat/battle';

// A simple policy that plays the heroes' turns. Used by the tests and balance
// simulations, and by the in-game "Auto" button.

function lowest(units: Unit[]): Unit | undefined {
  return [...units].sort((a, b) => a.hp - b.hp)[0];
}

/** Picks one move for the hero: [action id, target uid]. */
export function chooseAction(b: Battle, u: Unit): [string, number | undefined] {
  const opts = b.actions(u).filter((a) => a.ready);
  const foes = b.foesOf(u);
  const boss = foes.find((f) => f.boss);
  const focus = boss && foes.length <= 2 ? boss : lowest(foes);
  const by = (id: string) => opts.find((o) => o.id === id);
  const pick = (o: ActionOpt | undefined): [string, number | undefined] | null => {
    if (!o) return null;
    const t = o.target === 'enemy' ? focus?.uid : o.target === 'ally' ? lowest(b.alliesOf(u))?.uid : undefined;
    return [o.id, t];
  };
  const hpFrac = u.hp / u.maxHp;
  const order: string[] = {
    mason: ['wife_btw', 'bite', 'swipe', 'headbutt', 'lick'],
    james: hpFrac < 0.5 ? ['fogo', 'jimmytrains', 'throat_punch', 'peptide_rage', 'daily_dollar'] : ['jimmytrains', 'peptide_rage', 'throat_punch', 'daily_dollar'],
    cole: ['transfer_uw', 'ole_miss', 'golf_lesson', 'cft', 'argue_sales'],
    cam: ['nissan_titan', 'iceland_story', 'mind_goblin', 'would_you_rather', 'shopping_spree'],
  }[u.key] ?? [];
  for (const id of order) {
    if (id === 'transfer_uw' && hpFrac > 0.6 && foes.length > 1) continue;
    const r = pick(by(id));
    if (r) return r;
  }
  return pick(by('attack'))!;
}

/** Plays a whole fight with the AI. Returns the outcome. */
export function autoBattle(b: Battle, maxRounds = 60): 'win' | 'lose' {
  let guard = 0;
  while (!b.outcome && b.round <= maxRounds && guard++ < 5000) {
    if (b.phase === 'hero') {
      const u = b.ready()[0];
      if (!u) break;
      const [id, t] = chooseAction(b, u);
      if (!b.act(u.uid, id, t)) b.act(u.uid, 'attack');
    } else b.enemyStep();
  }
  return b.outcome ?? 'lose';
}
