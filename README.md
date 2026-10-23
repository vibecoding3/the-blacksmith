# Blacksmith Simulator

<img src="public/favicon.svg" alt="Blacksmith Simulator logo" width="96">

A browser game written in TypeScript. Forge weapons, armor and jewelry from real metals, sell them at the market, fill customer orders, and take your best gear into dungeons to fight for ore, gems, gold and XP.

**Play it here:** https://vibecoding3.github.io/the-blacksmith/

## How to play

The menu bar on the left switches between the game's menus. Your gold and blacksmith level are shown under the menu buttons. The forge pauses while you're in another menu or reading help.

| Menu | What it's for |
| --- | --- |
| **Forge** | Make items: hammer, quench, sharpen/polish. Also used for repairs. |
| **Inventory** | Equip gear in 8 slots, and send worn gear for repair. |
| **Trade Market** | Buy ore and gems; sell items at today's prices. |
| **Orders** | Customers who pay extra gold and XP for a specific item. |
| **Dungeon** | Auto-battles with your equipped gear, for ore, gems, gold, XP and blueprints. |
| **Workshop** | Permanent forge upgrades, bought with gold. |
| **Blacksmith** | Level, XP and perks; save export/import; sound on/off. |

### Controls

| Key | Action |
| --- | --- |
| Mouse / `A` `D` / `←` `→` | Move the marker along the strike bar |
| `Space` / click | Strike; quench; hold to sharpen or polish (also starts a round) |
| `S` / `↓` | Put the metal back in the forge to reheat it |
| `1`–`9`, `0` / item bar | Choose what to forge (between pieces) |
| `I` | Switch between Forge and Inventory |
| `M` | Sound on/off |
| `H` / **? Help** | Help panel (pauses the game) |

### Forging a piece

1. **Choose** an item from the bar at the top and a metal below it (jewelry also needs a gem). Each piece uses ore from your stock, taken at the first hit.
2. **Hammer:** steer the marker into the golden zone and strike. Only hits inside the zone count; each swing costs 1 energy. Bigger items need more hits, spread over several **heats**: between heats you must reheat the metal (S). Hits on hotter metal give better **quality**, and the golden zone shrinks as the metal cools. Below the blue cold line the metal can't be worked.
3. **Quench** (weapons and armor): plunge the piece into water when its temperature is inside the green quench window. Too hot leaves cracks (−10%), in the window gives a perfect temper (+15%), too cool leaves it soft (no bonus).
4. **Sharpen or polish** (weapons, armor and jewelry): hold Space or the mouse button at the grindstone and release in the green zone (up to +10%). Holding too long ruins the edge (−5%).
5. The result is revealed: any piece can turn out **★ Legendary**, worth 5× as much, with 1.5× stats and a random **trait**.

A round lasts 90 seconds with 100 energy (both can be raised). Each round ends a **day**: market prices change and new customer orders arrive.

### Items

| # | Item | Ore | Hits / heats | Value | Kind | Unlocks at | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sword | 3 | 5 / 2 | 1× | Weapon (attack 10) | Level 1 | Balanced all-rounder |
| 2 | Dagger | 2 | 3 / 1 | 0.5× | Weapon (attack 6) | Level 1 | Thin blade: cools 1.5× faster |
| 3 | Axe | 3 | 6 / 2 | 1.3× | Weapon (attack 12) | Level 2 | Only the head is forged |
| 4 | Spear | 2 | 4 / 1 | 0.9× | Weapon (attack 9) | Level 3 | Tiny forging area |
| 5 | Greatsword | 5 | 8 / 3 | 2× | Weapon (attack 16) | Level 6 | Three heats |
| 6 | Helmet | 3 | 6 / 2 | 1.2× | Head (defense 4) | Level 4 | |
| 7 | Shield | 4 | 7 / 2 | 1.4× | Off-hand (defense 6) | Level 5 | Holds heat well |
| 8 | Chestplate | 6 | 9 / 3 | 2.5× | Chest (defense 9) | Level 8 | The biggest piece |
| 9 | Horseshoe | 1 | 2 / 1 | 0.25× | Trade good | Level 1 | Quick, safe gold |
| 0 | Nails | 1 | 1 / 1 | 0.1× | Trade good | Level 1 | One hit |
| | Ring | 1 + gem | 2 / 1 | 0.8× | Ring (2 slots) | Level 4 | Needs silver, gold or mithril |
| | Bracelet | 1 + gem | 3 / 1 | 1× | Bracelet | Level 5 | Needs silver, gold or mithril |
| | Necklace | 2 + gem | 4 / 1 | 1.5× | Necklace | Level 6 | Needs silver, gold or mithril |

Dungeon bosses can drop **blueprints** that unlock an item before you reach its level.

### Metals and gems

Forging temperatures follow real metalworking: steel and wrought iron are worked yellow-hot, while silver and gold melt at 962 °C and 1064 °C and are worked much cooler (they barely glow). Mithril is fantasy.

