# The Quest for Villiam Burginson

A retro, 8-bit roguelike about four friends brawling their way through the office in search of Village Sauce.
It's a landscape web game (PWA) that runs in any browser on desktop or phone, and can be added to the home screen to play offline.

## How it plays

- **The party:** pick 4 heroes on the Suit Up screen. Today's roster is Mason (Beastmaster, with his cats Bruno and Murphy), James (Berserker), Cole (Melee DPS) and Cam (Caster / Support); the other slots say Coming soon.
- **Turn-based and fully manual.** Each round every hero takes one action, in any order: an attack with their equipped weapon, or one of their four abilities.
  Then the enemies act. Abilities have cooldowns. Ultimates are ready on turn 4, then every 5 turns.
  Cole's buffs and James's Peptide Rage and Dinner at Fogo are **quick**: they don't use up the turn, but each hero can use only one per turn.
- **A cycle** is a minion fight then a boss, three times over, then a bonus fight (7 fights in all).
  The 3 bosses are drawn at random from the pool each cycle. Beating a boss heals the party to full, always drops a weapon and gives a fourth upgrade pick.
  Bosses talk before and after their fight (`src/data/story.ts`).

  | Boss | Gimmick |
  | --- | --- |
  | The Middle Manager | Memo Storm AoE; *Meeting Invite* stuns a hero for 3 turns |
  | The Corporate Mascot | Screech AoE; *All-Hands Screech* stuns and poisons the party |
  | Legacy Code | Heavy hits; *Mandatory Update* silences every hero |
  | The HR Rep | Stuns and AoE; *Formal Complaint* hits your hardest hitter extra hard |
  | The Logistics Director | Confuses heroes; *Reassignment* takes your hardest hitter out of the fight |

  Minions are energy drinks, nicotine pouches and annoying office workers.
  After the third boss, the party is pulled into **Villiam Burginson's** to fight the crew, cooks and coworkers for Village Sauce.
  Then the next cycle starts, with tougher enemies, and it never ends.
- **After every win** you pick 3 upgrades (the first is always an ability rank-up), then visit the Break Room Shop.
- **PTO Hours** drop from every win and are spent in the shop on weapons, training and snacks.
  Bosses can also drop weapons. Each hero has three weapons and equips one at a time.
- **Village Sauce** only comes from the burger joint. Spend it in the Sauce Shop on permanent upgrades that carry over between runs.
- **Random events** can pop up between fights (35% chance after the shop, each at most once per cycle):
  Renekton is calling, Trip to The Local, AM Pool Party, OTR Raffle Drawing, Cam on the Rift and Holiday Party.
  They live in `src/data/events.ts`.
- **Suit Up:** before each run, build the party and pick outfits.
- **Achievements** (`src/data/achievements.ts`) unlock outfits: Suit & Tie for everyone, Manchester United Mason, Ole Miss Cole, New Job James and Kith Cam.
- The run is saved between fights.

## Development

```sh
npm install
npm run dev           # dev server on your LAN; open the URL on your phone
npm test              # engine and sprite tests
npm run build         # production PWA build in dist/
npm run build:single  # one self-contained HTML file in dist-single/
```

Balance report (simulates runs with an AI player at several levels of Sauce upgrades):

```sh
VITE_BALANCE=1 npx vitest run tests/balance.test.ts --silent=false
```

### Layout

- `src/combat/battle.ts`: the deterministic turn-based combat engine. It records events that the renderer plays back.
- `src/data/heroes.ts`: the heroes, their abilities (with per-rank descriptions and effects) and weapons
- `src/data/enemies.ts`: minions, bosses and the burger crew
- `src/data/meta.ts`: the permanent Village Sauce upgrades
- `src/data/outfits.ts`: hero outfits for the Suit Up screen
- `src/game/`: run flow (stages, scaling, rewards, shop), the AI used by tests, and saving
- `src/render/`: pixel sprites, backdrops (office, rooftop, burger joint) and the battle renderer
- `src/ui/`: the screens, drawn with the DOM

All art is drawn in code. Sprites are character grids in `src/render/spriteData.ts`; to change one, edit its grid or palette.
Enemy strength per stage is set by `scaling()` in `src/game/run.ts`.

### Adding bosses, heroes and story

- **Bosses:** add the boss to `ENEMIES` in `src/data/enemies.ts`, add its id to `BOSS_POOL`, draw its sprite in `src/render/spriteData.ts`, and give it intro/defeat lines in `BOSS_LINES` in `src/data/story.ts`.
- **Heroes:** add the id to `HeroId` (`src/types.ts`) and `HERO_IDS`, and give it an entry in `HEROES`, abilities, weapons, a starting weapon and a Classic outfit. `ROSTER_SLOTS` sets how many slots the roster shows.
- **Story:** `src/data/story.ts` holds the run intro, the burger joint lines and each boss's lines.

### Adding outfits

Outfits live in `src/data/outfits.ts`. Add an entry with either:

- `palette`: a recolour of the hero's default sprite. Map the palette keys from the hero's entry in `src/render/spriteData.ts` to new colours.
- `sprite`: a sprite of its own. Add its grid and palette to `spriteData.ts` and use that key.

Give it a `cost` to sell it for Village Sauce on the Suit Up screen, or an `achievement` to unlock it that way; leave both out to make it free.
For Cole, `ultSprite`/`ultPalette` set what he looks like after Transfer to UW.
`npm test` checks that every outfit resolves to a real sprite and colours.

### Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the game and publishes it to GitHub Pages.
Before the first deploy, set **Settings → Pages → Source** to "GitHub Actions" once.
