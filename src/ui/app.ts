import type { ActionOpt, Battle, Unit } from '../combat/battle';
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, bumpStat, checkAchievements, type Achievement } from '../data/achievements';
import { ENEMIES } from '../data/enemies';
import { EVENT_MAP, rollEvent } from '../data/events';
import { ABILITIES, HEROES, HERO_IDS, MAX_RANK, PARTY_SIZE, ROSTER_SLOTS, WEAPONS, roman } from '../data/heroes';
import { META_UPGRADES, metaLevel } from '../data/meta';
import { outfitOf, outfitSprite, outfitsFor, outfitsForAchievement, ownsOutfit, type OutfitDef } from '../data/outfits';
import { BOSS_LINES, BURGER_DEFEAT, BURGER_INTRO, RIVAL_EMPOWERED_LINE, RUN_INTRO, type Line } from '../data/story';
import {
  REROLL_COST,
  RIVAL_BOSS,
  STAGES_PER_CYCLE,
  applyUpgrade,
  buildBattle,
  buyItem,
  finishFight,
  heroSprite,
  heroStats,
  newRun,
  rankOf,
  rollDraft,
  rollShop,
  runRng,
  saveRng,
  stageInfo,
  statText,
  useSecondWind,
  type FightResult,
} from '../game/run';
import { loadBoard, loadMeta, loadRun, recordRun, saveMeta, saveRun } from '../game/storage';
import type { Scene } from '../render/backgrounds';
import { BattleView } from '../render/scene';
import { spriteCanvas } from '../render/sprites';
import { randomSeed } from '../rng';
import { STATUS_INFO, type HeroId, type MetaState, type RunState, type StatusKind, type Upgrade } from '../types';

type Child = Node | string | number | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; onclick?: (e: Event) => void; disabled?: boolean; style?: string; title?: string } | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props?.class) el.className = props.class;
  if (props?.onclick) el.addEventListener('click', props.onclick);
  if (props?.disabled) (el as HTMLButtonElement).disabled = true;
  if (props?.style) el.setAttribute('style', props.style);
  if (props?.title) el.title = props.title;
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const icon = (id: 'sauce' | 'pto', scale = 2) => spriteCanvas(id, scale);

function readPref(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // ignore
  }
}

/** Tooltip text for a status: what it is, how long it lasts, what it does. */
function statusTip(kind: StatusKind, dur: number, withLabel = true): string {
  const info = STATUS_INFO[kind];
  const turns = dur > 99 ? 'this fight' : `${dur} turn${dur === 1 ? '' : 's'}`;
  return `${withLabel ? `${info.label} (${turns}): ` : `${turns}. `}${info.desc}`;
}

function sceneFor(stage: number): Scene {
  const k = stageInfo(stage).kind;
  return k === 'boss' ? 'rooftop' : k === 'bonus' ? 'burger' : 'office';
}

/** Pass the run's seed to name the boss; without it a boss stage is just "Boss fight". */
function stageLabel(stage: number, seed?: number): string {
  const s = stageInfo(stage, seed ?? 0);
  const cyc = `Cycle ${s.cycle + 1}`;
  if (s.kind === 'bonus') return `${cyc} · Bonus: ${s.title}`;
  if (s.kind === 'boss') return seed === undefined ? `${cyc} · Boss fight` : `${cyc} · Boss: ${s.title}`;
  return `${cyc} · Fight ${s.index + 1}/${STAGES_PER_CYCLE}`;
}

export class App {
  private meta: MetaState = loadMeta();
  private run: RunState | null = loadRun();
  private raf = 0;
  private cleanup: (() => void)[] = [];
  /** Animations created while building a screen; started once it is mounted. */
  private starters: (() => void)[] = [];
  private speed = readPref('qvb.speed', 1);

  constructor(private root: HTMLElement) {}

  start(): void {
    this.title();
  }