| Metal | Forge heat | Cold below | Quench window | Value | Strength | Ore price | Unlocks at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Copper | 900 °C | 650 °C | 550–650 °C | 0.4× | 0.5× | 3g | Level 1 |
| Iron | 1250 °C | 850 °C | 800–900 °C | 0.7× | 0.8× | 5g | Level 1 |
| Steel | 1200 °C | 800 °C | 760–860 °C | 1× | 1× | 10g | Level 2 |
| Silver | 700 °C | 450 °C | 550–650 °C | 2× | 0.7× (jewelry 1×) | 25g | Level 4 |
| Gold | 750 °C | 500 °C | 600–700 °C | 4.5× | 0.6× (jewelry 1.5×) | 60g | Level 6 |
| Mithril | 1500 °C | 1100 °C | 1000–1100 °C | 10× | 2× (jewelry 2.5×) | 150g | Level 9 |

Gems for jewelry: **Ruby** (+4 attack), **Sapphire** (+3 defense), **Emerald** (+20 HP), scaled by the metal and quality.

New blacksmiths start with 10 copper and 15 iron ore.

### Stats, traits and durability

- **Attack / defense / HP** = the item's base power × metal strength × quality (50–100%) × quench and finish bonuses × 1.5 if legendary.
- **Legendary traits:** Keen (+15% critical chance), Vampiric (heal 10% of damage dealt), Swift (20% chance to strike twice), Sturdy (never loses durability), Thorns (reflect 20% of damage taken), Blessed (+25% dungeon XP).
- **Durability:** weapons and armor lose 4 durability per dungeon room. At 0 they work at half strength. **Repair** them from the Inventory: the item goes on the anvil for half its usual hits, using 1 ore of its metal.

### Dungeons

Your blacksmith fights automatically, room by room (4 rooms, then a boss), healing 15% between rooms. Loot, gold and XP are kept even if you retreat or are defeated.

| Dungeon | Level | Entry | Boss | Loot |
| --- | --- | --- | --- | --- |
| Rat Cellar | 1 | Free | Giant Rat | Copper, iron, rare ruby |
| Goblin Mines | 3 | 30g | Goblin Chief | Iron, steel, rubies, sapphires |
| Crypt of Bones | 5 | 80g | Lich | Steel, silver, sapphires, emeralds |
| Dragon's Lair | 8 | 200g | Ancient Dragon | Silver, gold, mithril, emeralds, rubies |

### Progression

- **XP** comes from forging, repairs, orders and dungeons. Each level gives a **perk point**: Lucky Hammer (+1% legendary chance), Stamina (+10 max energy), Heat Retention (metal cools 8% slower), Steady Hand (+6% golden zone), Haggler (+5% sale prices), Warrior (+5% dungeon attack).
- **Workshop upgrades** (gold): Bellows (reheat 30% faster), Wide Anvil (+10% golden zone), Storage Chest (+8 inventory slots), Quench Tank (wider quench window), Fine Whetstone (wider finishing zone), Hourglass (+15 s per round).
- **Market:** each day two item types are in demand (+30–60%) and one is out of fashion (−30%). Customer orders pay about 1.8× the minimum value they ask for, plus XP.

### Saving

Progress (gold, items, equipment, materials, level, perks, upgrades, orders, day) is saved in your browser automatically. The save has a format version, so saves from older game versions are upgraded automatically. In **Blacksmith** you can **export** your save as a file (as a backup or to move it to another browser) and **import** it again.

## Display

The game renders at a fixed **1280×720** resolution and runs at up to **60 fps**, including on 120/144 Hz screens. In smaller browser windows it shrinks to fit while keeping its 16:9 shape. Sound effects are synthesized in the browser (no audio files).

## Running locally

