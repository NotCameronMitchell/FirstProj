import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, bumpStat, checkAchievements } from '../src/data/achievements';
import { HERO_IDS } from '../src/data/heroes';
import { OUTFITS, ownsOutfit } from '../src/data/outfits';
import { freshMeta } from '../src/game/storage';

describe('achievements', () => {
  it('every outfit that needs an achievement names a real one', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const o of OUTFITS) if (o.achievement) expect(ids.has(o.achievement), o.id).toBe(true);
  });

  it('every hero has a suit and a signature skin to unlock', () => {
    for (const id of HERO_IDS) expect(OUTFITS.filter((o) => o.hero === id && o.achievement).length).toBeGreaterThanOrEqual(2);
  });

  it('unlocks once, and unlocks its outfit', () => {
    const meta = freshMeta();
    const suit = OUTFITS.find((o) => o.id === 'mason_suit')!;
    expect(ownsOutfit(meta, suit)).toBe(false);
    expect(checkAchievements({ meta })).toEqual([]);
    bumpStat(meta, 'bossesBeaten');
    expect(checkAchievements({ meta }).map((a) => a.id)).toContain('promoted');
    expect(ownsOutfit(meta, suit)).toBe(true);
    expect(checkAchievements({ meta })).toEqual([]);
  });

  it('fight feats unlock the signature skins', () => {
    const meta = freshMeta();
    const got = checkAchievements({ meta, fight: { weGoNext: true, coleRevived: true, blackjack: true, titanHits: 3 } }).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['glory_glory', 'hotty_toddy', 'new_job', 'drip_check']));
    expect(checkAchievements({ meta, event: 'renekton:0' }).map((a) => a.id)).toEqual(['answered']);
  });
});
