// The Mine: dig your own ore instead of buying it. Each day there is a fresh rock wall; you get
// a limited number of pickaxe swings per trip. The whole wall is visible, but you can only dig a
// rock in the top row or next to one you've already broken, so reaching the rare ore deep down
// means digging a path to it. Steel isn't found in the ground: it is smelted from iron.

import { emit } from "./events";
import { addMaterial, materialCount, spendMaterial } from "./items";
import { GEM_IDS, type MaterialId } from "./metals";
import { addXp, pickaxePower } from "./progression";
import { persist, save } from "./save";

export const MINE_COLS = 8;
export const MINE_ROWS = 6;
export const SWINGS_PER_TRIP = 40;
export const IRON_PER_STEEL = 2;

export type TileKind = "stone" | "copper" | "iron" | "silver" | "gold" | "mithril" | "gem";

// Pickaxe hits needed to break each kind of tile (harder ores take longer).
export const TILE_HP: Record<TileKind, number> = { stone: 2, copper: 3, iron: 4, silver: 5, gold: 6, mithril: 8, gem: 6 };

// Ore found when a vein breaks: [min, max].
const YIELD: Record<"copper" | "iron" | "silver" | "gold" | "mithril", [number, number]> = {
  copper: [2, 4], iron: [1, 3], silver: [1, 2], gold: [1, 2], mithril: [1, 1],
};

// Chance of each tile kind by depth band: rows 0-1, rows 2-3, rows 4-5.
const ODDS: Partial<Record<TileKind, number>>[] = [
  { stone: 0.55, copper: 0.25, iron: 0.2 },
  { stone: 0.45, copper: 0.1, iron: 0.25, silver: 0.12, gold: 0.05, gem: 0.03 },
  { stone: 0.4, iron: 0.15, silver: 0.18, gold: 0.14, mithril: 0.06, gem: 0.07 },
];

export interface MineTile {
  kind: TileKind;
  hp: number;
  maxHp: number;
  broken: boolean;
  reachable: boolean; // in the top row, or next to a broken tile
}

export interface MineState {
  day: number; // the day this rock wall belongs to
  swings: number; // swings left on today's trip
  tiles: MineTile[];
  haul: Partial<Record<MaterialId, number>>; // everything found today
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function rollKind(row: number): TileKind {
  const odds = ODDS[Math.min(ODDS.length - 1, Math.floor(row / 2))];
  let r = Math.random();
  for (const [kind, p] of Object.entries(odds) as [TileKind, number][]) {
    r -= p;
    if (r < 0) return kind;
  }
  return "stone";
}

function generate(): MineState {
  const tiles: MineTile[] = [];
  for (let row = 0; row < MINE_ROWS; row++) {
    for (let col = 0; col < MINE_COLS; col++) {
      const kind = rollKind(row);
      tiles.push({ kind, hp: TILE_HP[kind], maxHp: TILE_HP[kind], broken: false, reachable: row === 0 });
    }
  }
  return { day: save.day, swings: SWINGS_PER_TRIP, tiles, haul: {} };
}

// Today's mine; a fresh wall is dug out on each new day.
export function currentMine(): MineState {
  if (!save.mine || save.mine.day !== save.day) {
    save.mine = generate();
    persist();
  }
  return save.mine;
}

// Breaking a tile opens the way to the tiles around it.
function openNeighbours(m: MineState, index: number): void {
  const row = Math.floor(index / MINE_COLS);
  const col = index % MINE_COLS;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < MINE_ROWS && c >= 0 && c < MINE_COLS) m.tiles[r * MINE_COLS + c].reachable = true;
  }
}

export interface SwingResult {
  damage: number;
  broken: boolean;
  loot?: { id: MaterialId; amount: number };
}

// One pickaxe swing at a tile. Returns null if the tile can't be reached (or no swings are left).
export function swing(index: number): SwingResult | null {
  const m = currentMine();
  const tile = m.tiles[index];
  if (!tile || !tile.reachable || tile.broken || m.swings <= 0) return null;
  m.swings--;
  const damage = pickaxePower();
  tile.hp = Math.max(0, tile.hp - damage);
  const result: SwingResult = { damage, broken: tile.hp === 0 };
  if (result.broken) {
    tile.broken = true;
    openNeighbours(m, index);
    let loot: SwingResult["loot"];
    if (tile.kind === "gem") loot = { id: GEM_IDS[Math.floor(Math.random() * GEM_IDS.length)], amount: 1 };
    else if (tile.kind === "stone") loot = Math.random() < 0.15 ? { id: "copper", amount: 1 } : undefined;
    else loot = { id: tile.kind, amount: randInt(...YIELD[tile.kind]) };
    if (loot) {
      addMaterial(loot.id, loot.amount);
      m.haul[loot.id] = (m.haul[loot.id] ?? 0) + loot.amount;
      addXp(tile.kind === "gem" ? 6 : loot.amount);
      emit({ type: "mined", material: loot.id, amount: loot.amount });
      result.loot = loot;
    }
  }
  persist();
  return result;
}

// Smelts iron ore into steel. Returns how many steel ingots were made.
export function smelt(steel: number): number {
  const made = Math.min(steel, Math.floor(materialCount("iron") / IRON_PER_STEEL));
  if (made <= 0) return 0;
  spendMaterial("iron", made * IRON_PER_STEEL);
  addMaterial("steel", made);
  return made;
}
