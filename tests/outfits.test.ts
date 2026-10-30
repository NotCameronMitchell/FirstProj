import { afterEach, describe, expect, it } from 'vitest';
import { HEROES, HERO_IDS } from '../src/data/heroes';
import { OUTFITS, OUTFIT_MAP, defaultOutfit, outfitPalette, outfitSprite, outfitUltSprite, outfitsFor, type OutfitDef } from '../src/data/outfits';
import { buildBattle, newRun } from '../src/game/run';
import { freshMeta } from '../src/game/storage';
import { GRIDS, PALETTES } from '../src/render/spriteData';

/** Base grid and palette an outfit's sprite key resolves to. */
function resolve(key: string): { grid: string[]; pal: Record<string, string> } {
  const v = outfitPalette(key);
  const base = v ? v.base : key;
  return { grid: GRIDS[base], pal: { ...PALETTES[base], ...v?.palette } };
}

describe('outfits', () => {
  const temp: OutfitDef = { id: 'test_recolour', hero: 'cole', name: 'Test', desc: '', palette: { t: '#00ff00' }, ultPalette: { u: '#ff0000' } };
  afterEach(() => {
    if (OUTFITS.includes(temp)) OUTFITS.splice(OUTFITS.indexOf(temp), 1);
    delete OUTFIT_MAP[temp.id];
  });

  it('every hero has a free default outfit and every outfit resolves to a sprite', () => {
    OUTFITS.push(temp);
    OUTFIT_MAP[temp.id] = temp;
    expect(new Set(OUTFITS.map((o) => o.id)).size).toBe(OUTFITS.length);
    for (const id of HERO_IDS) {
      expect(outfitsFor(id).length).toBeGreaterThan(0);
      expect(defaultOutfit(id).cost).toBeUndefined();
    }
    for (const o of OUTFITS) {
      for (const key of [outfitSprite(o), outfitUltSprite(o)]) {
        if (!key) continue;
        const { grid, pal } = resolve(key);
        expect(grid, `${o.id}: ${key}`).toBeDefined();
        for (const row of grid) for (const ch of row) if (ch !== '.' && ch !== 'o') expect(pal[ch], `${o.id} '${ch}'`).toBeDefined();
      }
      // Recolours should only replace colours the base sprite actually uses.
      const base = o.sprite ?? HEROES[o.hero].sprite;
      for (const k of Object.keys(o.palette ?? {})) expect(PALETTES[base], `${o.id} key ${k}`).toHaveProperty(k);
    }
  });

  it('the run carries outfits into battle, including the transformed form', () => {
    OUTFITS.push(temp);
    OUTFIT_MAP[temp.id] = temp;
    const run = newRun(freshMeta(), 1, { cole: temp.id });
    const b = buildBattle(run, freshMeta());
    const cole = b.hero('cole')!;
    expect(cole.sprite).toBe('cole~test_recolour');
    expect(resolve(cole.sprite).pal.t).toBe('#00ff00');
    cole.cd.transfer_uw = 0;
    b.act(cole.uid, 'transfer_uw');
    expect(cole.sprite).toBe('cole_uw~test_recolour~ult');
    expect(resolve(cole.sprite).pal.u).toBe('#ff0000');
    expect(b.hero('mason')!.sprite).toBe('mason');
  });
});