Requires [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install
npm run dev      # start a dev server at http://localhost:5173/the-blacksmith/
npm run build    # type-check and build a static site into dist/
npm run preview  # serve the built dist/ folder
```

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page and game canvas |
| `src/main.ts` | Sidebar, input routing, help panel, screen effects and the game loop |
| `src/ui.ts` | Canvas, layout and shared drawing helpers |
| `src/forge.ts` | The forge: hammering, heats, quenching, finishing and repairs |
| `src/forgeItems.ts` | Forgeable items: stats and strike-bar shapes |
| `src/items.ts` | Item model, stats, equipment, gold and materials |
| `src/metals.ts` | Metals and gems |
| `src/progression.ts` | Levels, XP, perks, workshop upgrades, unlocks and all bonuses |
| `src/market.ts` | Daily demand, sale prices and customer orders |
| `src/dungeons.ts` | Dungeons, monsters and the auto-battle |
| `src/save.ts` | Versioned save, migrations, export and import |
| `src/audio.ts` | Synthesized sound effects |
| `src/icons.ts` | Item, ore and gem icons |
| `src/screens/` | One file per menu (inventory, market, orders, dungeon, workshop, blacksmith) plus the shared bag grid |
| `public/favicon.svg` | Logo, used as the browser-tab icon and on the start screen |
| `VERSION` | Build number shown in the game |
| `vite.config.ts` | Build settings (GitHub Pages path, version injection) |
| `.github/workflows/deploy.yml` | Builds and publishes the game to GitHub Pages |

## Versioning

The build number is a single integer stored in the `VERSION` file. It goes up by one for every release (1, 2, 3, …). At build time it is shown in the bottom-right corner of the game as `vN`, so you can check which build you are playing.

To release a new version, increase the number in `VERSION`, then commit and push.

## Deployment

Every push to `main` runs the GitHub Actions workflow, which builds the game and publishes it to GitHub Pages. If the page still shows an old version number after a deploy finishes, refresh the page.

## Changelog

- **v24** – The big update:
  - **Metals and materials:** copper, iron, steel, silver, gold and mithril, each with real working temperatures, quench windows, value and strength. Forging uses ore; buy ore and gems at the Trade Market or find them in dungeons.
  - **Jewelry:** rings, bracelets and necklaces made from fine metals and set with a ruby, sapphire or emerald.
  - **New forging steps:** quenching at the right temperature and sharpening/polishing at the grindstone.
  - **Item stats** (attack, defense, HP), **legendary traits** and **durability**, with **repairs** at the forge.
  - **Dungeons:** four dungeons with auto-battles, bosses and loot (ore, gems, gold, XP, blueprints).
  - **Progression:** blacksmith levels and XP, a perk tree, and items and metals that unlock by level.
  - **Economy:** daily market demand, customer **Orders**, and **Workshop** upgrades.
  - **Sound effects** and screen shake; **save versioning** with automatic upgrades of old saves, plus save **export/import**.
  - New **Orders**, **Workshop** and **Blacksmith** menus. Rounds now last 90 seconds.
  - Existing saves are upgraded: earlier items become steel items, and you get the starter ore.
- **v23** – New **Dungeon** menu in the sidebar. For now it is a placeholder (“Coming soon”); later you will enter dungeons to fight monsters and earn items and XP.
- **v22** – The Inventory no longer shows the blacksmith figure. New equipment slots: **Necklace**, **Bracelet** and two **Rings** (jewelry items to fill them will come later).
- **v21** – Hovering over an item in the Inventory (bag or equipment slots) or the Trade Market shows a tooltip with its name, tier, slot, a short description and its value. Item stats will be added to it later.
- **v20** – Equipped items are no longer drawn on the blacksmith figure in the Inventory; they are shown only in their equipment slots.
- **v19** – Nine new items to forge: dagger, axe, spear, greatsword, helmet, shield, chestplate, horseshoe and nails, each with its own strike-bar shape, hits, heats, value and cooling. New item bar (keys 1–9, 0) to choose what to forge. New **Head**, **Chest** and **Off-hand** equipment slots; trade goods can only be sold.
- **v18** – New **Trade Market** menu for selling items, with a **Sell all normal** button. Selling moved there from the Inventory, which is now for equipping.
- **v17** – Inventory system and a menu bar on the left with **Forge** and **Inventory**. Forged swords go to your inventory instead of being sold automatically; you choose what to equip or sell. Gold, items and equipment are saved between visits. The help button moved to the menu bar, and the per-round best score was removed.
- **v16** – Items need a set number of hits spread over heat cycles. A sword now takes 5 hits over 2 heats (3 + 2), with a required reheat in between. Clicking strikes exactly where you click.
- **v15** – Help button (**?**) in the top-right corner, also opened with H. It pauses the game and explains the controls and the item tiers (Normal and Legendary).
- **v14** – The energy counter shows your maximum as well (e.g. 50/100) and no longer turns red when low.
- **v13** – Fixed 1280×720 resolution (16:9) and a 60 fps frame cap.
- **v12** – The strike bar is now shaped like a sword (pommel, grip, crossguard and blade); the golden zone and marker stay on the blade.
- **v11** – Legendary swords: each finished sword has a 5% chance (shown as a ★ stat) to be legendary and sell for 5× the price, revealed when the sword is done.
- **v10** – Energy system: you start with 100 energy (yellow lightning bolt), each hammer swing costs 1, and the round ends when you run out.
- **v9** – Strikes outside the golden zone no longer count: they don't shape or cool the blade, and every one of the three hits must land in the zone.
- **v8** – Removed the perfect hit: any strike inside the golden zone counts the same, and the bright centre line is gone.
- **v7** – The marker follows the mouse pointer directly, with no speed limit (keys still move it at a fixed speed).
- **v6** – Steer the marker with the mouse as well as the keys. The marker slides toward the pointer at the same speed as with the keys.
- **v5** – Added the crossed hammer-and-sword logo as the browser-tab icon and on the start screen.
- **v4** – Realistic heat: the blade's temperature is tracked in °C (forged at 1200 °C, too cold below 800 °C) and shown next to the HEAT gauge, and the blade glows in real steel heat colours.
- **v3** – Heating system: the blade cools over time and with each strike, cooler metal has a smaller golden zone and earns less, and you reheat it in the forge with S or ↓.
- **v2** – You steer the marker yourself with A/D or the arrow keys. The version number is shown in-game. Added this README.
- **v1** – First release: the marker sweeps across the bar automatically and you strike when it is in the golden zone.
