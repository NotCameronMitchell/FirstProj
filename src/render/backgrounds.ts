import { Rng } from '../rng';

// Backdrops are painted procedurally at the game's logical resolution so they
// read as chunky pixel art when scaled up.

export type Scene = 'office' | 'rooftop' | 'burger';

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function bands(ctx: CanvasRenderingContext2D, colors: string[], y0: number, y1: number, w: number): void {
  const n = colors.length;
  for (let i = 0; i < n; i++) rect(ctx, colors[i], 0, y0 + ((y1 - y0) * i) / n, w, (y1 - y0) / n + 1);
}

/** A row of buildings with lit windows. */
function skyline(ctx: CanvasRenderingContext2D, rng: Rng, w: number, base: number, maxH: number, body: string, lights: string[]): void {
  let x = -2;
  while (x < w) {
    const bw = rng.int(8, 18);
    const bh = rng.int(Math.floor(maxH * 0.35), maxH);
    rect(ctx, body, x, base - bh, bw, bh);
    for (let wy = base - bh + 2; wy < base - 1; wy += 3) {
      for (let wx = x + 2; wx < x + bw - 1; wx += 3) if (rng.chance(0.45)) rect(ctx, rng.pick(lights), wx, wy, 1, 1);
    }
    x += bw + rng.int(0, 2);
  }
}

function office(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, gy: number): void {
  // back wall
  rect(ctx, '#3a2a6a', 0, 0, w, gy);
  rect(ctx, '#2a1e52', 0, 0, w, 4);
  // ceiling lights
  for (let x = 10; x < w; x += 34) {
    rect(ctx, '#fff6c8', x, 4, 16, 2);
    rect(ctx, 'rgba(255,246,200,0.08)', x - 6, 6, 28, gy - 6);
  }
  // windows onto the city at night
  const top = 10;
  const bottom = gy - 14;
  for (let x = 6; x < w - 6; x += 46) {
    const ww = 38;
    rect(ctx, '#1a1030', x - 1, top - 1, ww + 2, bottom - top + 2);
    bands(ctx, ['#14104a', '#1c1660', '#2a1e78', '#40287e'], top, bottom, w);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, ww, bottom - top);
    ctx.clip();
    bands(ctx, ['#0e0c3a', '#161250', '#221a66', '#3a2278'], top, bottom, w);
    skyline(ctx, rng, w, bottom, Math.max(8, bottom - top - 4), '#0a0820', ['#ffd23f', '#4fc3ff', '#ff7ae0', '#ffffff']);
    ctx.restore();
    rect(ctx, '#1a1030', x + ww / 2, top, 1, bottom - top);
  }
  // cubicle walls along the back
  rect(ctx, '#5a4aa0', 0, gy - 12, w, 12);
  rect(ctx, '#7a6ac8', 0, gy - 12, w, 1);
  for (let x = 0; x < w; x += 30) rect(ctx, '#4a3a88', x, gy - 12, 1, 12);
  // monitors peeking over the cubicles
  for (let x = 8; x < w; x += 30) {
    rect(ctx, '#14141c', x, gy - 17, 9, 6);
    rect(ctx, rng.pick(['#4fc3ff', '#7cff4f', '#ff7ae0']), x + 1, gy - 16, 7, 4);
  }
  // carpet
  rect(ctx, '#2e5a8a', 0, gy, w, h - gy);
  for (let y = gy + 2; y < h; y += 4) for (let x = (y / 4) % 2 ? 0 : 4; x < w; x += 8) rect(ctx, '#3a6a9a', x, y, 2, 1);
  rect(ctx, 'rgba(0,0,0,0.3)', 0, gy, w, 2);
}