  private mount(screen: HTMLElement): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup.splice(0)) fn();
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
    this.root.replaceChildren(screen);
    for (const fn of this.starters.splice(0)) fn();
  }

  private overlay(...content: Child[]): { el: HTMLElement; close: () => void } {
    const sheet = h('div', { class: 'sheet' }, ...content);
    const el = h('div', { class: 'overlay' }, sheet);
    const close = () => el.remove();
    el.addEventListener('click', (e) => e.target === el && close());
    document.body.append(el);
    return { el, close };
  }

  private confirm(title: string, text: string, yes: string, onYes: () => void): void {
    const o = this.overlay(
      h('h2', null, title),
      h('p', null, text),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => o.close() }, 'Back'), h('button', { class: 'btn danger', onclick: () => (o.close(), onYes()) }, yes)),
    );
  }

  /** An animated backdrop for menu screens. */
  private backdrop(scene: Scene): HTMLCanvasElement {
    const canvas = h('canvas', { class: 'backdrop' });
    const view = new BattleView(canvas);
    view.setBattle(null, scene);
    this.starters.push(() => {
      const ro = new ResizeObserver(() => view.resize());
      ro.observe(canvas);
      this.cleanup.push(() => ro.disconnect());
      let last = performance.now();
      const frame = (t: number) => {
        view.update(Math.min(0.05, (t - last) / 1000));
        last = t;
        view.draw();
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
    return canvas;
  }

  // ---------------------------------------------------------------- title
  private title(): void {
    const run = this.run;
    const lineup = h('div', { class: 'lineup' });
    for (const id of HERO_IDS) {
      const d = HEROES[id];
      const c = spriteCanvas(this.metaSprite(id), 5);
      const fig = h('button', { class: 'hero-fig', onclick: () => this.heroInfo(id) }, c, h('span', { style: `color:${d.color}` }, d.name));
      if (id === 'mason') fig.prepend(h('div', { class: 'cats' }, spriteCanvas('bruno', 3), spriteCanvas('murphy', 3)));
      lineup.append(fig);
    }
    const screen = h(
      'div',
      { class: 'screen title' },
      this.backdrop('rooftop'),
      h(
        'div',
        { class: 'title-content' },
        h('h1', null, 'The Quest for', h('br'), h('span', null, 'Villiam Burginson')),
        h('p', { class: 'tag' }, 'A roguelike office brawl for Village Sauce'),
        lineup,
        h(
          'div',
          { class: 'menu' },
          run && h('button', { class: 'btn big', onclick: () => this.resume() }, 'Continue', h('small', null, stageLabel(run.stage, run.seed))),
          h('button', { class: `btn big ${run ? 'alt' : ''}`, onclick: () => (run ? this.confirm('Start over?', 'Your current run will be lost.', 'New run', () => this.suitUp()) : this.suitUp()) }, 'New Run'),
          h('button', { class: 'btn', onclick: () => this.sauceShop() }, icon('sauce'), ` Sauce Shop · ${this.meta.sauce}`),
          h('button', { class: 'btn ghost', onclick: () => this.achievementsList() }, `Achievements · ${this.meta.achievements.length}/${ACHIEVEMENTS.length}`),
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => this.hall() }, 'Hall of Fame'), h('button', { class: 'btn ghost', onclick: () => this.howTo() }, 'How to Play')),
        ),
      ),
    );
    this.mount(screen);
  }

  private heroInfo(id: HeroId): void {
    const d = HEROES[id];
    const line = (abId: string, tag: string) => {
      const ab = ABILITIES[abId];
      const r = this.run ? rankOf(this.run, id, abId) : 1;
      return h('div', { class: 'ab' }, h('b', null, ab.name, h('em', null, ` ${tag}${r > 1 ? ` ${roman(r)}` : ''}`)), h('p', null, ab.desc(r)));
    };
    this.overlay(
      h('div', { class: 'row left' }, spriteCanvas(this.run ? heroSprite(this.run, id) : this.metaSprite(id), 4), h('div', null, h('h2', { style: `color:${d.color}` }, d.name), h('p', { class: 'muted' }, d.role), h('p', null, d.blurb))),
      h('p', { class: 'quote' }, d.quotes.map((q) => `"${q}"`).join('  ·  ')),
      ...d.abilities.map((a) => line(a, '')),
      line(d.ultimate, 'ULTIMATE'),
      line(d.passive, 'PASSIVE'),
      h('h3', null, 'Weapons'),
      ...d.weapons.map((w) => h('div', { class: 'ab' }, h('b', null, WEAPONS[w].name), h('p', null, WEAPONS[w].desc))),
    );
  }

  private howTo(): void {
    this.overlay(
      h('h2', null, 'How to Play'),
      h('p', null, 'Build a party of four on the Suit Up screen, then fight through the office: a minion fight, then a boss, three times over. The bosses are drawn at random each cycle. Beat them and you get pulled into ', h('b', null, "Villiam Burginson's"), ' to fight the crew for Village Sauce. Then the cycle starts again, harder.'),
      h('p', null, 'Beating a boss heals the whole party, always drops a weapon, and gives you a fourth upgrade pick.'),
      h('p', null, 'Hover or tap the little status icons over a character to see what they do. Achievements unlock new outfits.'),
      h('p', null, 'Each round, every hero takes one action, in any order: tap a hero, pick an attack or ability, then tap a target. After that the enemies act.'),
      h('p', null, 'Abilities have cooldowns. Ultimates are ready on turn 4, then every 5 turns. ', h('b', null, 'Quick'), " buffs (Cole's and James's) don't use up the turn, but each hero gets only one per turn."),
      h('p', null, 'After every win you pick 3 upgrades (the first is always an ability), then spend ', icon('pto'), ' PTO Hours in the shop on weapons, training and snacks.'),
      h('p', null, icon('sauce'), ' Village Sauce only comes from the burger joint. Spend it in the Sauce Shop on permanent upgrades.'),
      h('p', { class: 'muted' }, 'Keyboard: 1-6 pick an action, Tab switches hero, Enter confirms, Esc cancels.'),
    );
  }

  private hall(): void {
    const board = loadBoard();
    this.overlay(
      h('h2', null, 'Hall of Fame'),
      h('p', { class: 'muted' }, `Runs: ${this.meta.runs} · Sauce earned all-time: ${this.meta.totalSauce}`),
      board.length
        ? h(
            'ol',
            { class: 'board' },
            ...board.slice(0, 15).map((e) => h('li', null, h('b', null, stageLabel(e.stage)), h('span', { class: 'muted' }, ` · ${e.fights} wins · ${e.kills} KOs · ${new Date(e.date).toLocaleDateString()}`))),
          )
        : h('p', null, 'No runs yet. Go get that sauce.'),
    );
  }

  // ---------------------------------------------------------------- meta shop
  private sauceShop(): void {
    const list = h('div', { class: 'meta-list' });
    const head = h('div', { class: 'currency big' });
    const render = () => {
      head.replaceChildren(icon('sauce', 3), ` ${this.meta.sauce} Village Sauce`);
      list.replaceChildren(
        ...META_UPGRADES.map((m) => {
          const lvl = metaLevel(this.meta.upgrades, m.id);
          const maxed = lvl >= m.max;
          const cost = m.cost(lvl);
          return h(
            'div',
            { class: 'meta-item' },
            h('div', null, h('b', null, m.name, h('em', null, ` ${lvl}/${m.max}`)), h('p', null, m.desc(Math.max(1, maxed ? lvl : lvl + 1)))),
            h(
              'button',
              {
                class: 'btn small',
                disabled: maxed || this.meta.sauce < cost,
                onclick: () => {
                  this.meta.sauce -= cost;
                  this.meta.upgrades[m.id] = lvl + 1;
                  saveMeta(this.meta);
                  render();
                },
              },
              maxed ? 'MAX' : h('span', null, icon('sauce', 1), ` ${cost}`),
            ),
          );
        }),
      );
    };
    render();
    this.mount(
      h(
        'div',
        { class: 'screen page' },
        this.backdrop('burger'),
        h(
          'div',
          { class: 'page-body' },
          h('div', { class: 'row spread' }, h('h2', null, 'Sauce Shop'), h('button', { class: 'btn ghost small', onclick: () => this.title() }, 'Back')),
          head,
          h('p', { class: 'muted' }, 'Permanent upgrades. Village Sauce only drips from the burger joint at the end of each cycle.'),
          list,
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- wardrobe
  /** Sprite for a hero's last-picked outfit (outside of a run). */
  private metaSprite(id: HeroId): string {
    return outfitSprite(outfitOf(id, this.meta.outfits));
  }

  /** Build the party, pick everyone's outfit, then start the run. */
  private suitUp(): void {
    const meta = this.meta;
    const need = Math.min(PARTY_SIZE, HERO_IDS.length);
    const party: HeroId[] = meta.party.filter((id) => HERO_IDS.includes(id)).slice(0, need);
    for (const id of HERO_IDS) if (party.length < need && !party.includes(id)) party.push(id);
    const roster = h('div', { class: 'roster' });
    const grid = h('div', { class: 'wardrobe' });
    const sauce = h('span', { class: 'currency big' });
    const count = h('h3', null);
    const startBtn = h('button', { class: 'btn big', onclick: () => party.length === need && this.startRun([...party]) }, 'Start Run');
    const render = () => {
      sauce.replaceChildren(icon('sauce', 3), ` ${meta.sauce}`);
      count.textContent = `Party ${party.length}/${need}`;
      startBtn.disabled = party.length !== need;
      roster.replaceChildren(
        ...HERO_IDS.map((id) => {
          const d = HEROES[id];
          const on = party.includes(id);
          return h(
            'button',
            {
              class: `roster-card ${on ? 'on' : ''}`,
              title: d.blurb,
              onclick: () => {
                if (on) party.splice(party.indexOf(id), 1);
                else if (party.length < need) party.push(id);
                meta.party = [...party];
                saveMeta(meta);
                render();
              },
            },
            spriteCanvas(this.metaSprite(id), 2),
            h('b', { style: `color:${d.color}` }, d.name),
            h('small', null, d.role),
          );
        }),
        ...Array.from({ length: Math.max(0, ROSTER_SLOTS - HERO_IDS.length) }, () =>
          h('div', { class: 'roster-card soon' }, h('div', { class: 'qmark' }, '?'), h('b', null, '???'), h('small', null, 'Coming soon')),
        ),
      );
      grid.replaceChildren(
        ...party.map((id) => {
          const d = HEROES[id];
          const worn = outfitOf(id, meta.outfits);
          const options = outfitsFor(id);
          const locked = options.filter((o) => o.achievement && !ownsOutfit(meta, o));
          const pick = (o: OutfitDef) => {
            if (!ownsOutfit(meta, o)) {
              if (o.achievement || meta.sauce < (o.cost ?? 0)) return;
              meta.sauce -= o.cost ?? 0;
              meta.ownedOutfits.push(o.id);
            }
            meta.outfits[id] = o.id;
            saveMeta(meta);
            render();
          };
          return h(
            'div',
            { class: 'closet' },
            h('div', { class: 'mannequin' }, spriteCanvas(outfitSprite(worn), 4)),
            h('b', { style: `color:${d.color}` }, d.name),
            h('small', { class: 'muted' }, worn.desc),
            h(
              'div',
              { class: 'weapons' },
              ...options.map((o) => {
                const owned = ownsOutfit(meta, o);
                const ach = o.achievement ? ACHIEVEMENT_MAP[o.achievement] : undefined;
                return h(
                  'button',
                  {
                    class: `chip ${o.id === worn.id ? 'on' : ''} ${owned ? '' : 'locked'}`,
                    disabled: !owned && (!!ach || meta.sauce < (o.cost ?? 0)),
                    title: ach && !owned ? `Unlock: ${ach.name}. ${ach.desc}` : o.desc,
                    onclick: () => pick(o),
                  },
                  owned ? o.name : ach ? `${o.name} (locked)` : h('span', null, `${o.name} `, icon('sauce', 1), ` ${o.cost}`),
                );
              }),
            ),
            locked.length > 0 && h('small', { class: 'muted unlock-hint' }, ...locked.map((o) => h('span', null, `${o.name}: ${ACHIEVEMENT_MAP[o.achievement!]?.desc ?? ''}`))),
          );
        }),
      );
    };
    render();
    this.mount(
      h(
        'div',
        { class: 'screen page' },
        this.backdrop('office'),
        h(
          'div',
          { class: 'page-body' },
          h('div', { class: 'row spread' }, h('h2', null, 'Suit Up'), sauce),
          count,
          roster,
          h('h3', null, 'Outfits'),
          grid,
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => this.title() }, 'Back'), startBtn),
        ),
      ),
    );
  }

  private achievementsList(): void {
    const meta = this.meta;
    this.overlay(
      h('h2', null, 'Achievements'),
      h('p', { class: 'muted' }, `${meta.achievements.length} of ${ACHIEVEMENTS.length} unlocked. Some unlock new outfits on the Suit Up screen.`),
      ...ACHIEVEMENTS.map((a) => {
        const got = meta.achievements.includes(a.id);
        const skins = outfitsForAchievement(a.id);
        return h(
          'div',
          { class: `ach ${got ? 'got' : ''}` },
          h('div', null, h('b', null, got ? '★ ' : '☆ ', a.name), h('p', null, a.desc), skins.length > 0 && h('small', null, 'Reward: ', skins.map((o) => `${HEROES[o.hero].name}'s ${o.name} outfit`).join(', '))),
          ...skins.map((o) => {
            const c = spriteCanvas(outfitSprite(o), 2);
            if (!got) c.classList.add('silhouette');
            return c;
          }),
        );
      }),
    );
  }

  /** A pop-up for newly unlocked achievements. */
  private toast(unlocked: Achievement[]): void {
    unlocked.forEach((a, i) => {
      const skins = outfitsForAchievement(a.id);
      const el = h(
        'div',
        { class: 'toast', style: `top: calc(${12 + i * 74}px + var(--safe-top))` },
        h('small', null, 'ACHIEVEMENT UNLOCKED'),
        h('b', null, a.name),
        skins.length > 0 && h('span', null, `New outfit: ${skins.map((o) => `${HEROES[o.hero].name}'s ${o.name}`).join(', ')}`),
      );
      document.body.append(el);
      setTimeout(() => el.classList.add('out'), 4200);
      setTimeout(() => el.remove(), 4800);
    });
  }

  /** Story dialogue in a box at the bottom of the screen. Tap or press Enter to advance. */
  private dialogue(lines: Line[], onDone: () => void): void {
    const run = this.run;
    let i = 0;
    const box = h('div', { class: 'dialogue' });
    const wrap = h('div', { class: 'dialogue-wrap' }, box);
    const close = () => {
      wrap.remove();
      window.removeEventListener('keydown', onKey);
      onDone();
    };
    const next = () => (++i >= lines.length ? close() : render());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'Escape') close();
    };
    const render = () => {
      const l = lines[i];
      const hero = HEROES[l.speaker as HeroId];
      const enemy = ENEMIES[l.speaker];
      const sprite = hero ? (run?.heroes.some((x) => x.id === hero.id) ? heroSprite(run, hero.id) : this.metaSprite(hero.id)) : enemy?.sprite;
      const name = hero?.name ?? enemy?.name ?? l.speaker;
      box.replaceChildren(
        ...(sprite ? [h('div', { class: 'portrait' }, spriteCanvas(sprite, 3, !!enemy))] : []),
        h('div', { class: 'dialogue-text' }, h('b', { style: hero ? `color:${hero.color}` : '' }, name), h('p', null, l.text)),
        h('div', { class: 'dialogue-btns' }, h('button', { class: 'btn small', onclick: (e) => (e.stopPropagation(), next()) }, i < lines.length - 1 ? 'Next' : 'OK'), h('button', { class: 'btn ghost small', onclick: (e) => (e.stopPropagation(), close()) }, 'Skip')),
      );
    };
    wrap.addEventListener('click', next);
    window.addEventListener('keydown', onKey);
    this.cleanup.push(() => window.removeEventListener('keydown', onKey));
    render();
    document.body.append(wrap);
  }

  // ---------------------------------------------------------------- run flow
  private startRun(party: HeroId[]): void {
    this.run = newRun(this.meta, randomSeed(), Object.fromEntries(party.map((id) => [id, outfitOf(id, this.meta.outfits).id])), party);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.toFight(RUN_INTRO);
  }

  /** Starts the next fight, with any story lines (run intro, boss intro, burger joint) first. */
  private toFight(before: Line[] = []): void {
    const run = this.run!;
    const meta = this.meta;
    const info = stageInfo(run.stage, run.seed);
    const lines = [...before];
    if (info.kind === 'boss') {
      lines.push(...(BOSS_LINES[info.boss!]?.intro ?? []));
      if (info.boss === RIVAL_BOSS && run.rivalEmpowered) lines.push(RIVAL_EMPOWERED_LINE);
    }
    if (info.kind === 'bonus') {
      lines.push(...BURGER_INTRO);
      bumpStat(meta, 'burgerReached');
    }
    meta.stats.bestCycle = Math.max(meta.stats.bestCycle ?? 0, info.cycle + 1);
    const unlocked = checkAchievements({ meta });
    saveMeta(meta);
    this.battleScreen(lines);
    this.toast(unlocked);
  }

  private resume(): void {
    const p = this.run?.pending;
    if (p?.kind === 'draft') this.draftScreen();
    else if (p?.kind === 'shop') this.shopScreen();
    else if (p?.kind === 'event') this.eventScreen();
    else this.toFight();
  }

  private battleScreen(intro: Line[] = []): void {
    const run = this.run!;
    const meta = this.meta;
    const battle = buildBattle(run, meta);
    const info = stageInfo(run.stage, run.seed);
    if (info.kind === 'boss') battle.events.unshift({ t: 'banner', text: ENEMIES[info.boss!].name.toUpperCase(), sub: 'BOSS FIGHT' }, { t: 'beat', dur: 1.2 });
    if (info.kind === 'bonus') battle.events.unshift({ t: 'banner', text: "VILLIAM BURGINSON'S", sub: 'Fight the crew for Village Sauce!' }, { t: 'beat', dur: 1.2 });

    const canvas = h('canvas', { class: 'field' });
    const view = new BattleView(canvas);
    view.speed = this.speed;
    view.setBattle(battle, sceneFor(run.stage));
    if (intro.length) {
      view.paused = true;
      this.starters.push(() => this.dialogue(intro, () => (view.paused = false)));
    }

    const speedBtn = h('button', { class: 'btn ghost small' }, `${this.speed}x`);
    speedBtn.onclick = () => {
      this.speed = this.speed >= 3 ? 1 : this.speed + 1;
      writePref('qvb.speed', this.speed);
      view.speed = this.speed;
      speedBtn.textContent = `${this.speed}x`;
    };
    const ptoEl = h('span', { class: 'currency' }, icon('pto'), ` ${run.pto}`);
    const hud = h(
      'div',
      { class: 'hud' },
      h('button', { class: 'btn ghost small', onclick: () => this.confirm('Leave the fight?', 'Your run is saved. This fight restarts when you come back.', 'Leave', () => this.title()) }, '❚❚'),
      h('span', { class: 'stage' }, stageLabel(run.stage, run.seed)),
      h('span', { class: 'spacer' }),
      ptoEl,
      speedBtn,
    );
    const cards = h('div', { class: 'cards' });
    const actions = h('div', { class: 'actions' });
    const infoBox = h('div', { class: 'info' });
    const panel = h('div', { class: 'panel' }, cards, actions, infoBox);
    const screen = h('div', { class: 'screen battle' }, hud, h('div', { class: 'field-wrap' }, canvas, h('div', { class: 'rotate-hint' }, 'Tip: turn your phone sideways')), panel);
    this.mount(screen);
    const ro = new ResizeObserver(() => view.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    view.resize();

    let selHero: number | undefined;
    let selAction: string | undefined;
    let inspect: number | undefined;
    let dirty = true;
    let finished = false;

    const opt = (): ActionOpt | undefined => {
      const u = selHero !== undefined ? battle.unit(selHero) : undefined;
      return u && selAction ? battle.actions(u).find((a) => a.id === selAction) : undefined;
    };
    const targetsFor = (u: Unit, o: ActionOpt): Unit[] => (o.target === 'enemy' ? battle.foesOf(u) : o.target === 'ally' ? battle.alliesOf(u) : []);
    const canInput = () => battle.phase === 'hero' && !view.busy() && !battle.outcome;

    const doAct = (targetUid?: number) => {
      if (selHero === undefined || !selAction || !canInput()) return;
      const quick = opt()?.quick;
      if (battle.act(selHero, selAction, targetUid)) {
        selAction = undefined;
        if (!quick || !battle.ready().some((x) => x.uid === selHero)) selHero = undefined;
        dirty = true;
      }
    };

    const selectAction = (o: ActionOpt) => {
      if (!o.ready || !canInput()) return;
      if (selAction === o.id && o.target !== 'enemy' && o.target !== 'ally') return doAct();
      selAction = o.id;
      inspect = undefined;
      dirty = true;
    };

    const renderPanel = () => {
      const ready = battle.ready();
      if (selHero !== undefined && !ready.some((u) => u.uid === selHero)) {
        selHero = undefined;
        selAction = undefined;
      }
      if (selHero === undefined && ready.length && canInput()) selHero = ready[0].uid;
      const hero = selHero !== undefined ? battle.unit(selHero) : undefined;
      const o = opt();
      view.highlight = { active: canInput() ? selHero : undefined, targets: hero && o && canInput() ? targetsFor(hero, o).map((t) => t.uid) : undefined };

      cards.replaceChildren(
        ...battle.heroes().map((u) => {
          const d = HEROES[u.key as HeroId];
          const done = battle.phase === 'hero' && !ready.includes(u) && u.alive;
          const state = !u.alive ? (u.reviveNext ? 'RIP?' : 'KO') : battle.has(u, 'away') ? 'AWAY' : battle.has(u, 'stun') ? 'STUN' : done ? 'DONE' : '';
          const chips = u.statuses.filter((s) => !STATUS_INFO[s.kind].hidden).map((s) => h('i', { style: `color:${STATUS_INFO[s.kind].color}`, title: statusTip(s.kind, s.dur) }, STATUS_INFO[s.kind].short));
          return h(
            'button',
            {
              class: `card ${u.uid === selHero ? 'sel' : ''} ${!u.alive ? 'ko' : ''} ${done || state ? 'done' : ''}`,
              onclick: () => {
                if (ready.includes(u) && canInput()) {
                  selHero = u.uid;
                  selAction = undefined;
                  inspect = undefined;
                } else inspect = u.uid;
                dirty = true;
              },
            },
            spriteCanvas(u.sprite, 2),
            h(
              'div',
              { class: 'card-body' },
              h('b', { style: `color:${d.color}` }, d.name, state && h('em', null, ` ${state}`)),
              h('div', { class: 'hpbar' }, h('div', { style: `width:${(100 * u.hp) / u.maxHp}%` }), u.shield > 0 && h('div', { class: 'sh', style: `width:${Math.min(100, (100 * u.shield) / u.maxHp)}%` })),
              h('small', null, `${u.hp}/${u.maxHp}`, u.shield > 0 ? ` +${u.shield}` : ''),
              chips.length ? h('div', { class: 'chips' }, ...chips) : null,
            ),
          );
        }),
      );

      if (hero && canInput()) {
        const opts = battle.actions(hero);
        actions.replaceChildren(
          ...opts.map((a, i) =>
            h(
              'button',
              {
                class: `act ${a.kind} ${a.id === selAction ? 'sel' : ''}`,
                disabled: !a.ready,
                onclick: () => selectAction(a),
                title: a.desc,
              },
              h('kbd', null, String(i + 1)),
              h('span', null, a.name),
              a.rank > 1 && h('em', null, roman(a.rank)),
              !a.ready && h('i', { class: 'cd' }, a.cdLeft > 0 ? `${a.cdLeft}` : 'X'),
              a.quick && a.ready && h('i', { class: 'quick' }, 'Q'),
            ),
          ),
        );
      } else if (battle.outcome) actions.replaceChildren(h('p', { class: 'wait' }, battle.outcome === 'win' ? 'VICTORY!' : 'Defeated...'));
      else actions.replaceChildren(h('p', { class: 'wait' }, battle.phase === 'enemy' ? 'Enemy turn...' : '...'));

      if (inspect !== undefined) {
        const u = battle.unit(inspect)!;
        const blurb = u.side === 'enemy' ? ENEMIES[u.key].blurb : HEROES[u.key as HeroId].blurb;
        infoBox.replaceChildren(
          h('b', null, u.name),
          h('p', null, `${u.hp}/${u.maxHp} HP${u.shield ? ` · ${u.shield} shield` : ''}`),
          h('p', { class: 'muted' }, blurb),
          ...u.statuses.filter((s) => !STATUS_INFO[s.kind].hidden).map((s) => h('p', { class: 'status-line' }, h('i', { style: `color:${STATUS_INFO[s.kind].color}` }, STATUS_INFO[s.kind].label), ` · ${statusTip(s.kind, s.dur, false)}`)),
        );
      } else if (hero && o && canInput()) {
        const ts = targetsFor(hero, o);
        infoBox.replaceChildren(
          h('b', null, o.name, o.quick ? h('em', null, ' QUICK') : null),
          h('p', null, o.desc),
          ts.length
            ? h('div', { class: 'targets' }, h('small', null, 'Tap a target:'), ...ts.map((t) => h('button', { class: 'btn small target', onclick: () => doAct(t.uid) }, `${t.name} ${t.hp}`)))
            : h('button', { class: 'btn use', onclick: () => doAct() }, 'USE'),
        );
      } else if (hero && canInput()) {
        infoBox.replaceChildren(h('b', null, `${hero.name}'s turn`), h('p', { class: 'muted' }, 'Pick an action. Tap enemies to inspect them.'));
      } else infoBox.replaceChildren();
    };

    const tip = h('div', { class: 'tip' });
    tip.hidden = true;
    canvas.parentElement!.append(tip);
    let tipTimer = 0;
    const showTip = (cssX: number, cssY: number): boolean => {
      const hit = view.statusAt(cssX, cssY);
      const u = hit && battle.unit(hit.uid);
      const st = u?.statuses.find((x) => x.kind === hit!.kind);
      if (!u || !st) {
        tip.hidden = true;
        return false;
      }
      tip.replaceChildren(h('b', { style: `color:${STATUS_INFO[st.kind].color}` }, `${u.name}: ${STATUS_INFO[st.kind].label}`), h('span', null, statusTip(st.kind, st.dur, false)));
      tip.hidden = false;
      const r = canvas.getBoundingClientRect();
      tip.style.left = `${Math.min(cssX + 12, r.width - 230)}px`;
      tip.style.top = `${Math.max(4, cssY - 50)}px`;
      clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => (tip.hidden = true), 3500);
      return true;
    };
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      showTip(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener('pointerleave', () => (tip.hidden = true));
    canvas.addEventListener('pointerdown', (e) => {
      if (showTip(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top)) return;
      const r = canvas.getBoundingClientRect();
      const uid = view.unitAt(e.clientX - r.left, e.clientY - r.top);
      if (uid === undefined) return;
      const hero = selHero !== undefined ? battle.unit(selHero) : undefined;
      const o = opt();
      if (hero && o && canInput() && targetsFor(hero, o).some((t) => t.uid === uid)) return doAct(uid);
      const u = battle.unit(uid)!;
      if (u.side === 'hero' && battle.ready().includes(u) && canInput()) {
        selHero = uid;
        selAction = undefined;
        inspect = undefined;
      } else inspect = uid;
      dirty = true;
    });

    const onKey = (e: KeyboardEvent) => {
      if (!canInput() || selHero === undefined) return;
      const hero = battle.unit(selHero)!;
      const opts = battle.actions(hero);
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) selectAction(opts[n - 1]);
      else if (e.key === 'Escape') selAction = undefined;
      else if (e.key === 'Enter') {
        const o = opt();
        if (o && (o.target === 'enemy' || o.target === 'ally')) doAct(targetsFor(hero, o)[0]?.uid);
        else if (o) doAct();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const r = battle.ready();
        const i = r.findIndex((u) => u.uid === selHero);
        selHero = r[(i + 1) % r.length]?.uid;
        selAction = undefined;
      } else return;
      dirty = true;
    };
    window.addEventListener('keydown', onKey);
    this.cleanup.push(() => window.removeEventListener('keydown', onKey));

    let last = performance.now();
    let wasBusy = true;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      view.update(dt);
      if (!view.busy() && battle.phase === 'enemy') {
        battle.enemyStep();
        dirty = true;
      }
      const busy = view.busy();
      if (busy !== wasBusy) dirty = true;
      wasBusy = busy;
      if (dirty && !busy) {
        renderPanel();
        dirty = false;
      } else if (dirty && busy) {
        view.highlight = {};
      }
      view.draw();
      if (battle.outcome && !busy && !finished) {
        finished = true;
        renderPanel();
        setTimeout(() => this.endFight(battle), 500);
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private endFight(battle: Battle): void {
    const run = this.run!;
    if (battle.outcome === 'win') {
      const meta = this.meta;
      const info = stageInfo(run.stage, run.seed);
      const res = finishFight(run, battle, meta);
      meta.sauce += res.sauce;
      meta.totalSauce += res.sauce;
      bumpStat(meta, 'fightsWon');
      if (info.kind === 'boss') bumpStat(meta, 'bossesBeaten');
      if (info.kind === 'bonus') bumpStat(meta, 'burgerWon');
      const unlocked = checkAchievements({ meta, fight: battle.stats });
      saveMeta(meta);
      const rng = runRng(run);
      run.pending = { kind: 'draft', step: 0, total: res.picks, options: rollDraft(run, rng, 0, res.picks) };
      saveRng(run, rng);
      saveRun(run);
      const lines = info.kind === 'boss' ? (BOSS_LINES[info.boss!]?.defeat ?? []) : info.kind === 'bonus' ? BURGER_DEFEAT : [];
      const show = () => this.victory(battle, res, unlocked);
      if (lines.length) this.dialogue(lines, show);
      else show();
    } else if (useSecondWind(run, this.meta)) {
      saveRun(run);
      const o = this.overlay(
        h('h2', null, 'Second Wind!'),
        h('p', null, 'The party gets back up at 40% HP. Run it back.'),
        h('button', { class: 'btn big', onclick: () => (o.close(), this.battleScreen()) }, 'Run it back'),
      );
    } else this.gameOver();
  }

  private victory(battle: Battle, res: FightResult, unlocked: Achievement[] = []): void {
    const run = this.run!;
    const info = stageInfo(run.stage, run.seed);
    const alive = battle.heroes().filter((u) => u.alive);
    const speaker = alive.length ? alive[Math.floor(Math.random() * alive.length)] : battle.heroes()[0];
    const quote = HEROES[speaker.key as HeroId].quotes[Math.floor(Math.random() * 2)];
    const o = this.overlay(
      h('h2', { class: 'win' }, info.kind === 'bonus' ? 'SAUCE SECURED!' : info.kind === 'boss' ? 'BOSS DEFEATED!' : 'VICTORY!'),
      h('div', { class: 'row left' }, spriteCanvas(speaker.sprite, 3), h('p', { class: 'quote' }, `${speaker.name}: "${quote}"`)),
      h('p', { class: 'currency' }, icon('pto'), ` +${res.pto} PTO Hours`),
      res.sauce > 0 && h('p', { class: 'currency big' }, icon('sauce', 3), ` +${res.sauce} Village Sauce!`),
      res.weapon && h('p', null, 'Loot: ', h('b', null, WEAPONS[res.weapon.id].name), ` for ${HEROES[res.weapon.hero].name}. Equip it in the shop.`),
      res.fullHeal && h('p', { class: 'win' }, 'The whole party is healed to full.'),
      res.picks > 3 && h('p', { class: 'win' }, `Boss bonus: ${res.picks} upgrade picks this time.`),
      ...unlocked.map((a) => {
        const skins = outfitsForAchievement(a.id);
        return h('p', { class: 'unlock' }, 'Achievement unlocked: ', h('b', null, a.name), skins.length ? ` · new outfit: ${skins.map((o) => `${HEROES[o.hero].name}'s ${o.name}`).join(', ')}` : '');
      }),
      info.kind === 'bonus' && h('p', { class: 'muted' }, 'Back to the office. Everything is tougher now.'),
      h('button', { class: 'btn big', onclick: () => (o.close(), this.draftScreen()) }, 'Level up'),
    );
  }

  private draftScreen(): void {
    const run = this.run!;
    const p = run.pending;
    if (p?.kind !== 'draft') return this.shopScreen();
    const card = (u: Upgrade) => {
      if (u.kind === 'rank') {
        const ab = ABILITIES[u.ability];
        const r = rankOf(run, u.hero, u.ability);
        const tag = ab.kind === 'ultimate' ? 'ULTIMATE' : ab.kind === 'passive' ? 'PASSIVE' : 'ABILITY';
        return h(
          'button',
          { class: 'up-card ability', onclick: () => pick(u) },
          h('div', { class: 'up-head' }, spriteCanvas(heroSprite(run, u.hero), 3), h('div', null, h('small', null, `${HEROES[u.hero].name} · ${tag}`), h('b', null, ab.name), h('em', null, `Rank ${roman(r)} → ${roman(r + 1)}`))),
          h('p', null, ab.desc(r + 1)),
        );
      }
      return h(
        'button',
        { class: 'up-card stat', onclick: () => pick(u) },
        h('div', { class: 'up-head' }, u.hero === 'all' ? h('div', { class: 'party-icons' }, ...run.heroes.map((x) => spriteCanvas(heroSprite(run, x.id), 1))) : spriteCanvas(heroSprite(run, u.hero), 3), h('div', null, h('small', null, u.hero === 'all' ? 'WHOLE PARTY' : `${HEROES[u.hero].name} · STAT`), h('b', null, u.name))),
        h('p', null, statText(u.stat, u.amount)),
      );
    };
    const total = p.total ?? 3;
    const pick = (u: Upgrade) => {
      applyUpgrade(run, this.meta, u);
      const step = p.step + 1;
      if (step >= total) {
        const rng = runRng(run);
        run.pending = { kind: 'shop', items: rollShop(run, this.meta, rng) };
        saveRng(run, rng);
        saveRun(run);
        this.shopScreen();
      } else {
        const rng = runRng(run);
        run.pending = { kind: 'draft', step, total, options: rollDraft(run, rng, step, total) };
        saveRng(run, rng);
        saveRun(run);
        this.draftScreen();
      }
    };
    this.mount(
      h(
        'div',
        { class: 'screen page' },
        this.backdrop(sceneFor(run.stage)),
        h(
          'div',
          { class: 'page-body' },
          h('h2', null, `Level Up ${p.step + 1}/${total}`),
          h('p', { class: 'muted' }, p.step === 0 || (total > 3 && p.step === 1) ? 'Pick an ability upgrade.' : 'Pick an upgrade.'),
          h('div', { class: 'up-row' }, ...p.options.map(card)),
        ),
      ),
    );
  }

  private shopScreen(): void {
    const run = this.run!;
    const meta = this.meta;
    if (run.pending?.kind !== 'shop') {
      const rng = runRng(run);
      run.pending = { kind: 'shop', items: rollShop(run, meta, rng) };
      saveRng(run, rng);
    }
    const body = h('div', { class: 'page-body' });
    const render = () => {
      const p = run.pending as { kind: 'shop'; items: import('../types').ShopItem[] };
      const next = run.stage + 1;
      const nextInfo = stageInfo(next, run.seed);
      body.replaceChildren(
        h('div', { class: 'row spread' }, h('h2', null, 'Break Room Shop'), h('span', { class: 'currency big' }, icon('pto', 3), ` ${run.pto} PTO`)),
        h(
          'div',
          { class: 'shop-grid' },
          ...p.items.map((it) =>
            h(
              'div',
              { class: `shop-item ${it.sold ? 'sold' : ''} ${it.kind}` },
              it.hero ? spriteCanvas(heroSprite(run, it.hero), 2) : icon('pto', 3),
              h('div', null, h('b', null, it.name), h('p', null, it.desc)),
              h(
                'button',
                {
                  class: 'btn small',
                  disabled: !!it.sold || run.pto < it.cost,
                  onclick: () => {
                    if (buyItem(run, meta, it)) {
                      saveRun(run);
                      render();
                    }
                  },
                },
                it.sold ? 'SOLD' : `${it.cost}`,
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn ghost small',
              disabled: run.pto < REROLL_COST,
              onclick: () => {
                run.pto -= REROLL_COST;
                const rng = runRng(run);
                run.pending = { kind: 'shop', items: rollShop(run, meta, rng) };
                saveRng(run, rng);
                saveRun(run);
                render();
              },
            },
            `Restock (${REROLL_COST})`,
          ),
        ),
        h('h3', null, 'The Party'),
        h(
          'div',
          { class: 'party' },
          ...run.heroes.map((hs) => {
            const d = HEROES[hs.id];
            const st = heroStats(hs, meta);
            const ranks = Object.entries(hs.ranks).filter(([, r]) => r > 1);
            return h(
              'div',
              { class: 'party-card' },
              h('button', { class: 'plain', onclick: () => this.heroInfo(hs.id) }, spriteCanvas(heroSprite(run, hs.id), 3)),
              h(
                'div',
                null,
                h('b', { style: `color:${d.color}` }, d.name),
                h('div', { class: 'hpbar' }, h('div', { style: `width:${(100 * hs.hp) / st.maxHp}%` })),
                h('small', null, `HP ${hs.hp}/${st.maxHp} · ATK ${st.atk.toFixed(1)} · Crit ${Math.round(st.crit * 100)}% · Dodge ${Math.round(st.dodge * 100)}% · Armor ${Math.round(st.def * 100)}%`),
                ranks.length ? h('small', { class: 'muted' }, ranks.map(([a, r]) => `${ABILITIES[a].name} ${roman(r)}${r >= MAX_RANK ? '★' : ''}`).join(' · ')) : null,
                h(
                  'div',
                  { class: 'weapons' },
                  ...hs.weapons.map((w) =>
                    h(
                      'button',
                      {
                        class: `chip ${hs.weapon === w ? 'on' : ''}`,
                        title: WEAPONS[w].desc,
                        onclick: () => {
                          hs.weapon = w;
                          saveRun(run);
                          render();
                        },
                      },
                      WEAPONS[w].name,
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
        h(
          'button',
          {
            class: 'btn big',
            onclick: () => {
              run.stage = next;
              run.pending = undefined;
              const rng = runRng(run);
              const ev = rollEvent(run, rng);
              saveRng(run, rng);
              if (ev) run.pending = { kind: 'event', id: ev.id };
              saveRun(run);
              if (ev) this.eventScreen();
              else this.toFight();
            },
          },
          'Next: ',
          nextInfo.kind === 'boss' ? `BOSS: ${nextInfo.title}` : nextInfo.kind === 'bonus' ? `BONUS: ${nextInfo.title}` : stageLabel(next, run.seed),
        ),
      );
    };
    render();
    saveRun(run);
    this.mount(h('div', { class: 'screen page' }, this.backdrop('office'), body));
  }

  /** A random event between fights: a scene, a choice, then its result. */
  private eventScreen(): void {
    const run = this.run!;
    const p = run.pending;
    const ev = p?.kind === 'event' ? EVENT_MAP[p.id] : undefined;
    if (!ev || p?.kind !== 'event') {
      run.pending = undefined;
      saveRun(run);
      return this.toFight();
    }
    const art =
      'phone' in ev.art
        ? h(
            'div',
            { class: `phone ${p.choice === undefined ? 'ringing' : ''}` },
            h('div', { class: 'phone-screen' }, h('small', null, p.choice === undefined ? 'Incoming call...' : p.choice === 0 ? 'Call in progress' : 'Call ended'), spriteCanvas(ev.art.phone, 4), h('b', null, 'Renekton')),
          )
        : 'hero' in ev.art
          ? h('div', { class: 'event-art' }, spriteCanvas(heroSprite(run, ev.art.hero), 5))
          : h('div', { class: 'event-art party' }, ...run.heroes.map((x) => spriteCanvas(heroSprite(run, x.id), 4)));
    const choose = (i: number) => {
      ev.choices[i].apply(run, this.meta);
      run.pending = { kind: 'event', id: ev.id, choice: i };
      const unlocked = checkAchievements({ meta: this.meta, event: `${ev.id}:${i}` });
      saveMeta(this.meta);
      saveRun(run);
      this.eventScreen();
      this.toast(unlocked);
    };
    const go = () => {
      run.pending = undefined;
      saveRun(run);
      this.toFight();
    };
    const chosen = p.choice !== undefined ? ev.choices[p.choice] : undefined;
    this.mount(
      h(
        'div',
        { class: 'screen page' },
        this.backdrop(sceneFor(run.stage)),
        h(
          'div',
          { class: 'page-body center event' },
          h('small', { class: 'tag' }, 'RANDOM EVENT'),
          h('h2', null, ev.title),
          art,
          chosen ? h('p', { class: 'event-result' }, chosen.result) : h('p', null, ev.text),
          chosen
            ? h('button', { class: 'btn big', onclick: go }, 'Next: ', stageInfo(run.stage, run.seed).kind === 'boss' ? `BOSS: ${stageInfo(run.stage, run.seed).title}` : stageLabel(run.stage, run.seed))
            : h('div', { class: 'row' }, ...ev.choices.map((c, i) => h('button', { class: `btn big ${c.style === 'decline' ? 'danger' : c.style === 'accept' ? 'accept' : ''}`, onclick: () => choose(i) }, c.label))),
        ),
      ),
    );
  }

  private gameOver(): void {
    const run = this.run!;
    const { rank } = recordRun({ stage: run.stage, fights: run.fightsWon, kills: run.kills, sauce: run.sauceEarned, date: Date.now() });
    this.meta.bestStage = Math.max(this.meta.bestStage, run.stage);
    saveMeta(this.meta);
    this.run = null;
    saveRun(null);
    const info = stageInfo(run.stage, run.seed);
    const fallen = info.kind === 'minion' ? 'the office minions' : info.title;
    this.mount(
      h(
        'div',
        { class: 'screen page' },
        this.backdrop(sceneFor(run.stage)),
        h(
          'div',
          { class: 'page-body center' },
          h('h1', { class: 'over' }, 'GAME OVER'),
          h('p', { class: 'quote' }, '"If it weren\'t for the brain fog I\'d really have to experience this"'),
          h('p', null, `The party fell to ${fallen} (${stageLabel(run.stage, run.seed)}).`),
          h('p', null, `${run.fightsWon} fights won · ${run.kills} KOs · `, icon('sauce'), ` ${run.sauceEarned} sauce this run`),
          rank === 0 && h('p', { class: 'win' }, 'New personal best!'),
          h('div', { class: 'row' }, h('button', { class: 'btn big', onclick: () => this.suitUp() }, 'Run it back'), h('button', { class: 'btn ghost', onclick: () => this.sauceShop() }, 'Sauce Shop'), h('button', { class: 'btn ghost', onclick: () => this.title() }, 'Title')),
        ),
      ),
    );
  }
}
