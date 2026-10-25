# Fall of the Throne

A dark fantasy auto-battler roguelike for mobile, set in a shattered realm ruled from a Black Fortress.
You assemble a warband, march into endless waves, and try to bring down the Throne.

It's an installable web game (PWA): it runs in any mobile browser and can be added to the home screen to play offline.

## How it plays

- **Assemble a warband** of 3 to 4 heroes out of 8 classes and put each one in the front or back row.
  Front-row heroes take the melee hits.
- **Fights are fully automatic.** Heroes attack on their own and fire their skill once its energy bar fills.
- **After each wave you choose 1 of 3 spoils:**
  - a hero level-up (skills get stronger at levels 4 and 7)
  - a relic that affects the whole party
  - gear for one hero (common, rare or legendary)
- **Dark bargains** are offered halfway through each region. Each gives a strong boon and comes with a curse.
- **Four regions,** each ten waves long and ending in a demigod boss:

  | Region | Boss |
  | --- | --- |
  | The Ashen Plains | Morgrath, the Grafted Lord |
  | The Black Fortress | The Iron Warden |
  | The Mount of Cinders | Vyrmora, the Ember Wyrm |
  | The Shattered Throne | The Hollow King |

  After the Hollow King falls, the cycle starts over as an *Ascension* with stronger enemies, and continues without end.
- **When the warband falls,** you earn Embers. Spend them at the **Altar of Embers** on permanent upgrades.
- **Hall of Legends** keeps your best runs, including the best result for each party composition.
- The run is saved after every wave, so you can close the app and pick up where you left off.

### Classes

| Class | Role | Skill |
| --- | --- | --- |
| Tarnished Knight | Tank | Greatshield Bulwark: taunts all foes and shields itself |
| Ranger | Marksman | Piercing Volley: a burst of arrows that cause bleeding |
| Glintstone Sorcerer | Area damage | Glintstone Comet: hits every enemy |
| Priest | Healer | Sacred Litany: heals the whole party, and at rank III revives a fallen hero |
| Paladin | Bruiser / support | Golden Vow: boosts party damage, then smites |
| Necromancer | Summoner | Raise the Fallen: raises skeleton warriors |
| Rogue | Assassin | Shadowstep: a guaranteed critical hit on the weakest foe |
| Artificer | Burn / control | Firepot Barrage: firepots that burn and stun |

## Development

```sh
npm install
npm run dev           # dev server on your LAN; open the URL on your phone
npm test              # engine, determinism and sprite tests
npm run build         # production PWA build in dist/
npm run build:single  # one self-contained HTML file in dist-single/
```

Balance report (simulates hundreds of runs with random choices):

```sh
VITE_BALANCE=1 npx vitest run tests/balance.test.ts --silent=false
```

`tools/sheet.html` (open it via `npm run dev`) renders every sprite for review.

### Layout

- `src/combat/battle.ts`: the deterministic, fixed-step combat simulation, with hooks that relics and gear plug into
- `src/data/`: classes, enemies and regions, relics, bargains, gear effects, upgrades, gear generation and lore
- `src/game/`: run flow (wave generation, rewards, embers) and saving
- `src/render/`: procedural pixel sprites, region backdrops and the battle renderer
- `src/ui/`: the screens, drawn with the DOM

All art is generated in code from small character grids in `src/render/sprites.ts`.
To change a sprite, edit its grid or palette.

### Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the game and publishes it to GitHub Pages.
Before the first deploy, set **Settings → Pages → Source** to "GitHub Actions" once.
