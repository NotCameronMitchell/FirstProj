import { REGIONS } from '../data/enemies';
import { Rng } from '../rng';

// Region backdrops are painted procedurally at the game's logical resolution,
// with banded gradients so they read as pixel art when scaled up.

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string): void {
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = lerpColor(top, bottom, i / (bands - 1));
    ctx.fillRect(0, Math.floor((i * h) / bands), w, Math.ceil(h / bands) + 1);
  }
}

/** A jagged ridge line filled down to the bottom of the canvas. */
function ridge(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, base: number, rough: number, color: string, step = 3): void {
  ctx.fillStyle = color;
  let y = base;
  for (let x = 0; x < w; x += step) {
    y += rng.int(-rough, rough);
    y = Math.max(base - rough * 3, Math.min(base + rough * 2, y));
    ctx.fillRect(x, y, step, h - y);
  }
}

function deadTree(ctx: CanvasRenderingContext2D, x: number, ground: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, ground - 34, 3, 34);
  const branches: [number, number, number, number][] = [
    [-8, -30, 9, 1], [2, -34, 8, 1], [-5, -24, 6, 1], [3, -26, 7, 1], [-10, -33, 2, 4], [9, -37, 2, 4], [-2, -40, 2, 7],
  ];
  for (const [dx, dy, bw, bh] of branches) ctx.fillRect(x + dx, ground + dy, bw, bh);
  // a faint golden glow, the dead Great Tree
  ctx.fillStyle = 'rgba(255,210,122,0.08)';
  ctx.fillRect(x - 14, ground - 46, 31, 20);
}

function tower(ctx: CanvasRenderingContext2D, x: number, ground: number): void {
  ctx.fillStyle = '#07050a';
  const widths = [10, 8, 7, 6, 5, 4];
  let y = ground;
  for (const tw of widths) {
    ctx.fillRect(x - tw / 2, y - 10, tw, 10);
    y -= 10;
  }
  // twin horns and the burning eye
  ctx.fillRect(x - 4, y - 6, 1, 6);
  ctx.fillRect(x + 3, y - 6, 1, 6);
  ctx.fillStyle = '#ff6a1a';
  ctx.fillRect(x - 2, y - 4, 4, 2);
  ctx.fillStyle = '#ffd04a';
  ctx.fillRect(x - 1, y - 4, 2, 2);
  ctx.fillStyle = 'rgba(255,90,20,0.12)';
  ctx.fillRect(x - 9, y - 10, 18, 12);
}

function volcano(ctx: CanvasRenderingContext2D, x: number, ground: number, w: number): void {
  ctx.fillStyle = '#1a0a08';
  for (let i = 0; i < 40; i++) {
    const half = 6 + i * 1.4;
    ctx.fillRect(x - half, ground - 40 + i, half * 2, 1);
  }
  ctx.fillStyle = '#ff5a1a';
  ctx.fillRect(x - 5, ground - 41, 10, 2);
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(x - 3, ground - 41, 6, 1);
  // lava rivulets
  ctx.fillStyle = '#c8381a';
  for (const [dx, len] of [[-3, 14], [2, 20], [5, 9]]) ctx.fillRect(x + dx, ground - 39, 1, len);
  ctx.fillStyle = 'rgba(255,90,20,0.10)';
  ctx.fillRect(0, ground - 60, w, 30);
}

function throne(ctx: CanvasRenderingContext2D, x: number, ground: number, rng: Rng, w: number): void {
  ctx.fillStyle = '#0a0814';
  // broken columns
  for (const cx of [8, 26, w - 30, w - 12]) {
    const ch = rng.int(18, 40);
    ctx.fillRect(cx, ground - ch, 6, ch);
    ctx.fillRect(cx - 1, ground - ch, 8, 2);
  }
  // the throne
  ctx.fillRect(x - 7, ground - 30, 14, 30);
  ctx.fillRect(x - 10, ground - 12, 20, 12);
  ctx.fillRect(x - 5, ground - 38, 2, 8);
  ctx.fillRect(x + 3, ground - 38, 2, 8);
  ctx.fillRect(x - 1, ground - 42, 2, 12);
  ctx.fillStyle = 'rgba(201,161,59,0.5)';
  ctx.fillRect(x - 7, ground - 30, 14, 1);
  // shards of the great rune, hanging in the air
  ctx.fillStyle = '#c9a13b';
  for (let i = 0; i < 7; i++) {
    const sx = rng.int(4, w - 4);
    const sy = rng.int(6, ground - 50);
    ctx.fillRect(sx, sy, 1, rng.int(2, 4));
  }
}

export function paintBackground(region: number, w: number, h: number, groundY: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(1234 + region * 77);
  const r = REGIONS[region];
  sky(ctx, w, groundY, r.sky[0], r.sky[1]);

  if (region === 0) {
    ctx.fillStyle = '#d8c8b0';
    ctx.fillRect(w - 30, 14, 8, 8); // a pale, sick sun
    ctx.fillStyle = 'rgba(216,200,176,0.15)';
    ctx.fillRect(w - 34, 10, 16, 16);
    ridge(ctx, rng, w, h, groundY - 24, 2, '#3a3238');
    deadTree(ctx, Math.floor(w * 0.3), groundY - 18, '#241e24');
    ridge(ctx, rng, w, h, groundY - 10, 1, '#2a2428');
  } else if (region === 1) {
    ridge(ctx, rng, w, h, groundY - 30, 4, '#1c1014', 2);
    tower(ctx, Math.floor(w * 0.62), groundY - 14);
    ridge(ctx, rng, w, h, groundY - 12, 2, '#120a0c', 2);
  } else if (region === 2) {
    ridge(ctx, rng, w, h, groundY - 22, 3, '#2a0e0a');
    volcano(ctx, Math.floor(w * 0.5), groundY - 6, w);
    ridge(ctx, rng, w, h, groundY - 8, 2, '#1a0806');
  } else {
    ridge(ctx, rng, w, h, groundY - 18, 2, '#16122a');
    throne(ctx, Math.floor(w * 0.5), groundY - 4, rng, w);
  }

  // ground with a little texture
  const ground = ['#1a1618', '#141012', '#1c0c0a', '#100c1a'][region];
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, w, h - groundY);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < (w * (h - groundY)) / 18; i++) ctx.fillRect(rng.int(0, w), rng.int(groundY, h), rng.int(1, 3), 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, groundY, w, 2);
  return c;
}
