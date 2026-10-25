import type { Battle, Unit } from '../combat/battle';
import { CLASSES, CLASS_IDS, levelMult, skillRank } from '../data/classes';
import { GEAR_EFFECTS, RELIC_MAP, UPGRADES } from '../data/effects';
import { ENEMIES, REGIONS, cycleOf, isBossWave, regionIndex } from '../data/enemies';
import { describeMods, gearScore } from '../data/gear';
import { ASCENSION_TEXT, EPITAPHS, TITLE_LINES } from '../data/lore';
import {
  applyReward,
  bargainDue,
  buildBattle,
  buildHero,
  completeWave,
  embersEarned,
  newRun,
  rollBargains,
  rollRewards,
  runRng,
  saveRng,
} from '../game/run';
import { bestByParty, loadBoard, loadMeta, loadRun, recordRun, saveMeta, saveRun } from '../game/storage';
import { BattleView } from '../render/scene';
import { getSprite } from '../render/sprites';
import type { ClassId, Gear, MetaState, Reward, Row, RunState } from '../types';

type Child = Node | string | number | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; onclick?: (e: Event) => void; disabled?: boolean; style?: string } | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props?.class) el.className = props.class;
  if (props?.onclick) el.addEventListener('click', props.onclick);
  if (props?.disabled) (el as HTMLButtonElement).disabled = true;
  if (props?.style) el.setAttribute('style', props.style);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function portrait(id: string, scale = 3): HTMLCanvasElement {
  const s = getSprite(id);
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  c.getContext('2d')!.drawImage(s.normal, 0, 0);
  c.className = 'pixel';
  c.style.width = `${s.w * scale}px`;
  c.style.height = `${s.h * scale}px`;
  return c;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const STEP = 1 / 30;
const pct = (n: number) => `${Math.round(n * 100)}%`;

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

export class App {
  private meta: MetaState = loadMeta();
  private run: RunState | null = loadRun();
  private raf = 0;
  private cleanup: (() => void)[] = [];
  private speed = readPref('fott.speed', 1);

  constructor(private root: HTMLElement) {}

  start(): void {
    this.title();
  }

  private mount(screen: HTMLElement): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup.splice(0)) fn();
    this.root.replaceChildren(screen);
    screen.scrollTop = 0;
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
      h('p', { class: 'muted' }, text),
      h(
        'div',
        { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn secondary', style: 'flex:1', onclick: () => o.close() }, 'Back'),
        h('button', { class: 'btn danger', style: 'flex:1', onclick: () => (o.close(), onYes()) }, yes),
      ),
    );
  }

  /** Runs an animated backdrop for menu screens. */
  private animatedBackdrop(canvas: HTMLCanvasElement, region: number): void {
    const view = new BattleView(canvas, 0.68);
    let last = performance.now();
    const ro = new ResizeObserver(() => view.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    view.resize();
    view.setRegion(region);
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      view.update(dt);
      view.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- Title
  private title(): void {
    const canvas = h('canvas', { class: 'title-bg' });
    const run = this.run;
    const content = h(
      'div',
      { class: 'title-content' },
      h('div', { class: 'muted num', style: 'font-size:0.7rem;letter-spacing:0.2em' }, 'A DARK FANTASY ROGUELIKE'),
      h('h1', { style: 'margin-top:8px' }, 'Fall of the', h('br'), 'Throne'),
      h('div', { class: 'tagline' }, TITLE_LINES[Math.floor(Math.random() * TITLE_LINES.length)]),
      h('div', { class: 'spacer' }),
      h(
        'div',
        { class: 'stack' },
        run &&
          h(
            'button',
            { class: 'btn', onclick: () => this.resume() },
            'Continue',
            h('span', { class: 'muted', style: 'font-weight:400' }, ` · Wave ${run.wave}`),
          ),
        h(
          'button',
          {
            class: run ? 'btn secondary' : 'btn',
            onclick: () =>
              run
                ? this.confirm('Abandon your run?', 'Your current warband will fall. You keep the Embers earned so far.', 'Abandon', () =>
                    this.endRun('abandon', () => this.partySelect()),
                  )
                : this.partySelect(),
          },
          'New Run',
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn secondary', style: 'flex:1', onclick: () => this.altar() },
            'Altar ',
            h('span', { class: 'embers' }, `${this.meta.embers}`),
          ),
          h('button', { class: 'btn secondary', style: 'flex:1', onclick: () => this.legends() }, 'Legends'),
        ),
        this.meta.runs > 0 &&
          h('div', { class: 'muted center', style: 'font-size:0.85rem' }, `Runs: ${this.meta.runs} · Deepest wave: ${this.meta.bestWave}`),
      ),
    );
    const screen = h('div', { class: 'screen full' }, canvas, content);
    this.mount(screen);
    this.animatedBackdrop(canvas, 1);
  }

  // ---------------------------------------------------------------- Party select
  private partySelect(): void {
    const picks: { cls: ClassId; row: Row }[] = [];
    let focus: ClassId = 'knight';
    const screen = h('div', { class: 'screen' });

    const render = () => {
      const grid = h(
        'div',
        { class: 'class-grid' },
        ...CLASS_IDS.map((id) => {
          const c = CLASSES[id];
          const idx = picks.findIndex((p) => p.cls === id);
          return h(
            'button',
            {
              class: `card class-card${idx >= 0 ? ' selected' : ''}`,
              onclick: () => {
                focus = id;
                if (idx >= 0) picks.splice(idx, 1);
                else if (picks.length < 4) picks.push({ cls: id, row: c.row });
                render();
              },
            },
            portrait(id, 3),
            h('div', { style: 'min-width:0' }, h('div', { class: 'name', style: 'font-size:0.9rem' }, c.name), h('div', { class: 'role' }, c.role)),
            idx >= 0 && h('div', { class: 'order-badge' }, idx + 1),
          );
        }),
      );

      const fc = CLASSES[focus];
      const details = h(
        'div',
        { class: 'card' },
        h('div', { class: 'row' }, h('div', { class: 'name' }, `${fc.name} `, h('span', { class: 'muted', style: 'font-weight:400;font-size:0.85rem' }, fc.title))),
        h(
          'div',
          { class: 'stat-line', style: 'margin:4px 0;color:var(--muted)' },
          `HP ${fc.hp} · ATK ${fc.atk} · ARM ${fc.armor} · ${(1 / fc.interval).toFixed(1)} atk/s`,
        ),
        h('div', { class: 'desc' }, h('b', null, fc.skillName), ` — ${fc.skillDesc(1)}`),
        h('div', { class: 'lore', style: 'margin-top:6px' }, fc.lore),
      );

      const slot = (row: Row) =>
        h(
          'div',
          { class: 'slot' },
          h('div', { class: 'slot-label' }, row === 'front' ? 'FRONT ROW — takes melee hits' : 'BACK ROW — protected'),
          ...picks
            .filter((p) => p.row === row)
            .map((p) =>
              h(
                'button',
                {
                  class: 'chip',
                  onclick: () => {
                    p.row = p.row === 'front' ? 'back' : 'front';
                    render();
                  },
                },
                portrait(p.cls, 1.5),
                CLASSES[p.cls].name.split(' ').pop()!,
              ),
            ),
        );

      screen.replaceChildren(
        h(
          'div',
          { class: 'row', style: 'margin-bottom:10px' },
          h('button', { class: 'icon-btn', onclick: () => this.title() }, '<'),
          h('h2', null, 'Assemble Your Warband'),
        ),
        h('p', { class: 'muted', style: 'margin-top:0' }, 'Choose 3 or 4 heroes. They fight for the whole run.'),
        grid,
        h('div', { style: 'height:10px' }),
        details,
        h('div', { style: 'height:10px' }),
        h('div', { class: 'muted', style: 'font-size:0.85rem;margin-bottom:4px' }, 'Formation — tap a hero to switch rows'),
        h('div', { class: 'formation' }, slot('back'), slot('front')),
        h('div', { style: 'height:12px' }),
        h(
          'button',
          {
            class: 'btn',
            disabled: picks.length < 3,
            onclick: () => {
              this.run = newRun(picks, this.meta);
              saveRun(this.run);
              this.beginWave();
            },
          },
          picks.length < 3 ? `Choose ${3 - picks.length} more` : 'Begin the March',
        ),
      );
    };
    render();
    this.mount(screen);
  }

  // ---------------------------------------------------------------- Flow
  private resume(): void {
    const run = this.run;
    if (!run) return this.title();
    if (run.pending) return run.pending.bargain ? this.bargain() : this.rewards();
    this.beginWave(true);
  }

  private beginWave(resumed = false): void {
    const run = this.run!;
    const regionStart = (run.wave - 1) % 10 === 0;
    const go = () => (isBossWave(run.wave) ? this.bossIntro(() => this.battle()) : this.battle());
    if (regionStart || resumed) this.regionIntro(go);
    else go();
  }

  private regionIntro(next: () => void): void {
    const run = this.run!;
    const ri = regionIndex(run.wave);
    const r = REGIONS[ri];
    const cycle = cycleOf(run.wave);
    const canvas = h('canvas', { class: 'title-bg' });
    const content = h(
      'div',
      { class: 'title-content intro' },
      h('div', { class: 'chapter' }, cycle > 0 ? `ASCENSION ${ROMAN[cycle - 1] ?? cycle} · CHAPTER ${ROMAN[ri]}` : `CHAPTER ${ROMAN[ri]}`),
      h('h1', { style: 'font-size:2rem' }, r.name),
      h('div', { class: 'tagline', style: 'margin:0' }, r.subtitle),
      h('div', { class: 'divider' }),
      h('p', { class: 'lore', style: 'font-size:1.05rem' }, r.intro),
      h('div', { class: 'muted num', style: 'font-size:0.75rem' }, `WAVE ${run.wave}`),
      h('button', { class: 'btn', style: 'margin-top:20px', onclick: next }, 'March On'),
    );
    this.mount(h('div', { class: 'screen full' }, canvas, content));
    this.animatedBackdrop(canvas, ri);
  }

  private bossIntro(next: () => void): void {
    const run = this.run!;
    const boss = ENEMIES[REGIONS[regionIndex(run.wave)].boss];
    const screen = h(
      'div',
      { class: 'screen intro' },
      h('div', { class: 'chapter', style: 'color:var(--blood)' }, 'A DEMIGOD BARS THE WAY'),
      h('div', { style: 'display:flex;justify-content:center;margin:12px 0' }, portrait(boss.sprite, 6)),
      h('h2', { style: 'font-size:1.6rem' }, boss.name),
      h('p', { class: 'lore', style: 'font-size:1.05rem' }, boss.lore),
      h('div', { class: 'muted num', style: 'font-size:0.75rem' }, `WAVE ${run.wave}`),
      h('button', { class: 'btn danger', style: 'margin-top:16px', onclick: next }, 'Face Them'),
    );
    this.mount(screen);
  }

  // ---------------------------------------------------------------- Battle
  private battle(): void {
    const run = this.run!;
    const { battle } = buildBattle(run, this.meta);
    saveRun(run);
    const ri = regionIndex(run.wave);
    const canvas = h('canvas');
    const view = new BattleView(canvas);
    view.setBattle(battle, ri);

    const speedBtn = h('button', { class: 'icon-btn' }, `${this.speed}x`);
    speedBtn.addEventListener('click', () => {
      this.speed = this.speed >= 3 ? 1 : this.speed + 1;
      writePref('fott.speed', this.speed);
      speedBtn.textContent = `${this.speed}x`;
    });
    let paused = false;
    const menuBtn = h('button', { class: 'icon-btn' }, 'II');
    menuBtn.addEventListener('click', () => {
      paused = true;
      const o = this.overlay(
        h('h2', null, 'Paused'),
        h('p', { class: 'muted' }, 'Your progress is saved after every wave.'),
        h(
          'div',
          { class: 'stack', style: 'margin-top:12px' },
          h('button', { class: 'btn', onclick: () => (o.close(), (paused = false)) }, 'Resume'),
          h('button', { class: 'btn secondary', onclick: () => this.warband() }, 'Warband'),
          h('button', { class: 'btn secondary', onclick: () => (o.close(), this.title()) }, 'Save & Quit'),
        ),
      );
      o.el.addEventListener('click', (e) => e.target === o.el && (paused = false));
    });

    const top = h(
      'div',
      { class: 'battle-top' },
      h(
        'div',
        { class: 'wave-label', style: 'flex:1' },
        `Wave ${run.wave}`,
        isBossWave(run.wave) && h('span', { style: 'color:var(--blood)' }, ' · Boss'),
        h('small', null, REGIONS[ri].name),
      ),
      speedBtn,
      menuBtn,
    );

    const hud = h('div', { class: 'party-hud', style: `grid-template-columns:repeat(${run.heroes.length},1fr)` });
    const heroUnits = battle.heroes();
    const hudParts = heroUnits.map((u) => {
      const hp = h('i');
      const en = h('i');
      const el = h(
        'div',
        { class: 'hud-hero' },
        portrait(u.sprite, 2),
        h('div', { class: 'lvl' }, `LV ${run.heroes[u.heroIndex].level}`),
        h('div', { class: 'bar' }, hp),
        h('div', { class: 'bar energy' }, en),
      );
      hud.append(el);
      return { u, el, hp, en };
    });

    const screen = h('div', { class: 'screen full' }, h('div', { class: 'battle' }, top, canvas, hud));
    this.mount(screen);

    const ro = new ResizeObserver(() => view.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    view.resize();

    let acc = 0;
    let last = performance.now();
    let endT = 0;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (paused && !document.querySelector('.overlay')) paused = false;
      if (!paused) {
        const sdt = dt * this.speed;
        acc += sdt;
        while (acc >= STEP && !battle.outcome) {
          battle.step(STEP);
          acc -= STEP;
        }
        view.update(sdt);
        for (const p of hudParts) updateHud(p);
        if (battle.outcome) {
          endT += dt;
          if (endT > 1.4) return this.finishBattle(battle);
        }
      }
      view.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private finishBattle(battle: Battle): void {
    const run = this.run!;
    if (battle.outcome !== 'win') return this.endRun('death');
    const clearedBoss = isBossWave(run.wave);
    const finalBoss = clearedBoss && regionIndex(run.wave) === REGIONS.length - 1;
    completeWave(run, battle);
    const rng = runRng(run);
    run.pending = {
      title: clearedBoss ? 'A Demigod Falls' : `Wave ${run.wave - 1} Cleared`,
      options: rollRewards(run, this.meta, rng),
    };
    saveRng(run, rng);
    saveRun(run);
    if (run.wave - 1 > this.meta.bestWave) {
      this.meta.bestWave = run.wave - 1;
      saveMeta(this.meta);
    }
    if (finalBoss) this.throneFallen();
    else this.rewards();
  }

  private throneFallen(): void {
    const screen = h(
      'div',
      { class: 'screen intro' },
      h('div', { class: 'chapter' }, 'THE AGE ENDS'),
      h('h1', { class: 'victory-title' }, 'The Throne Has Fallen'),
      h('div', { class: 'divider' }),
      h('p', { class: 'lore', style: 'font-size:1.05rem' }, ASCENSION_TEXT),
      h('button', { class: 'btn', style: 'margin-top:20px', onclick: () => this.rewards() }, 'Claim Your Spoils'),
    );
    this.mount(screen);
  }

  // ---------------------------------------------------------------- Rewards
  private rewards(): void {
    const run = this.run!;
    const pending = run.pending!;
    let chosen = -1;
    const screen = h('div', { class: 'screen' });
    const render = () => {
      const cards = pending.options.map((r, i) =>
        this.rewardCard(r, i === chosen, () => {
          chosen = i;
          render();
        }),
      );
      screen.replaceChildren(
        h('div', { class: 'muted num', style: 'font-size:0.7rem;letter-spacing:0.15em' }, `${REGIONS[regionIndex(run.wave - 1)].name.toUpperCase()}`),
        h('h2', { style: 'font-size:1.6rem' }, pending.title),
        h('p', { class: 'muted', style: 'margin-top:2px' }, 'Choose your spoils.'),
        h('div', { class: 'stack', style: 'margin-top:8px' }, ...cards),
        h('div', { class: 'spacer', style: 'min-height:14px' }),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn secondary small', onclick: () => this.warband() }, 'Warband'),
          h(
            'button',
            {
              class: 'btn secondary small',
              disabled: run.rerolls <= 0,
              onclick: () => {
                run.rerolls--;
                const rng = runRng(run);
                pending.options = rollRewards(run, this.meta, rng);
                saveRng(run, rng);
                saveRun(run);
                chosen = -1;
                render();
              },
            },
            `Reroll (${run.rerolls})`,
          ),
          h('div', { class: 'spacer' }),
          h(
            'button',
            {
              class: 'btn',
              disabled: chosen < 0,
              onclick: () => {
                applyReward(run, pending.options[chosen]);
                run.pending = undefined;
                if (bargainDue(run)) {
                  const rng = runRng(run);
                  const options = rollBargains(run, rng);
                  saveRng(run, rng);
                  if (options.length) run.pending = { title: 'A Dark Bargain', options, bargain: true };
                }
                saveRun(run);
                if (run.pending) this.bargain();
                else this.beginWave();
              },
            },
            'Claim',
          ),
        ),
      );
    };
    render();
    this.mount(screen);
  }

  private rewardCard(r: Reward, selected: boolean, onclick: () => void): HTMLElement {
    const run = this.run!;
    const art = h('div', { class: 'card-art' });
    let kind = '';
    let name: Child = '';
    let rarity = '';
    const body: Child[] = [];

    if (r.kind === 'level') {
      const hs = run.heroes[r.hero];
      const c = CLASSES[hs.cls];
      art.append(portrait(hs.cls, 2.5));
      kind = 'Level up';
      name = `${c.name} · Lv ${hs.level} → ${hs.level + 1}`;
      const gain = levelMult(hs.level + 1) / levelMult(hs.level) - 1;
      body.push(h('div', { class: 'stat-line' }, `+${pct(gain)} HP & ATK · +2 ARM`));
      if (skillRank(hs.level + 1) > skillRank(hs.level))
        body.push(h('div', { class: 'desc' }, h('b', { style: 'color:var(--gold)' }, `${c.skillName} empowered: `), c.skillDesc(skillRank(hs.level + 1))));
    } else if (r.kind === 'gear') {
      const hs = run.heroes[r.hero];
      const current = hs.gear[r.gear.slot];
      art.append(portrait(hs.cls, 2.5));
      kind = `${r.gear.rarity} ${r.gear.slot} · for ${CLASSES[hs.cls].name}`;
      name = r.gear.name;
      rarity = ` rarity-${r.gear.rarity}`;
      body.push(...gearLines(r.gear));
      if (current) {
        const better = gearScore(r.gear) >= gearScore(current);
        body.push(
          h('div', { class: `stat-line${better ? '' : ' down'}`, style: 'color:var(--muted)' }, `Replaces ${current.name} ${better ? '▲' : '▼'}`),
        );
      }
      body.push(h('div', { class: 'lore', style: 'margin-top:4px' }, r.gear.lore));
    } else {
      const d = RELIC_MAP[r.id];
      const bargain = r.kind === 'bargain';
      art.append(h('div', { class: `glyph${bargain ? ' bargain' : ''}` }, bargain ? '☾' : '✦'));
      kind = bargain ? 'Dark bargain' : 'Relic';
      name = d.name;
      body.push(h('div', { class: `desc${bargain ? ' boon' : ''}` }, d.desc));
      if (d.curse) body.push(h('div', { class: 'desc curse' }, `Price: ${d.curse}`));
      body.push(h('div', { class: 'lore', style: 'margin-top:4px' }, d.lore));
    }

    return h(
      'button',
      { class: `card${selected ? ' selected' : ''}${rarity}`, onclick },
      h('div', { class: 'row', style: 'align-items:flex-start;gap:12px' }, art, h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'kind' }, kind), h('div', { class: 'name' }, name), ...body)),
    );
  }

  private bargain(): void {
    const run = this.run!;
    const pending = run.pending!;
    let chosen = -1;
    const screen = h('div', { class: 'screen' });
    const proceed = (r: Reward | null) => {
      if (r) applyReward(run, r);
      run.pending = undefined;
      saveRun(run);
      this.beginWave();
    };
    const render = () => {
      screen.replaceChildren(
        h('div', { class: 'chapter muted num', style: 'font-size:0.7rem;letter-spacing:0.15em;color:var(--curse)' }, 'A VOICE IN THE ASH'),
        h('h2', { style: 'font-size:1.6rem' }, pending.title),
        h('p', { class: 'lore' }, 'Power is offered. Power is never free. You may refuse, and walk on as you are.'),
        h(
          'div',
          { class: 'stack', style: 'margin-top:8px' },
          ...pending.options.map((r, i) =>
            this.rewardCard(r, i === chosen, () => {
              chosen = i;
              render();
            }),
          ),
        ),
        h('div', { class: 'spacer', style: 'min-height:14px' }),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn secondary', style: 'flex:1', onclick: () => proceed(null) }, 'Refuse'),
          h('button', { class: 'btn danger', style: 'flex:1', disabled: chosen < 0, onclick: () => proceed(pending.options[chosen]) }, 'Accept'),
        ),
      );
    };
    render();
    this.mount(screen);
  }

  // ---------------------------------------------------------------- Warband
  private warband(): void {
    const run = this.run;
    if (!run) return;
    const heroes = run.heroes.map((hs, i) => {
      const u = buildHero(hs, i, this.meta);
      const c = CLASSES[hs.cls];
      return h(
        'div',
        { class: 'card', style: 'margin-bottom:8px' },
        h(
          'div',
          { class: 'row', style: 'align-items:flex-start;gap:12px' },
          h('div', { class: 'card-art' }, portrait(hs.cls, 2.5)),
          h(
            'div',
            { style: 'flex:1;min-width:0' },
            h('div', { class: 'kind' }, `Level ${hs.level} · ${hs.row} row`),
            h('div', { class: 'name' }, c.name),
            h('div', { class: 'stat-line', style: 'color:var(--muted)' }, statSummary(u)),
            h('div', { class: 'desc' }, h('b', null, `${c.skillName} ${ROMAN[skillRank(hs.level) - 1]}: `), c.skillDesc(skillRank(hs.level))),
            ...(['weapon', 'armor', 'trinket'] as const).map((slot) => {
              const g = hs.gear[slot];
              return h(
                'div',
                { class: 'desc', style: 'font-size:0.88rem' },
                h('span', { class: 'tag' }, slot),
                ' ',
                g ? h('span', { style: `color:${g.rarity === 'legendary' ? 'var(--legendary)' : g.rarity === 'rare' ? 'var(--rare)' : 'inherit'}` }, g.name) : h('span', { class: 'muted' }, 'empty'),
                g && h('span', { class: 'muted' }, ` — ${describeMods(g.mods).join(', ')}${g.effect ? '. ' + GEAR_EFFECTS[g.effect].desc : ''}`),
              );
            }),
          ),
        ),
      );
    });
    const relics = [...run.relics, ...run.bargains].map((id) => {
      const d = RELIC_MAP[id];
      return h(
        'div',
        { class: 'list-row' },
        h('div', { class: `glyph${d.curse ? ' bargain' : ''}`, style: 'font-size:20px;width:24px;text-align:center' }, d.curse ? '☾' : '✦'),
        h('div', null, h('div', { class: 'name', style: 'font-family:Cinzel;font-weight:700;color:var(--gold-hi)' }, d.name), h('div', { style: 'font-size:0.9rem' }, d.desc), d.curse && h('div', { class: 'curse', style: 'font-size:0.9rem;color:var(--curse)' }, d.curse)),
      );
    });
    const o = this.overlay(
      h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, 'Your Warband'), h('button', { class: 'icon-btn', onclick: () => o.close() }, 'X')),
      h(
        'div',
        { class: 'muted', style: 'font-size:0.9rem;margin:4px 0 10px' },
        `Wave ${run.wave} · ${run.kills} slain · Rerolls ${run.rerolls}${this.meta.upgrades.flask ? ` · Flask ${run.flaskCharges}` : ''}`,
      ),
      ...heroes,
      h('h3', { style: 'margin-top:12px' }, 'Relics & Bargains'),
      relics.length ? h('div', null, ...relics) : h('p', { class: 'muted' }, 'None yet.'),
    );
  }

  // ---------------------------------------------------------------- Death
  private endRun(reason: 'death' | 'abandon', after?: () => void): void {
    const run = this.run!;
    const earned = embersEarned(run, this.meta);
    this.meta.embers += earned;
    this.meta.runs++;
    this.meta.bestWave = Math.max(this.meta.bestWave, run.wave - 1);
    saveMeta(this.meta);
    const { rank } = recordRun({ wave: run.wave - 1, party: run.heroes.map((x) => x.cls), kills: run.kills, date: Date.now(), embers: earned });
    this.run = null;
    saveRun(null);
    if (after) return after();

    const ri = regionIndex(run.wave);
    const screen = h(
      'div',
      { class: 'screen intro' },
      h('h1', { class: 'death-title' }, reason === 'death' ? 'Your Warband Has Fallen' : 'The March Is Ended'),
      h('p', { class: 'lore', style: 'font-size:1.05rem' }, EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)]),
      h('div', { style: 'display:flex;justify-content:center;gap:6px;margin:8px 0;filter:grayscale(0.7) brightness(0.7)' }, ...run.heroes.map((x) => portrait(x.cls, 3))),
      h(
        'div',
        { class: 'card stat-grid', style: 'text-align:left' },
        h('div', null, 'Waves cleared ', h('b', null, run.wave - 1)),
        h('div', null, 'Foes slain ', h('b', null, run.kills)),
        h('div', null, 'Demigods felled ', h('b', null, run.bossesSlain)),
        h('div', null, 'Fell in ', h('b', { style: 'font-size:0.7rem' }, REGIONS[ri].name.replace('The ', ''))),
      ),
      h('div', { style: 'font-size:1.2rem' }, 'Embers gained ', h('span', { class: 'embers' }, `+${earned}`)),
      rank >= 0 && rank < 10 && h('div', { class: 'muted' }, `Ranked #${rank + 1} in the Hall of Legends`),
      h(
        'div',
        { class: 'stack', style: 'margin-top:12px' },
        h('button', { class: 'btn', onclick: () => this.altar() }, 'Altar of Embers'),
        h('button', { class: 'btn secondary', onclick: () => this.partySelect() }, 'March Again'),
        h('button', { class: 'btn secondary', onclick: () => this.title() }, 'Title'),
      ),
    );
    this.mount(screen);
  }

  // ---------------------------------------------------------------- Altar
  private altar(): void {
    const screen = h('div', { class: 'screen' });
    const render = () => {
      const rows = UPGRADES.map((u) => {
        const lvl = this.meta.upgrades[u.id] ?? 0;
        const maxed = lvl >= u.max;
        const cost = u.cost(lvl);
        return h(
          'div',
          { class: 'list-row' },
          h(
            'div',
            { style: 'flex:1;min-width:0' },
            h('div', { class: 'name', style: 'font-family:Cinzel;font-weight:700;color:var(--gold-hi)' }, u.name, ' ', h('span', { class: 'tag' }, `${lvl}/${u.max}`)),
            lvl > 0 && h('div', { style: 'font-size:0.9rem' }, u.desc(lvl)),
            !maxed && h('div', { class: 'muted', style: 'font-size:0.9rem' }, `${lvl > 0 ? 'Next: ' : ''}${u.desc(lvl + 1)}`),
          ),
          h(
            'button',
            {
              class: 'btn small',
              disabled: maxed || this.meta.embers < cost,
              onclick: () => {
                this.meta.embers -= cost;
                this.meta.upgrades[u.id] = lvl + 1;
                saveMeta(this.meta);
                render();
              },
            },
            maxed ? 'Max' : h('span', { class: 'embers' }, `${cost}`),
          ),
        );
      });
      screen.replaceChildren(
        h('div', { class: 'row', style: 'margin-bottom:6px' }, h('button', { class: 'icon-btn', onclick: () => this.title() }, '<'), h('h2', { style: 'flex:1' }, 'Altar of Embers'), h('span', { class: 'embers', style: 'font-size:1.1rem' }, `${this.meta.embers}`)),
        h('p', { class: 'lore', style: 'margin-top:0' }, 'The embers of fallen warbands. Feed them to the altar, and the next to march will be stronger.'),
        h('p', { class: 'muted', style: 'font-size:0.85rem;margin:0' }, 'Upgrades apply to new runs.'),
        ...rows,
        h('div', { style: 'height:12px' }),
        h('button', { class: 'btn', onclick: () => (this.run ? this.title() : this.partySelect()) }, this.run ? 'Back' : 'March Again'),
      );
    };
    render();
    this.mount(screen);
  }

  // ---------------------------------------------------------------- Legends
  private legends(): void {
    const board = loadBoard();
    const partyRow = (party: ClassId[]) => h('div', { class: 'row', style: 'gap:2px' }, ...party.map((c) => portrait(c, 1.5)));
    const best = bestByParty(board).slice(0, 10);
    const screen = h(
      'div',
      { class: 'screen' },
      h('div', { class: 'row', style: 'margin-bottom:6px' }, h('button', { class: 'icon-btn', onclick: () => this.title() }, '<'), h('h2', null, 'Hall of Legends')),
      h('p', { class: 'lore', style: 'margin-top:0' }, 'Here are carved the deeds of those who marched on the Throne.'),
      !board.length && h('p', { class: 'muted' }, 'No legends yet. Go and make one.'),
      best.length > 0 && h('h3', { style: 'margin-top:10px' }, 'Best by Warband'),
      ...best.map((e) => h('div', { class: 'list-row' }, partyRow(e.party), h('div', { class: 'spacer' }), h('div', { class: 'num', style: 'color:var(--gold-hi)' }, `Wave ${e.wave}`))),
      board.length > 0 && h('h3', { style: 'margin-top:16px' }, 'Greatest Runs'),
      ...board.slice(0, 10).map((e, i) =>
        h(
          'div',
          { class: 'list-row' },
          h('div', { class: 'num muted', style: 'width:22px' }, `${i + 1}`),
          partyRow(e.party),
          h('div', { class: 'spacer' }),
          h('div', { style: 'text-align:right' }, h('div', { class: 'num', style: 'color:var(--gold-hi)' }, `Wave ${e.wave}`), h('div', { class: 'muted', style: 'font-size:0.75rem' }, `${e.kills} slain · ${new Date(e.date).toLocaleDateString()}`)),
        ),
      ),
    );
    this.mount(screen);
  }
}

function updateHud(p: { u: Unit; el: HTMLElement; hp: HTMLElement; en: HTMLElement }): void {
  const { u } = p;
  p.hp.style.transform = `scaleX(${Math.max(0, u.hp / u.maxHp)})`;
  p.en.style.transform = `scaleX(${Math.min(1, u.energy / 100)})`;
  p.el.classList.toggle('dead', !u.alive);
}

function statSummary(u: Unit): string {
  const parts = [`HP ${u.maxHp}`, `ATK ${Math.round(u.atk)}`, `ARM ${Math.round(u.armor)}`, `${(1 / u.interval).toFixed(2)}/s`, `CRIT ${pct(u.crit)}`];
  if (u.dodge) parts.push(`DODGE ${pct(u.dodge)}`);
  if (u.lifesteal) parts.push(`LEECH ${pct(u.lifesteal)}`);
  return parts.join(' · ');
}

function gearLines(g: Gear): HTMLElement[] {
  const out = [h('div', { class: 'stat-line' }, describeMods(g.mods).join(' · '))];
  if (g.effect) out.push(h('div', { class: 'desc', style: 'color:var(--legendary)' }, GEAR_EFFECTS[g.effect].desc));
  return out;
}
