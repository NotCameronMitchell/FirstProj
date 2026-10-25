import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { SPRITE_IDS, validateSprites } from '../src/render/sprites';

describe('sprites', () => {
  it('grids are rectangular and every colour key is defined', () => {
    expect(validateSprites()).toEqual([]);
  });
  it('every hero and enemy has a sprite', () => {
    for (const id of [...CLASS_IDS, 'skeleton', ...Object.values(ENEMIES).map((e) => e.sprite)]) {
      expect(SPRITE_IDS).toContain(id);
    }
  });
});
