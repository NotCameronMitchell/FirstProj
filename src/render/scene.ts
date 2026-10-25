import type { Battle, Unit } from '../combat/battle';
import type { AttackKind, Side } from '../types';
import { paintBackground } from './backgrounds';
import { getSprite } from './sprites';

/** Logical width of the battlefield in game pixels. */
const LW = 128;
const FONT = 'Silkscreen, "Courier New", monospace';

interface Vis {
  x: number;
  y: number;
  alpha: number;
  flash: number;
  lunge: number;
  lungeDir: number;
  hpShown: number;
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
  vy: number;
}

interface Proj {
  from: { x: number; y: number };
  to: number;
  kind: AttackKind;
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

const PROJ_COLOR: Record<AttackKind, [string, string]> = {
  melee: ['#ffffff', '#ffffff'],
  claw: ['#ffffff', '#ffffff'],
  arrow: ['#d6cfb8', '#6b4a2a'],
  bolt: ['#e2f4ff', '#6fb6ff'],
  fire: ['#fff0a0', '#ff7a1a'],
  holy: ['#fff4c8', '#ffd27a'],
  shadow: ['#d6ffd0', '#7a4aa8'],
};

const AOE_COLOR: Partial<Record<AttackKind, string>> = {
  bolt: '111,182,255',
  fire: '255,110,30',
  holy: '255,210,122',
  shadow: '120,60,170',
};

export class BattleView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private px = 3;
  private lh = 160;
  private groundY = 70;
  private battle: Battle | null = null;
  private region = 0;
  private bg: HTMLCanvasElement | null = null;
  private eventIndex = 0;
  private vis = new Map<number, Vis>();
  private floaters: Floater[] = [];
  private projs: Proj[] = [];
  private particles: Particle[] = [];
  private aoe: { side: Side; color: string; t: number }[] = [];
  private banner: { text: string; t: number } | null = null;
  private shake = 0;
  private time = 0;
  private ambient: Particle[] = [];

