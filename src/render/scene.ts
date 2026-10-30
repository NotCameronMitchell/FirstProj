import type { BEvent, Battle, Unit } from '../combat/battle';
import { HEROES } from '../data/heroes';
import { STATUS_INFO, type HeroId, type Side, type StatusKind } from '../types';
import { paintBackground, sceneSign, type Scene } from './backgrounds';
import { getSprite } from './sprites';

/** Minimum logical size of the battlefield in game pixels. */
const LW = 200;
const LH = 112;
const FONT = '"Press Start 2P", "Courier New", monospace';

interface Vis {
  x: number;
  y: number;
  alpha: number;
  flash: number;
  lunge: number;
  lungeTo: { x: number; y: number } | null;
  pet: 'bruno' | 'murphy' | null;
  hp: number;
  shield: number;
  dead: boolean;
  sprite: string;
  bob: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  life: number;
}

interface Bubble {
  uid: number;
  text: string;
  t: number;
  life: number;
}

interface Proj {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  t: number;
  dur: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  t: number;
  color: string;
  gravity: number;
}

/** Hero columns, as offsets from the centre: front line, then back line. */
const HERO_COLS = [-28, -62];

interface Fx {
  kind: 'wife' | 'truck';
  uid: number;
  t: number;
  life: number;
}

/** A status icon drawn over a unit, in device pixels, for hover tooltips. */
interface Pip {
  x: number;
  y: number;
  size: number;
  uid: number;
  kind: StatusKind;
}