function rooftop(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, gy: number): void {
  // night sky with a few stars
  bands(ctx, ['#060818', '#0a0e26', '#0e1434', '#141c44', '#1c2452'], 0, gy, w);
  for (let i = 0; i < w / 6; i++) rect(ctx, rng.chance(0.3) ? '#ffd23f' : '#ffffff', rng.int(0, w), rng.int(0, gy / 2), 1, 1);
  // far skyline, then the glowing tower and a nearer row
  skyline(ctx, rng, w, gy - 6, Math.floor(gy * 0.45), '#121a3a', ['#4a5a9a', '#6a7ab8']);
  const tx = Math.floor(w * 0.42);
  const ty = Math.floor(gy * 0.3);
  rect(ctx, '#2a8a7a', tx, ty, 16, gy - ty);
  rect(ctx, '#3ac0a8', tx + 2, ty - 6, 12, 6);
  rect(ctx, '#5affd8', tx + 5, ty - 12, 6, 6);
  rect(ctx, '#aaffee', tx + 7, ty - 16, 2, 4);
  for (let y = ty + 2; y < gy - 2; y += 3) for (let x = tx + 2; x < tx + 15; x += 3) rect(ctx, rng.chance(0.7) ? '#d8fff4' : '#1a5a50', x, y, 1, 1);
  skyline(ctx, rng, w, gy - 2, Math.floor(gy * 0.3), '#0a0e22', ['#ffd23f', '#ffb020', '#ffffff', '#ff7ae0']);
  // the awning and its lamps, like the rooftop bar (stepped so it stays pixel-crisp)
  const aw = Math.floor(w * 0.45);
  const ah = Math.floor(gy * 0.35);
  for (let y = 0; y < ah; y++) {
    const span = Math.round(aw * (1 - y / ah));
    rect(ctx, '#2a2a3a', 0, y, span, 1);
    rect(ctx, '#e8e8f0', span - 2, y, 2, 1);
  }
  rect(ctx, '#d8d8e0', 6, 0, 8, gy);
  for (const ly of [Math.floor(gy * 0.45), Math.floor(gy * 0.62)]) {
    rect(ctx, '#fff6c8', 3, ly, 14, 2);
    rect(ctx, 'rgba(255,246,200,0.12)', 0, ly - 4, 24, 10);
  }
  // planter
  rect(ctx, '#c8c8d0', 18, gy - 8, 14, 8);
  for (let i = 0; i < 18; i++) rect(ctx, rng.pick(['#2a8a3a', '#3aa84a', '#1e6a2e']), 18 + rng.int(-2, 14), gy - 8 - rng.int(1, 12), 2, 2);
  // glass railing
  rect(ctx, 'rgba(180,220,255,0.12)', 34, gy - 10, w - 34, 10);
  rect(ctx, '#e8e8f0', 34, gy - 11, w - 34, 1);
  for (let x = 40; x < w; x += 24) rect(ctx, '#e8e8f0', x, gy - 11, 1, 11);
  // tiled deck
  rect(ctx, '#8a8a96', 0, gy, w, h - gy);
  for (let y = gy; y < h; y += 6) rect(ctx, '#6e6e7a', 0, y, w, 1);
  for (let y = gy; y < h; y += 6) for (let x = (y / 6) % 2 ? 0 : 10; x < w; x += 20) rect(ctx, '#6e6e7a', x, y, 1, 6);
  rect(ctx, 'rgba(0,0,0,0.3)', 0, gy, w, 2);
}

function burger(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, gy: number): void {
  rect(ctx, '#ffd23f', 0, 0, w, gy);
  for (let x = 0; x < w; x += 8) rect(ctx, '#ffc21f', x, 0, 4, gy);
  rect(ctx, '#ff3b3b', 0, 0, w, 5);
  // neon sign
  const sx = Math.floor(w / 2) - 40;
  rect(ctx, '#1a1020', sx, 8, 80, 12);
  rect(ctx, '#ff3b3b', sx + 1, 9, 78, 10);
  rect(ctx, '#ff7a7a', sx + 1, 9, 78, 1);
  // menu boards with burgers
  for (const mx of [8, w - 58]) {
    rect(ctx, '#1a1020', mx, 24, 50, 20);
    rect(ctx, '#2a2238', mx + 1, 25, 48, 18);
    for (let i = 0; i < 3; i++) {
      const bx = mx + 4 + i * 16;
      rect(ctx, '#e8a040', bx, 28, 10, 3);
      rect(ctx, '#3aa84a', bx, 31, 10, 1);
      rect(ctx, '#7a3a1a', bx, 32, 10, 2);
      rect(ctx, '#e8a040', bx, 34, 10, 2);
      rect(ctx, '#ffffff', bx + 1, 38, 8, 1);
    }
  }
  // the counter
  rect(ctx, '#c82020', 0, gy - 14, w, 14);
  rect(ctx, '#ff5a5a', 0, gy - 14, w, 2);
  rect(ctx, '#e8e8f0', 0, gy - 16, w, 2);
  for (let x = 20; x < w; x += 50) {
    rect(ctx, '#3a3a44', x, gy - 22, 10, 6);
    rect(ctx, '#7cff4f', x + 2, gy - 21, 6, 2);
  }
  // fries and sauce cups on the counter
  for (let x = 45; x < w; x += 60) {
    rect(ctx, '#ff3b3b', x, gy - 21, 5, 5);
    for (let i = 0; i < 4; i++) rect(ctx, '#ffe07a', x + i + 0.5, gy - 24 + (i % 2), 1, 3);
    rect(ctx, '#ffb020', x + 9, gy - 19, 4, 3);
  }
  // checkered floor
  rect(ctx, '#f4f4f0', 0, gy, w, h - gy);
  for (let y = gy; y < h; y += 6) for (let x = ((y - gy) / 6) % 2 ? 0 : 6; x < w; x += 12) rect(ctx, '#e8323c', x, y, 6, 6);
  rect(ctx, 'rgba(0,0,0,0.25)', 0, gy, w, 2);
  void rng;
}

export function paintBackground(scene: Scene, w: number, h: number, groundY: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(4242 + scene.length * 31);
  if (scene === 'office') office(ctx, rng, w, h, groundY);
  else if (scene === 'rooftop') rooftop(ctx, rng, w, h, groundY);
  else burger(ctx, rng, w, h, groundY);
  return c;
}

/** Text drawn on the backdrop that should stay crisp (the burger sign). */
export function sceneSign(scene: Scene): string | null {
  return scene === 'burger' ? "VILLIAM BURGINSON'S" : null;
}
