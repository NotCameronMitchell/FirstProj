import { outfitPalette } from '../data/outfits';
import { GRIDS, PALETTES } from './spriteData';

const OUTLINE = '#1a1020';

export const SPRITE_IDS = Object.keys(GRIDS);

export interface Sprite {
  w: number;
  h: number;
  normal: HTMLCanvasElement;
  flipped: HTMLCanvasElement;
  white: HTMLCanvasElement;
  whiteFlipped: HTMLCanvasElement;
}

const cache = new Map<string, Sprite>();

/** Returns grid problems (row width mismatches, unknown palette keys); used by tests. */
export function validateSprites(): string[] {
  const problems: string[] = [];
  for (const [id, grid] of Object.entries(GRIDS)) {
    const pal = PALETTES[id];
    if (!pal) problems.push(`${id} has no palette`);
    const w = grid[0].length;
    grid.forEach((row, y) => {
      if (row.length !== w) problems.push(`${id} row ${y} has ${row.length} chars, expected ${w}`);
      for (const ch of row) if (ch !== '.' && ch !== 'o' && !(pal && ch in pal)) problems.push(`${id} uses '${ch}' with no colour`);
    });
  }
  return [...new Set(problems)];
}

function paint(id: string, pal: Record<string, string>, flip: boolean, white: boolean): HTMLCanvasElement {
  const grid = GRIDS[id];
  const h = grid.length;
  const w = grid[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      if (!ch || ch === '.') continue;
      ctx.fillStyle = white ? '#ffffff' : ch === 'o' ? OUTLINE : (pal[ch] ?? '#ff00ff');
      ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  }
  return c;
}

export function getSprite(id: string): Sprite {
  let s = cache.get(id);
  if (!s) {
    // "<base>~<outfit>" keys are outfit recolours of a base grid.
    const variant = id in GRIDS ? null : outfitPalette(id);
    const key = id in GRIDS ? id : variant && variant.base in GRIDS ? variant.base : 'reply_all';
    const pal = { ...PALETTES[key], ...variant?.palette };
    s = {
      w: GRIDS[key][0].length,
      h: GRIDS[key].length,
      normal: paint(key, pal, false, false),
      flipped: paint(key, pal, true, false),
      white: paint(key, pal, false, true),
      whiteFlipped: paint(key, pal, true, true),
    };
    cache.set(id, s);
  }
  return s;
}

/** A sprite as a crisp, scaled-up canvas element for the DOM. */
export function spriteCanvas(id: string, scale = 3, flip = false): HTMLCanvasElement {
  const s = getSprite(id);
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  c.getContext('2d')!.drawImage(flip ? s.flipped : s.normal, 0, 0);
  c.className = 'pixel';
  c.style.width = `${s.w * scale}px`;
  c.style.height = `${s.h * scale}px`;
  return c;
}
