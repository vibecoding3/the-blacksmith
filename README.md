# Blacksmith Simulator

<img src="public/favicon.svg" alt="Blacksmith Simulator logo" width="96">

A small browser game written in TypeScript. Forge as many swords as you can in 60 seconds by striking the hot blade at just the right spot.

**Play it here:** https://vibecoding3.github.io/the-blacksmith/

## How to play

| Key | Action |
| --- | --- |
| `A` / `←` | Move the marker left |
| `D` / `→` | Move the marker right |
| Mouse | Move the pointer left or right: the marker follows it |
| `Space` / click | Strike the blade (also starts a new round) |
| `S` / `↓` | Put the blade back in the forge to reheat it |

- Steer the marker into the golden zone and strike. Only hits inside the zone count: a strike outside it ("Miss!") does nothing to the blade.
- Three hits forge a sword, which sells automatically. Swords hammered on hotter metal sell for more gold (up to 100g).
- **Legendary swords:** every finished sword has a chance to turn out legendary, shown as the orange ★ stat under your energy (5% for now). You only find out when the sword is done. A legendary sword sells for 5× the normal price.
- **Energy:** you start each round with 100 energy, shown by the yellow lightning bolt under your sword count. Every hammer swing costs 1 energy, whether it hits, misses or lands on cold metal. At 0 energy you can't forge any more and the round ends, even if time is left.
- The golden zone gets smaller with every sword you finish.
- **Heat:** the blade's temperature in °C is shown on the HEAT gauge on the right. The blade cools by about 30 °C per second in the air and 60 °C per strike.
  - Temperatures follow real steel forging: the forge brings the blade to a **yellow 1200 °C**, and it glows orange, then cherry red as it cools. The blade and gauge change colour to match.
  - Cooler metal is harder to work: the golden zone shrinks as the blade cools, and strikes are worth less.
  - Below **800 °C** (cherry red, the blue line) the steel is too cold to shape, and strikes do nothing. Real smiths stop hammering here because the steel can crack.
  - Press `S` or `↓` to reheat. The blade stays in the forge until it is fully hot, and you can't move or strike meanwhile. The colder it is, the longer this takes.
  - Each new sword starts fully hot.
- Your best score is saved in your browser.

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
| `src/main.ts` | All game code: state, input, update loop and drawing |
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