export class BattleView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private px = 3;
  private lw = LW;
  private lh = LH;
  private groundY = 48;
  private battle: Battle | null = null;
  private scene: Scene = 'office';
  private bg: HTMLCanvasElement | null = null;
  private eventIndex = 0;
  private wait = 0;
  private vis = new Map<number, Vis>();
  private floaters: Floater[] = [];
  private bubbles: Bubble[] = [];
  private projs: Proj[] = [];
  private particles: Particle[] = [];
  private flashes: { side: Side; color: string; t: number }[] = [];
  private fxs: Fx[] = [];
  private pips: Pip[] = [];
  private banner: { text: string; sub?: string; t: number } | null = null;
  private turn: { side: Side; round: number } | null = null;
  private shake = 0;
  private time = 0;
  private rects = new Map<number, { x: number; y: number; w: number; h: number }>();
  speed = 1;
  /** Holds event playback (e.g. while story dialogue is up). */
  paused = false;
  /** The hero whose move is being chosen, and the units that can be targeted. */
  highlight: { active?: number; targets?: number[] } = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setBattle(b: Battle | null, scene: Scene): void {
    this.battle = b;
    this.eventIndex = 0;
    this.wait = 0;
    this.vis.clear();
    this.floaters = [];
    this.bubbles = [];
    this.projs = [];
    this.particles = [];
    this.flashes = [];
    this.banner = null;
    this.turn = null;
    this.highlight = {};
    this.setScene(scene);
    if (b) for (const u of b.units) this.vis.set(u.uid, this.freshVis(u));
  }

  setScene(scene: Scene): void {
    if (scene !== this.scene) this.bg = null;
    this.scene = scene;
  }

  private freshVis(u: Unit): Vis {
    const p = this.spot(u);
    return { x: p.x, y: p.y, alpha: u.alive ? 1 : 0, flash: 0, lunge: 0, lungeTo: null, pet: null, hp: u.hp, shield: u.shield, dead: !u.alive, sprite: u.sprite, bob: Math.random() * 6 };
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const devW = Math.max(1, Math.round(rect.width * dpr));
    const devH = Math.max(1, Math.round(rect.height * dpr));
    this.px = Math.max(1, Math.floor(Math.min(devW / LW, devH / LH)));
    this.canvas.width = devW;
    this.canvas.height = devH;
    this.lw = Math.ceil(devW / this.px);
    this.lh = Math.ceil(devH / this.px);
    this.groundY = Math.floor(this.lh * 0.42);
    this.bg = null;
    for (const [uid, v] of this.vis) {
      const u = this.unit(uid);
      if (!u) continue;
      const p = this.spot(u);
      v.x = p.x;
      v.y = p.y;
    }
  }

  /** True while events are still being played back. */
  busy(): boolean {
    return !!this.battle && (this.eventIndex < this.battle.events.length || this.wait > 0);
  }

  /** The unit under a point given in CSS pixels relative to the canvas. */
  unitAt(cssX: number, cssY: number): number | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const x = (cssX * this.canvas.width) / rect.width;
    const y = (cssY * this.canvas.height) / rect.height;
    let best: number | undefined;
    let bestD = Infinity;
    for (const [uid, r] of this.rects) {
      const pad = this.px * 3;
      if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
      const d = Math.abs(x - (r.x + r.w / 2)) + Math.abs(y - (r.y + r.h / 2));
      if (d < bestD) {
        bestD = d;
        best = uid;
      }
    }
    return best;
  }

  private unit(uid: number): Unit | undefined {
    return this.battle?.units.find((u) => u.uid === uid);
  }

  /** Home position (feet) of a unit. */
  private spot(u: Unit): { x: number; y: number } {
    const cx = this.lw / 2;
    const area = this.lh - this.groundY;
    const rows = [this.groundY + area * 0.5, this.groundY + area * 0.94];
    if (u.side === 'hero') {
      // Front-liners take the column nearer the enemies, two to a column; extras spill over.
      const hs = this.battle!.heroes();
      const cols: typeof hs[] = [hs.filter((h) => HEROES[h.key as HeroId]?.row === 'front'), hs.filter((h) => HEROES[h.key as HeroId]?.row !== 'front')];
      while (cols[0].length > 2) cols[1].push(cols[0].pop()!);
      while (cols[1].length > 2) cols[0].push(cols[1].pop()!);
      const col = cols[0].includes(u) ? 0 : 1;
      const k = cols[col].indexOf(u);
      const y = cols[col].length === 1 ? (rows[0] + rows[1]) / 2 : rows[k];
      return { x: cx + HERO_COLS[col] + (k ? 2 : -2), y };
    }
    const enemies = this.battle!.enemies();
    const idx = enemies.indexOf(u);
    const bossIdx = enemies.findIndex((e) => e.boss);
    // Boss in the middle of the front line, the rest fill two columns.
    const order = bossIdx >= 0 ? [enemies[bossIdx], ...enemies.filter((e) => !e.boss)] : enemies;
    const i = order.indexOf(u);
    const n = order.length;
    const front = Math.ceil(n / 2);
    const col = i < front ? 0 : 1;
    const inCol = col === 0 ? front : n - front;
    const k = col === 0 ? i : i - front;
    const top = this.groundY + area * 0.42;
    const bottom = this.groundY + area * 0.96;
    const y = inCol === 1 ? (top + bottom) / 2 + 4 : top + ((bottom - top) * k) / Math.max(1, inCol - 1);
    void idx;
    return { x: cx + 32 + col * 32 + (k % 2) * 4, y };
  }

  private headPos(uid: number): { x: number; y: number } {
    const v = this.vis.get(uid);
    const u = this.unit(uid);
    if (!v || !u) return { x: this.lw / 2, y: this.lh / 2 };
    return { x: v.x, y: v.y - getSprite(v.sprite).h * 0.6 };
  }

  private float(uid: number, text: string, color: string, size = 7, life = 1): void {
    const p = this.headPos(uid);
    const v = this.vis.get(uid);
    const h = v ? getSprite(v.sprite).h : 16;
    const stack = this.floaters.filter((f) => Math.abs(f.x - p.x) < 10 && f.t < 0.3).length;
    this.floaters.push({ x: p.x + (Math.random() * 6 - 3), y: p.y - h * 0.45 - stack * 6, text, color, size, t: 0, life });
  }

  private burst(x: number, y: number, color: string, n: number, speed = 30, gravity = 40): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: 0.4 + Math.random() * 0.4, t: 0, color, gravity });
    }
  }

  // ------------------------------------------------------------ events
  private play(e: BEvent): void {
    switch (e.t) {
      case 'beat':
        this.wait = e.dur;
        break;
      case 'turn':
        this.turn = { side: e.side, round: e.round };
        break;
      case 'act': {
        const v = this.vis.get(e.uid);
        if (!v) break;
        const to = e.to !== undefined ? this.vis.get(e.to) : undefined;
        if (e.style === 'melee' || e.style === 'pet') {
          v.lunge = 0.3;
          v.pet = e.style === 'pet' ? (e.pet ?? 'bruno') : null;
          v.lungeTo = to ? { x: to.x, y: to.y } : null;
        } else if (e.style === 'ranged' && e.to !== undefined) {
          this.projs.push({ from: this.headPos(e.uid), to: this.headPos(e.to), color: e.color ?? '#ffffff', t: 0, dur: 0.25 });
        } else {
          const p = this.headPos(e.uid);
          this.burst(p.x, p.y, e.color ?? '#ffd23f', 12, 26, -10);
        }
        break;
      }
      case 'dmg': {
        const v = this.vis.get(e.uid);
        if (v) {
          v.flash = 0.14;
          v.hp = e.hp;
          v.shield = e.shield;
        }
        const u = this.unit(e.uid);
        const colors: Record<string, string> = { poison: '#7cff4f', bleed: '#ff4f6d', burn: '#ff9a1f', meeting: '#b48cff', reflect: '#ff7ae0', boom: '#ffd23f' };
        const color = colors[e.kind] ?? (e.crit ? '#ffd23f' : u?.side === 'hero' ? '#ff6a6a' : '#ffffff');
        this.float(e.uid, e.crit ? `${e.amount}!` : `${e.amount}`, color, e.crit ? 9 : 7);
        if (e.kind === 'hit' || e.kind === 'boom') {
          const p = this.headPos(e.uid);
          this.burst(p.x, p.y, '#ffffff', e.crit ? 8 : 4);
          if (e.crit) this.shake = Math.max(this.shake, 3);
        }
        break;
      }
      case 'heal': {
        const v = this.vis.get(e.uid);
        if (v) v.hp = e.hp;
        this.float(e.uid, `+${e.amount}`, '#5effc8', 6);
        break;
      }
      case 'shield': {
        const v = this.vis.get(e.uid);
        if (v) v.shield = e.shield;
        const p = this.headPos(e.uid);
        this.burst(p.x, p.y, '#9ec3ff', 8, 20, 0);
        break;
      }
      case 'miss':
        this.float(e.uid, e.text, '#c8c8d8', 6);
        break;
      case 'status':
        this.float(e.uid, e.text, e.color, 5.5, 2.2);
        break;
      case 'fx':
        this.fxs.push({ kind: e.kind, uid: e.uid, t: 0, life: e.kind === 'wife' ? 1.8 : 0.9 });
        break;
      case 'say':
        this.bubbles = this.bubbles.filter((b) => b.uid !== e.uid);
        this.bubbles.push({ uid: e.uid, text: e.text, t: 0, life: 2.2 });
        break;
      case 'cast': {
        const p = this.headPos(e.uid);
        this.burst(p.x, p.y, e.ult ? '#ffd23f' : '#ffffff', e.ult ? 16 : 6, 26, -10);
        const u = this.unit(e.uid);
        if (u && !(u.side === 'enemy' && e.ult)) this.float(e.uid, e.name, u.side === 'hero' ? '#ffd23f' : '#ff9a9a', 5, 1.3);
        break;
      }
      case 'death': {
        const v = this.vis.get(e.uid);
        if (v) {
          v.dead = true;
          v.hp = 0;
          v.shield = 0;
          const p = this.headPos(e.uid);
          this.burst(p.x, p.y, '#ffffff', 14, 30, 20);
        }
        break;
      }
      case 'revive': {
        const v = this.vis.get(e.uid);
        if (v) {
          v.dead = false;
          v.hp = e.hp;
          const p = this.headPos(e.uid);
          this.burst(p.x, p.y, '#ffd23f', 20, 30, -20);
        }
        break;
      }
      case 'aoe':
        this.flashes.push({ side: e.side, color: e.color, t: 0 });
        break;
      case 'shake':
        this.shake = Math.max(this.shake, e.power);
        break;
      case 'banner':
        this.banner = { text: e.text, sub: e.sub, t: 0 };
        break;
      case 'sprite': {
        const v = this.vis.get(e.uid);
        if (v) {
          v.sprite = e.sprite;
          const p = this.headPos(e.uid);
          this.burst(p.x, p.y, '#b48cff', 30, 40, -10);
        }
        break;
      }
    }
  }

  private pump(dt: number): void {
    const b = this.battle;
    if (!b) return;
    this.wait = Math.max(0, this.wait - dt);
    while (this.wait <= 0 && this.eventIndex < b.events.length) this.play(b.events[this.eventIndex++]);
  }

  update(rawDt: number): void {
    const dt = rawDt * this.speed;
    this.time += rawDt;
    if (!this.paused) this.pump(dt);
    for (const [uid, v] of this.vis) {
      const u = this.unit(uid);
      v.flash = Math.max(0, v.flash - dt);
      v.lunge = Math.max(0, v.lunge - dt);
      if (v.lunge === 0) v.pet = null;
      const away = u && this.battle?.has(u, 'away');
      const target = v.dead ? 0 : away ? 0.15 : 1;
      v.alpha += (target - v.alpha) * Math.min(1, dt * (v.dead ? 2 : 6));
    }
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      f.y -= (f.life > 1.5 ? 6 : 12) * dt * Math.max(0, 1 - f.t / Math.min(f.life, 1.2));
      return f.t < f.life;
    });
    this.fxs = this.fxs.filter((f) => (f.t += dt) < f.life);
    this.bubbles = this.bubbles.filter((b) => (b.t += dt) < b.life);
    this.projs = this.projs.filter((p) => (p.t += dt) < p.dur);
    this.particles = this.particles.filter((p) => {
      p.t += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.t < p.life;
    });
    this.flashes = this.flashes.filter((a) => (a.t += dt) < 0.45);
    if (this.banner && (this.banner.t += dt) > 2) this.banner = null;
    this.shake = Math.max(0, this.shake - dt * 20);
  }

  // ------------------------------------------------------------ drawing
  draw(): void {
    const { ctx, px } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(0, 0, W, H);
    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    if (!this.bg || this.bg.width !== this.lw || this.bg.height !== this.lh) this.bg = paintBackground(this.scene, this.lw, this.lh, this.groundY);
    ctx.drawImage(this.bg, sx * px, sy * px, this.lw * px, this.lh * px);
    const sign = sceneSign(this.scene);
    if (sign) {
      ctx.font = `${Math.max(6, Math.round(px * 4.5))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff6c8';
      ctx.fillText(sign, (this.lw / 2) * px + sx * px, 14 * px + sy * px, 76 * px);
    }

    ctx.setTransform(px, 0, 0, px, sx * px, sy * px);
    this.rects.clear();
    this.pips = [];
    const b = this.battle;
    if (b) {
      const order = [...this.vis.entries()].sort((a, c) => a[1].y - c[1].y);
      for (const [uid, v] of order) {
        const u = this.unit(uid);
        if (u && v.alpha > 0.02) this.drawUnit(u, v);
      }
      for (const [uid, v] of order) {
        const u = this.unit(uid);
        if (u && !v.dead && v.alpha > 0.5) this.drawBars(u, v);
      }
      this.drawHighlights();
    }
    for (const p of this.projs) {
      const k = p.t / p.dur;
      const x = p.from.x + (p.to.x - p.from.x) * k;
      const y = p.from.y + (p.to.y - p.from.y) * k - Math.sin(k * Math.PI) * 6;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const a of this.flashes) {
      ctx.fillStyle = `rgba(${a.color},${0.35 * (1 - a.t / 0.45)})`;
      if (a.side === 'hero') ctx.fillRect(0, 0, this.lw / 2, this.lh);
      else ctx.fillRect(this.lw / 2, 0, this.lw / 2, this.lh);
    }

    for (const f of this.fxs) this.drawFx(f);

    // Text is drawn in device pixels so it stays crisp.
    ctx.setTransform(1, 0, 0, 1, sx * px, sy * px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, (f.life - f.t) / 0.3);
      this.text(f.text, f.x * px, f.y * px, Math.max(7, Math.round(f.size * px * 0.55)), f.color);
    }
    ctx.globalAlpha = 1;
    for (const bub of this.bubbles) this.drawBubble(bub);
    if (b) this.drawBossBar(b);
    if (this.turn && b && !b.outcome) {
      const mine = this.turn.side === 'hero';
      ctx.textAlign = 'left';
      this.text(`ROUND ${this.turn.round} · ${mine ? 'YOUR TURN' : 'ENEMY TURN'}`, 4 * px, (this.lh - 4) * px, Math.max(7, Math.round(px * 2.6)), mine ? '#7cff4f' : '#ff6a6a');
      ctx.textAlign = 'center';
    }
    if (this.banner) this.drawBanner(this.banner);
  }

  private text(s: string, x: number, y: number, size: number, color: string, maxW?: number): void {
    const { ctx } = this;
    ctx.font = `${size}px ${FONT}`;
    ctx.lineWidth = Math.max(2, size / 3);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1020';
    ctx.strokeText(s, x, y, maxW);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y, maxW);
  }

  private drawUnit(u: Unit, v: Vis): void {
    const { ctx, px } = this;
    const s = getSprite(v.sprite);
    const enemy = u.side === 'enemy';
    const k = v.lunge > 0 ? Math.sin((v.lunge / 0.3) * Math.PI) : 0;
    let ox = 0;
    let oy = 0;
    if (k && v.lungeTo && !v.pet) {
      ox = (v.lungeTo.x - v.x) * 0.55 * k;
      oy = (v.lungeTo.y - v.y) * 0.55 * k;
    } else if (k && !v.pet) ox = (enemy ? -4 : 4) * k;
    const stunned = this.battle?.has(u, 'stun');
    const bob = !v.dead && !stunned ? Math.round(Math.sin(this.time * 2.4 + v.bob) * 0.7) : 0;
    const sink = v.dead ? (1 - v.alpha) * 6 : 0;
    const x = Math.round(v.x + ox - s.w / 2);
    const y = Math.round(v.y + oy - s.h + bob + sink);
    // shadow
    ctx.globalAlpha = v.alpha * 0.35;
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(v.x - s.w * 0.35), Math.round(v.y), Math.round(s.w * 0.7), 2);
    ctx.globalAlpha = v.alpha;
    if (u.key === 'legacy_code' && !v.dead && Math.random() < 0.15) {
      // glitch: a sliced, offset copy
      const cut = Math.floor(Math.random() * s.h);
      ctx.drawImage(enemy ? s.flipped : s.normal, 0, cut, s.w, 3, x + (Math.random() < 0.5 ? -2 : 2), y + cut, s.w, 3);
    }
    ctx.drawImage(enemy ? s.flipped : s.normal, x, y);
    if (v.flash > 0) {
      ctx.globalAlpha = v.alpha * 0.8;
      ctx.drawImage(enemy ? s.whiteFlipped : s.white, x, y);
    }
    ctx.globalAlpha = v.alpha;
    this.rects.set(u.uid, { x: x * px, y: y * px, w: s.w * px, h: s.h * px });

    // Mason's cats walk beside him and pounce when commanded.
    if (u.key === 'mason') {
      for (const pet of ['bruno', 'murphy'] as const) {
        const ps = getSprite(pet);
        let cx = v.x + (pet === 'bruno' ? 12 : 9);
        let cy = v.y + (pet === 'bruno' ? -3 : 3);
        if (v.pet === pet && k && v.lungeTo) {
          cx += (v.lungeTo.x - cx - 8) * k;
          cy += (v.lungeTo.y - cy) * k - Math.sin(k * Math.PI) * 6;
        } else if (v.pet === pet && k) {
          cx += 50 * k;
        }
        const hop = Math.round(Math.abs(Math.sin(this.time * 3 + (pet === 'bruno' ? 0 : 1.5))) * -1);
        ctx.globalAlpha = v.dead ? v.alpha : 1;
        ctx.drawImage(ps.normal, Math.round(cx - ps.w / 2), Math.round(cy - ps.h + hop));
      }
      ctx.globalAlpha = v.alpha;
    }

    if (!v.dead && this.battle) {
      const b = this.battle;
      if (v.shield > 0) {
        ctx.globalAlpha = 0.22 + 0.08 * Math.sin(this.time * 5);
        ctx.fillStyle = '#9ec3ff';
        ctx.fillRect(x - 1, y - 1, s.w + 2, s.h + 2);
      }
      if (b.has(u, 'protect')) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1.5, y - 1.5, s.w + 3, s.h + 3);
      }
      ctx.globalAlpha = 1;
      if (stunned) {
        ctx.fillStyle = '#fff04f';
        const t = this.time * 6;
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(v.x + Math.cos(t + i * 2.1) * 6), y - 2 + Math.round(Math.sin(t + i * 2.1)), 1, 1);
      }
      if (b.has(u, 'confuse')) {
        ctx.fillStyle = '#ff7ae0';
        ctx.fillRect(Math.round(v.x + Math.sin(this.time * 4) * 4), y - 4, 1, 1);
      }
      if (Math.random() < 0.3) {
        for (const kind of ['poison', 'burn', 'bleed'] as const) {
          if (b.has(u, kind) && Math.random() < 0.4) this.burst(v.x + (Math.random() - 0.5) * s.w * 0.6, v.y - s.h * 0.5, STATUS_INFO[kind].color, 1, 5, kind === 'bleed' ? 30 : -30);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBars(u: Unit, v: Vis): void {
    const { ctx } = this;
    const s = getSprite(v.sprite);
    const w = u.boss ? 24 : 16;
    const x = Math.round(v.x - w / 2);
    const y = Math.round(v.y - s.h - 5);
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#4a1a2a';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = u.side === 'hero' ? '#5aff7a' : u.boss ? '#ffb020' : '#ff3b4a';
    ctx.fillRect(x, y, Math.max(0, Math.round((v.hp / u.maxHp) * w)), 2);
    if (v.shield > 0) {
      ctx.fillStyle = '#cfe0ff';
      ctx.fillRect(x, y, Math.min(w, Math.max(1, Math.round((v.shield / u.maxHp) * w))), 1);
    }
    // status pips (hover or tap them for a tooltip)
    let px = x;
    for (const st of u.statuses) {
      const info = STATUS_INFO[st.kind];
      if (info.hidden) continue;
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(px - 1, y + 3, 4, 4);
      ctx.fillStyle = info.color;
      ctx.fillRect(px, y + 4, 2, 2);
      this.pips.push({ x: (px - 1) * this.px, y: (y + 3) * this.px, size: 4 * this.px, uid: u.uid, kind: st.kind });
      px += 4;
      if (px > x + w + 6) break;
    }
  }

  /** The status icon under a point given in CSS pixels relative to the canvas. */
  statusAt(cssX: number, cssY: number): { uid: number; kind: StatusKind } | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const x = (cssX * this.canvas.width) / rect.width;
    const y = (cssY * this.canvas.height) / rect.height;
    const pad = this.px * 1.5;
    return this.pips.find((p) => x >= p.x - pad && x <= p.x + p.size + pad && y >= p.y - pad && y <= p.y + p.size + pad);
  }

  private drawFx(f: Fx): void {
    const { ctx } = this;
    const k = f.t / f.life;
    if (f.kind === 'wife') {
      // Mason's wife steps in beside him for a moment.
      const v = this.vis.get(f.uid);
      if (!v) return;
      const s = getSprite('wife');
      ctx.globalAlpha = Math.min(1, k / 0.15, (1 - k) / 0.25);
      ctx.drawImage(s.normal, Math.round(v.x - 16 - s.w / 2), Math.round(v.y - s.h));
      ctx.globalAlpha = 1;
      if (Math.random() < 0.3) this.burst(v.x - 10, v.y - s.h * 0.7, '#ff7ae0', 1, 10, -25);
      return;
    }
    // A spectral Nissan Titan tears across the enemy side.
    const s = getSprite('nissan_titan');
    const x = -s.w + (this.lw + s.w * 2) * k;
    const y = this.groundY + (this.lh - this.groundY) * 0.62;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(s.normal, Math.round(x - s.w / 2), Math.round(y - s.h));
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#4fc3ff';
    for (let i = 1; i <= 4; i++) ctx.fillRect(Math.round(x - s.w / 2 - i * 8), Math.round(y - s.h + 3 + i * 1.5), 6, 1);
    ctx.globalAlpha = 1;
    if (Math.random() < 0.6) this.burst(x - s.w / 2, y - 2, '#a0f0ff', 1, 8, 0);
  }

  private drawHighlights(): void {
    const { ctx } = this;
    const mark = (uid: number, color: string, blink: boolean) => {
      const v = this.vis.get(uid);
      if (!v || v.dead) return;
      if (blink && Math.floor(this.time * 4) % 2) return;
      const s = getSprite(v.sprite);
      const y = Math.round(v.y - s.h - 12 + Math.sin(this.time * 6) * 1.5);
      const x = Math.round(v.x);
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(x - 3, y - 1, 7, 4);
      ctx.fillRect(x - 2, y + 3, 5, 1);
      ctx.fillStyle = color;
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillRect(x - 1, y + 1, 3, 1);
      ctx.fillRect(x, y + 2, 1, 1);
    };
    if (this.highlight.active !== undefined) mark(this.highlight.active, '#7cff4f', false);
    for (const t of this.highlight.targets ?? []) mark(t, '#ffd23f', true);
  }

  private drawBubble(bub: Bubble): void {
    const { ctx, px } = this;
    const v = this.vis.get(bub.uid);
    if (!v) return;
    const s = getSprite(v.sprite);
    const a = Math.min(1, bub.t / 0.15, (bub.life - bub.t) / 0.3);
    const size = Math.max(7, Math.round(px * 2.4));
    ctx.font = `${size}px ${FONT}`;
    const tw = Math.min(ctx.measureText(bub.text).width, this.lw * px * 0.5);
    const bw = tw + size * 1.4;
    const bh = size * 2.2;
    let cx = v.x * px;
    cx = Math.max(bw / 2 + 4, Math.min(this.lw * px - bw / 2 - 4, cx));
    const by = (v.y - s.h - 12) * px - bh;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(cx - bw / 2 - px, by - px, bw + 2 * px, bh + 2 * px);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - bw / 2, by, bw, bh);
    ctx.fillRect(v.x * px - px, by + bh, 2 * px, 2 * px);
    ctx.fillStyle = '#1a1020';
    ctx.fillText(bub.text, cx, by + bh / 2 + 1, tw);
    ctx.globalAlpha = 1;
  }

  private drawBossBar(b: Battle): void {
    const boss = b.units.find((u) => u.boss);
    if (!boss) return;
    const v = this.vis.get(boss.uid);
    if (!v || v.dead) return;
    const { ctx, px } = this;
    const w = Math.min(120, this.lw - 20) * px;
    const x = (this.lw * px - w) / 2;
    const y = 8 * px;
    ctx.textAlign = 'center';
    this.text(boss.name.toUpperCase(), x + w / 2, y - 3 * px, Math.max(7, Math.round(px * 3)), '#ffd23f');
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(x - px, y, w + 2 * px, 4 * px);
    ctx.fillStyle = '#4a1a2a';
    ctx.fillRect(x, y + px, w, 2 * px);
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(x, y + px, Math.max(0, (v.hp / boss.maxHp) * w), 2 * px);
    if (v.shield > 0) {
      ctx.fillStyle = '#cfe0ff';
      ctx.fillRect(x, y + px, Math.min(w, (v.shield / boss.maxHp) * w), px);
    }
  }

  private drawBanner(bn: { text: string; sub?: string; t: number }): void {
    const { ctx, px } = this;
    const a = Math.min(1, bn.t / 0.2, (2 - bn.t) / 0.4);
    const cy = this.groundY * 0.55 * px;
    const W = this.lw * px;
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(0, cy - 11 * px, W, 22 * px);
    ctx.fillStyle = '#ff3b8a';
    ctx.fillRect(0, cy - 11 * px, W, px);
    ctx.fillRect(0, cy + 11 * px - px, W, px);
    ctx.globalAlpha = a;
    const slide = Math.max(0, 1 - bn.t / 0.2) * 40 * px;
    this.text(bn.text, W / 2 - slide, cy - 2 * px, Math.round(px * 5.5), '#ffd23f', W - 16);
    if (bn.sub) this.text(bn.sub, W / 2 + slide, cy + 6 * px, Math.round(px * 2.6), '#ffffff', W - 16);
    ctx.globalAlpha = 1;
  }
}
