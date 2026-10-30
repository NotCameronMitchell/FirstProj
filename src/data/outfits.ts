import type { HeroId, MetaState } from '../types';
import { HEROES } from './heroes';

// Cosmetic outfits, picked on the Suit Up screen before a run.
//
// To add one, append an entry below. An outfit either recolours the hero's
// default sprite (`palette`: palette keys to replace, see the hero's entry in
// src/render/spriteData.ts) or uses a sprite grid of its own (`sprite`: add the
// grid and palette to spriteData.ts). Give it a `cost` to sell it for Village
// Sauce on the Suit Up screen, or an `achievement` (an id from
// src/data/achievements.ts) to unlock it that way; with neither it's free.
//
// Example recolour:
//   { id: 'mason_home', hero: 'mason', name: 'Home Kit', desc: 'The red one.', palette: { w: '#d01c2c', r: '#1e9e5a' }, cost: 40 },

export interface OutfitDef {
  id: string;
  hero: HeroId;
  name: string;
  desc: string;
  /** A sprite of its own (a key in spriteData.ts). */
  sprite?: string;
  /** Or a recolour of the hero's default sprite. */
  palette?: Record<string, string>;
  /** The transformed form in this outfit: Cole after Transfer to UW, James during JimmyTrains. */
  ultSprite?: string;
  ultPalette?: Record<string, string>;
  /** Village Sauce price. Free when omitted. */
  cost?: number;
  /** Achievement that unlocks it. */
  achievement?: string;
}

export const OUTFITS: OutfitDef[] = [
  { id: 'mason_classic', hero: 'mason', name: 'Classic', desc: 'Away kit, white pants, smartwatch.' },
  { id: 'james_classic', hero: 'james', name: 'Classic', desc: 'The brown matching set and the mustache.' },
  { id: 'cole_classic', hero: 'cole', name: 'Classic', desc: 'Patterned button-up and khaki shorts.' },
  { id: 'cam_classic', hero: 'cam', name: 'Classic', desc: 'Mind Goblin cap, shades, Cyberpunk tee.' },
  // Suit & Tie for everyone
  { id: 'mason_suit', hero: 'mason', name: 'Suit & Tie', desc: 'Dressed for the board meeting.', sprite: 'mason_suit', achievement: 'promoted' },
  { id: 'james_suit', hero: 'james', name: 'Suit & Tie', desc: 'Still somehow looks like he just left the gym.', sprite: 'james_suit', ultSprite: 'james_suit_buff', achievement: 'performance_review' },
  { id: 'cole_suit', hero: 'cole', name: 'Suit & Tie', desc: 'Business on top, Ole Miss underneath.', sprite: 'cole_suit', achievement: 'lunch_break' },
  { id: 'cam_suit', hero: 'cam', name: 'Suit & Tie', desc: 'Cap and shades stay on. Non-negotiable.', sprite: 'cam_suit', achievement: 'secret_sauce' },
  // Signature skins
  { id: 'mason_united', hero: 'mason', name: 'Manchester United', desc: 'Red Devils home kit.', sprite: 'mason_united', achievement: 'glory_glory' },
  { id: 'cole_olemiss', hero: 'cole', name: 'Ole Miss', desc: 'Hotty Toddy.', sprite: 'cole_olemiss', achievement: 'hotty_toddy' },
  { id: 'james_newjob', hero: 'james', name: 'New Job James', desc: 'New lanyard, new James. Big smile.', sprite: 'james_newjob', ultSprite: 'james_newjob_buff', achievement: 'new_job' },
  { id: 'cam_kith', hero: 'cam', name: 'Kith', desc: 'Box logo hoodie. Drip certified.', sprite: 'cam_kith', achievement: 'drip_check' },
];

export const OUTFIT_MAP: Record<string, OutfitDef> = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));

/** Transformed forms when the outfit doesn't define one: Cole's UW form, buff James. */
const DEFAULT_ULT: Partial<Record<HeroId, string>> = { cole: 'cole_uw', james: 'james_buff' };

export function outfitsFor(hero: HeroId): OutfitDef[] {
  return OUTFITS.filter((o) => o.hero === hero);
}

export function defaultOutfit(hero: HeroId): OutfitDef {
  return outfitsFor(hero)[0];
}

/** The outfit a hero wears, falling back to the default if the id is unknown. */
export function outfitOf(hero: HeroId, outfits: Partial<Record<HeroId, string>> | undefined): OutfitDef {
  const o = outfits?.[hero] ? OUTFIT_MAP[outfits[hero]!] : undefined;
  return o && o.hero === hero ? o : defaultOutfit(hero);
}

/**
 * Sprite key for an outfit. Recolours are named "<base sprite>~<outfit id>",
 * which getSprite() resolves by repainting the base grid with the new colours.
 */
export function outfitSprite(o: OutfitDef): string {
  if (o.sprite) return o.sprite;
  return o.palette ? `${HEROES[o.hero].sprite}~${o.id}` : HEROES[o.hero].sprite;
}

/** Sprite for the hero's transformed form (Cole's Transfer to UW), if any. */
export function outfitUltSprite(o: OutfitDef): string | undefined {
  const base = o.ultSprite ?? DEFAULT_ULT[o.hero];
  if (!base) return undefined;
  return o.ultPalette ? `${base}~${o.id}~ult` : base;
}

/** Palette overrides for a "<base>~<outfit>[~ult]" sprite key. */
export function outfitPalette(key: string): { base: string; palette: Record<string, string> } | null {
  const [base, id, ult] = key.split('~');
  const o = OUTFIT_MAP[id];
  if (!o) return null;
  const palette = ult ? o.ultPalette : o.palette;
  return palette ? { base, palette } : null;
}

export function ownsOutfit(meta: MetaState, o: OutfitDef): boolean {
  if (o.achievement && !meta.achievements.includes(o.achievement)) return false;
  return !o.cost || meta.ownedOutfits.includes(o.id);
}

/** Outfits an achievement unlocks. */
export function outfitsForAchievement(id: string): OutfitDef[] {
  return OUTFITS.filter((o) => o.achievement === id);
}
