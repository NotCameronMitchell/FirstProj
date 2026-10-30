import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { HEROES } from '../src/data/heroes';
import { GRIDS } from '../src/render/spriteData';
import { validateSprites } from '../src/render/sprites';

describe('sprites', () => {
  it('grids are rectangular and every colour key is defined', () => {
    expect(validateSprites()).toEqual([]);
  });
  it('every hero, pet and enemy has a sprite', () => {
    const ids = [...Object.values(HEROES).map((h) => h.sprite), 'cole_uw', 'bruno', 'murphy', 'sauce', 'pto', ...Object.values(ENEMIES).map((e) => e.sprite)];
    for (const id of ids) expect(Object.keys(GRIDS)).toContain(id);
  });
});