  /** Fraction of the height taken by sky; menus use a lower horizon. */
  constructor(
    canvas: HTMLCanvasElement,
    private horizon = 0.4,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setBattle(b: Battle, region: number): void {
    this.battle = b;
    this.eventIndex = 0;
    this.vis.clear();
    this.floaters = [];
    this.projs = [];
    this.particles = [];
    this.aoe = [];
    this.banner = null;
    if (region !== this.region) this.bg = null;
    this.region = region;
    this.layout(true);
  }

  /** Show a region's backdrop without a battle (menus, intros). */
  setRegion(region: number): void {
    if (region !== this.region) this.bg = null;
    this.region = region;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const devW = Math.max(1, Math.round(rect.width * dpr));
    const devH = Math.max(1, Math.round(rect.height * dpr));
    this.px = Math.max(1, Math.floor(devW / LW));
    this.canvas.width = devW;
    this.canvas.height = devH;
    this.lh = Math.floor(devH / this.px);
    this.groundY = Math.floor(this.lh * this.horizon);
    this.bg = null;
    this.ambient = [];
    this.layout(true);
  }

  private offsetX(): number {
    return Math.floor((this.canvas.width - LW * this.px) / 2);
  }

  /** Target positions for living units, by side and row. */
  private targets(): Map<number, { x: number; y: number }> {
    const out = new Map<number, { x: number; y: number }>();
    if (!this.battle) return out;
    const cols: Record<string, number> = { 'hero-back': 18, 'hero-front': 46, 'enemy-front': 84, 'enemy-back': 112 };
    const top = this.groundY + 22;
    const bottom = this.lh - 8;
    for (const key of Object.keys(cols)) {
      const [side, row] = key.split('-');
      const units = this.battle.units
        .filter((u) => u.alive && u.side === side && u.row === row)
        .sort((a, b) => Number(b.boss) - Number(a.boss) || a.order - b.order || a.uid - b.uid);
      const n = units.length;
      if (!n) continue;
      const spacing = Math.min(30, (bottom - top) / n);
      const start = top + ((bottom - top) - spacing * (n - 1)) / 2;
      units.forEach((u, i) => {
        const stagger = n > 1 ? (i % 2 ? 4 : -4) * (side === 'hero' ? 1 : -1) : 0;
        out.set(u.uid, { x: cols[key] + stagger + (u.boss ? 4 : 0), y: start + i * spacing });
      });
    }
    return out;
  }

  private layout(snap: boolean): void {
    for (const [uid, p] of this.targets()) {
      let v = this.vis.get(uid);
      if (!v) {
        const u = this.unit(uid);
        v = { x: p.x, y: p.y, alpha: snap ? 1 : 0, flash: 0, lunge: 0, lungeDir: 1, hpShown: u ? u.hp : 0, bob: Math.random() * 6 };
        this.vis.set(uid, v);
      }
      if (snap) {
        v.x = p.x;
        v.y = p.y;
      }
    }
  }

  private unit(uid: number): Unit | undefined {
    return this.battle?.units.find((u) => u.uid === uid);
  }

  private pos(uid: number): { x: number; y: number } {
    const v = this.vis.get(uid);
    const u = this.unit(uid);
    const lift = u ? getSprite(u.sprite).h * 0.5 : 8;
    return v ? { x: v.x, y: v.y - lift } : { x: LW / 2, y: this.lh / 2 };
  }

  private float(uid: number, text: string, color: string, size = 7, life = 0.9): void {
    const p = this.pos(uid);
    const u = this.unit(uid);
    const h = u ? getSprite(u.sprite).h : 16;
    this.floaters.push({ x: p.x + (Math.random() * 8 - 4), y: p.y - h * 0.4, text, color, size, t: 0, life, vy: -14 });
  }

  private burst(x: number, y: number, color: string, n: number, speed = 30, gravity = 40): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: 0.4 + Math.random() * 0.4, t: 0, color, gravity });
    }
  }

  private consume(): void {
    const b = this.battle;
    if (!b) return;
    for (; this.eventIndex < b.events.length; this.eventIndex++) {
      const e = b.events[this.eventIndex];
      switch (e.t) {
        case 'dmg': {
          const v = this.vis.get(e.uid);
          if (v) v.flash = 0.12;
          const colors: Record<string, string> = { dot: '#ff9a4a', reflect: '#c08aff' };
          const u = this.unit(e.uid);
          const color = colors[e.kind] ?? (e.crit ? '#ffd23a' : u?.side === 'hero' ? '#ff6a5a' : '#ffffff');
          this.float(e.uid, e.crit ? `${e.amount}!` : `${e.amount}`, color, e.crit ? 9 : 7);
          if (e.kind !== 'dot') {
            const p = this.pos(e.uid);
            this.burst(p.x, p.y, e.kind === 'fire' ? '#ff8a2a' : '#c8322a', e.crit ? 7 : 3);
          }
          break;
        }
        case 'dodge':
          this.float(e.uid, 'dodge', '#a0a0b0', 6);
          break;
        case 'heal':
          this.float(e.uid, `+${e.amount}`, '#7dff8a', 6);
          break;
        case 'shield': {
          const p = this.pos(e.uid);
          this.burst(p.x, p.y, '#9ec3ff', 5, 20, 0);
          break;
        }
        case 'proj':
          this.projs.push({ from: this.pos(e.from), to: e.to, kind: e.kind, t: 0, dur: e.dur });
          break;
        case 'lunge': {
          const v = this.vis.get(e.uid);
          const t = this.vis.get(e.to);
          if (v) {
            v.lunge = 0.22;
            v.lungeDir = t && t.x < v.x ? -1 : 1;
          }
          break;
        }
        case 'cast': {
          this.float(e.uid, e.name, '#ffd27a', 6, 1.3);
          const p = this.pos(e.uid);
          this.burst(p.x, p.y, '#ffd27a', 10, 26, -10);
          break;
        }
        case 'death': {
          const p = this.pos(e.uid);
          this.burst(p.x, p.y, '#5a5048', 12, 24, 20);
          break;
        }
        case 'spawn': {
          const v = this.vis.get(e.uid);
          if (v) v.alpha = 0;
          break;
        }
        case 'status':
          this.float(e.uid, e.text, e.color, 5, 1.1);
          break;
        case 'aoe':
          this.aoe.push({ side: e.side, color: AOE_COLOR[e.kind] ?? '255,255,255', t: 0 });
          break;
        case 'shake':
          this.shake = Math.max(this.shake, e.power);
          break;
        case 'banner':
          this.banner = { text: e.text, t: 0 };
          break;
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.consume();
    this.layout(false);
    const targets = this.targets();
    for (const [uid, v] of this.vis) {
      const u = this.unit(uid);
      const tgt = targets.get(uid);
      if (tgt) {
        v.x += (tgt.x - v.x) * Math.min(1, dt * 6);
        v.y += (tgt.y - v.y) * Math.min(1, dt * 6);
      }
      v.flash = Math.max(0, v.flash - dt);
      v.lunge = Math.max(0, v.lunge - dt);
      if (u && u.alive) v.alpha = Math.min(1, v.alpha + dt * 4);
      else v.alpha = Math.max(0, v.alpha - dt * 1.6);
      if (u) v.hpShown += (u.hp - v.hpShown) * Math.min(1, dt * 8);
    }
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      f.y += f.vy * dt;
      f.vy *= 0.92;
      return f.t < f.life;
    });
    this.projs = this.projs.filter((p) => {
      p.t += dt;
      return p.t < p.dur;
    });
    this.particles = this.particles.filter((p) => {
      p.t += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.t < p.life;
    });
    this.aoe = this.aoe.filter((a) => (a.t += dt) < 0.5);
    if (this.banner && (this.banner.t += dt) > 2.6) this.banner = null;
    this.shake = Math.max(0, this.shake - dt * 18);
    this.updateAmbient(dt);
  }

  private updateAmbient(dt: number): void {
    // Ash drifts down on the plains and the throne; embers rise from fortress and mountain.
    const rising = this.region === 1 || this.region === 2;
    while (this.ambient.length < 26) {
      this.ambient.push({
        x: Math.random() * LW,
        y: rising ? this.lh + Math.random() * 10 : Math.random() * this.lh - this.lh,
        vx: (Math.random() - 0.5) * 4 - 2,
        vy: rising ? -6 - Math.random() * 8 : 4 + Math.random() * 5,
        life: 99,
        t: 0,
        color: rising ? (Math.random() < 0.5 ? '#ff7a1a' : '#ffb347') : this.region === 3 ? '#c9a13b' : '#b8aca0',
        gravity: 0,
      });
    }
    this.ambient = this.ambient.filter((p) => {
      p.x += (p.vx + Math.sin(this.time + p.y * 0.1) * 3) * dt;
      p.y += p.vy * dt;
      return p.y > -10 && p.y < this.lh + 12 && p.x > -5 && p.x < LW + 5;
    });
  }

  draw(): void {
    const { ctx, px } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0a0f';
    ctx.fillRect(0, 0, W, H);

    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const ox = this.offsetX();
    // Background spans the whole canvas width, even beyond the logical field.
    const bgW = Math.ceil(W / px);
    if (!this.bg || this.bg.width !== bgW) this.bg = paintBackground(this.region, bgW, this.lh, this.groundY);
    ctx.drawImage(this.bg, sx * px, sy * px, bgW * px, this.lh * px);

    ctx.setTransform(px, 0, 0, px, ox + sx * px, sy * px);

    for (const p of this.ambient) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    const b = this.battle;
    if (b) {
      const order = [...this.vis.entries()].sort((a, c) => a[1].y - c[1].y);
      for (const [uid, v] of order) {
        const u = this.unit(uid);
        if (!u || v.alpha <= 0) continue;
        this.drawUnit(u, v);
      }
      for (const [uid, v] of order) {
        const u = this.unit(uid);
        if (u && u.alive && v.alpha > 0.5) this.drawBars(u, v);
      }
    }

    for (const p of this.projs) this.drawProj(p);

    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    for (const a of this.aoe) {
      ctx.fillStyle = `rgba(${a.color},${0.35 * (1 - a.t / 0.5)})`;
      ctx.fillRect(a.side === 'hero' ? -20 : LW / 2, 0, LW / 2 + 20, this.lh);
    }

    // Text is drawn in device pixels so it stays crisp.
    ctx.setTransform(1, 0, 0, 1, ox + sx * px, sy * px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const a = Math.min(1, (f.life - f.t) / 0.3);
      ctx.globalAlpha = a;
      ctx.font = `${Math.round(f.size * px * 0.75)}px ${FONT}`;
      ctx.lineWidth = Math.max(2, px * 0.9);
      ctx.strokeStyle = '#0b0a0f';
      // Keep text inside the screen even for units at the edges.
      const half = ctx.measureText(f.text).width / 2 + px;
      const x = Math.max(half - ox, Math.min(W - ox - half, f.x * px));
      ctx.strokeText(f.text, x, f.y * px);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, f.y * px);
    }
    ctx.globalAlpha = 1;
    if (b) this.drawBossBar(b);
    if (this.banner) this.drawBanner(this.banner, ox);
    if (b && b.wrathMult() > 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(160,20,10,${Math.min(0.25, (b.wrathMult() - 1) * 0.15)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawUnit(u: Unit, v: Vis): void {
    const { ctx } = this;
    const s = getSprite(u.sprite);
    const enemy = u.side === 'enemy';
    const lungeOff = v.lunge > 0 ? Math.sin((v.lunge / 0.22) * Math.PI) * 6 * v.lungeDir : 0;
    const bob = u.alive ? Math.round(Math.sin(this.time * 2.2 + v.bob) * 0.6) : 0;
    const deadSink = u.alive ? 0 : (1 - v.alpha) * 4;
    const x = Math.round(v.x + lungeOff - s.w / 2);
    const y = Math.round(v.y - s.h + bob + deadSink);

    ctx.globalAlpha = v.alpha * 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(v.x - s.w * 0.3), Math.round(v.y), Math.round(s.w * 0.6), 2);

    ctx.globalAlpha = v.alpha;
    const stunned = this.battle?.has(u, 'stun');
    ctx.drawImage(enemy ? s.flipped : s.normal, x, y);
    if (v.flash > 0) {
      ctx.globalAlpha = v.alpha * 0.85;
      ctx.drawImage(enemy ? s.whiteFlipped : s.white, x, y);
    }
    ctx.globalAlpha = v.alpha;

    if (u.alive && this.battle) {
      const b = this.battle;
      if (b.has(u, 'burn') && Math.random() < 0.35) this.burst(v.x + (Math.random() - 0.5) * 8, v.y - s.h * 0.5, '#ff8a2a', 1, 6, -30);
      if (b.has(u, 'bleed') && Math.random() < 0.2) this.burst(v.x + (Math.random() - 0.5) * 6, v.y - s.h * 0.5, '#a8221a', 1, 4, 30);
      if (b.has(u, 'taunt')) {
        ctx.strokeStyle = 'rgba(158,195,255,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1.5, y - 1.5, s.w + 3, s.h + 3);
      }
      if (b.has(u, 'mark')) {
        ctx.fillStyle = '#ff5a4a';
        ctx.fillRect(Math.round(v.x) - 1, y - 9, 3, 3);
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(Math.round(v.x), y - 8, 1, 1);
      }
      if (stunned) {
        ctx.fillStyle = '#f3d36b';
        const t = this.time * 6;
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(v.x + Math.cos(t + i * 2.1) * 5), y - 2 + Math.round(Math.sin(t + i * 2.1)), 1, 1);
      }
      if (u.shield > 0) {
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(this.time * 5);
        ctx.fillStyle = '#9ec3ff';
        ctx.fillRect(x, y, s.w, s.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBars(u: Unit, v: Vis): void {
    const { ctx } = this;
    const s = getSprite(u.sprite);
    const w = u.boss ? 22 : 14;
    const x = Math.round(v.x - w / 2);
    const y = Math.round(v.y - s.h - 4);
    ctx.fillStyle = '#0b0a0f';
    ctx.fillRect(x - 1, y - 1, w + 2, u.side === 'hero' && u.skill ? 5 : 4);
    ctx.fillStyle = '#3a1418';
    ctx.fillRect(x, y, w, 2);
    const hpW = Math.max(0, Math.round((v.hpShown / u.maxHp) * w));
    ctx.fillStyle = u.side === 'hero' ? (u.summon ? '#8aa880' : '#5fd06a') : u.boss ? '#e0a040' : '#d0443a';
    ctx.fillRect(x, y, hpW, 2);
    if (u.shield > 0) {
      ctx.fillStyle = '#cfe0ff';
      ctx.fillRect(x, y, Math.min(w, Math.round((u.shield / u.maxHp) * w)), 1);
    }
    if (u.side === 'hero' && u.skill) {
      ctx.fillStyle = '#1a1830';
      ctx.fillRect(x, y + 3, w, 1);
      ctx.fillStyle = u.energy >= 90 ? '#fff4c8' : '#6fb6ff';
      ctx.fillRect(x, y + 3, Math.round((Math.min(100, u.energy) / 100) * w), 1);
    }
  }

  private drawProj(p: Proj): void {
    const { ctx } = this;
    const to = this.pos(p.to);
    const k = Math.min(1, p.t / p.dur);
    const x = p.from.x + (to.x - p.from.x) * k;
    const arc = p.kind === 'arrow' || p.kind === 'fire' ? Math.sin(k * Math.PI) * 6 : 0;
    const y = p.from.y + (to.y - p.from.y) * k - arc;
    const [core, glow] = PROJ_COLOR[p.kind];
    if (p.kind === 'arrow') {
      const dir = to.x > p.from.x ? 1 : -1;
      ctx.fillStyle = glow;
      ctx.fillRect(Math.round(x - 3 * dir), Math.round(y), 3, 1);
      ctx.fillStyle = core;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      return;
    }
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    if (Math.random() < 0.6) this.particles.push({ x, y, vx: 0, vy: 0, life: 0.25, t: 0, color: glow, gravity: 0 });
  }

  /** A wide health bar for the boss, under the wave label. */
  private drawBossBar(b: Battle): void {
    const boss = b.units.find((u) => u.boss && u.alive);
    if (!boss) return;
    const { ctx, px } = this;
    const v = this.vis.get(boss.uid);
    const hp = v ? v.hpShown : boss.hp;
    const x = 8 * px;
    const w = (LW - 16) * px;
    const y = Math.max(30 * px, this.groundY * px * 0.42);
    ctx.font = `${Math.round(px * 4.6)}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.lineWidth = px;
    ctx.strokeStyle = '#000';
    ctx.strokeText(boss.name, x, y - 4 * px);
    ctx.fillStyle = '#e8d2a0';
    ctx.fillText(boss.name, x, y - 4 * px);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - px, y - px, w + 2 * px, 4 * px);
    ctx.fillStyle = '#3a1418';
    ctx.fillRect(x, y, w, 2 * px);
    ctx.fillStyle = '#c8901a';
    ctx.fillRect(x, y, Math.max(0, (hp / boss.maxHp) * w), 2 * px);
    if (boss.shield > 0) {
      ctx.fillStyle = '#cfe0ff';
      ctx.fillRect(x, y, Math.min(w, (boss.shield / boss.maxHp) * w), px);
    }
    ctx.textAlign = 'center';
  }

  private drawBanner(bn: { text: string; t: number }, ox: number): void {
    const { ctx, px } = this;
    const a = Math.min(1, bn.t / 0.3, (2.6 - bn.t) / 0.5);
    const cy = this.groundY * 0.7 * px;
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(-ox, cy - 9 * px, this.canvas.width, 18 * px);
    ctx.globalAlpha = a;
    ctx.font = `${Math.round(px * 6)}px Cinzel, Georgia, serif`;
    ctx.fillStyle = '#e8d2a0';
    ctx.fillText(bn.text, (LW / 2) * px, cy, LW * px - 8);
    ctx.globalAlpha = 1;
  }
}
