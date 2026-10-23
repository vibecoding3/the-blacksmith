// The player's progress, saved in the browser (localStorage) under one key.
// Every save carries a version number; older saves are upgraded step by step in migrate().

import { forgeItemFor } from "./forgeItems";
import type { Item, ItemType, Slot } from "./items";
import type { GuildState } from "./guild";
import type { MineState } from "./mine";

export const SAVE_VERSION = 6;

// Ore every new blacksmith starts with (also given to players whose save predates materials).
const STARTER_MATERIALS = { copper: 10, iron: 15 };
const SAVE_KEY = "blacksmith-save";

export interface Order {
  id: number;
  customer: string;
  type: ItemType;
  metal: string;
  minValue: number;
  reward: number;
  xp: number;
}

export interface SaveData {
  version: number;
  gold: number;
  items: Item[]; // items in the bag (not equipped)
  equipped: Partial<Record<Slot, Item>>;
  nextId: number;
  xp: number;
  perks: Record<string, number>; // perk id -> rank
  upgrades: Record<string, number>; // workshop upgrade id -> level
  materials: Record<string, number>; // ores and gems -> amount owned
  blueprints: ItemType[]; // items unlocked early by dungeon blueprints
  orders: Order[];
  day: number; // a new day starts after each forging round
  demand: Partial<Record<ItemType, number>>; // today's price multipliers at the market
  mine: MineState | null; // today's rock wall in the Mine
  guild: GuildState; // Adventurer's Guild license, rank and quests
  muted: boolean;
}

function defaults(): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    items: [],
    equipped: {},
    nextId: 1,
    xp: 0,
    perks: {},
    upgrades: {},
    materials: { ...STARTER_MATERIALS },
    blueprints: [],
    orders: [],
    day: 1,
    demand: {},
    mine: null,
    guild: { registered: false, name: "", rank: 0, points: 0, completed: 0, board: [], boardDay: 0, active: [] },
    muted: false,
  };
}

// Upgrades a save of any older version to the current format, one version at a time.
function migrate(data: Record<string, unknown>): SaveData {
  const d: Record<string, unknown> = { ...data };
  // v1 (game v17-v23, no version field): gold, items, equipped, nextId.
  if (typeof d.version !== "number") d.version = 1;
  // v1 -> v2: progression, materials, orders, market and settings fields (filled from defaults below).
  // v2 -> v3: items gain metal, quality, quench/finish bonuses and durability.
  // v3 -> v4: the Mine (today's rock wall), filled from defaults below.
  // v5 -> v6: the Adventurer's Guild (filled from defaults below).
  // v4 -> v5: mine tiles are all visible; "revealed" becomes "reachable" and weak spots are gone.
  if ((d.version as number) < 5 && d.mine) {
    const mine = d.mine as { tiles: Record<string, unknown>[] };
    mine.tiles = mine.tiles.map(({ revealed, spot: _spot, ...tile }) => ({ ...tile, reachable: revealed === true }));
  }
  if ((d.version as number) < 3) {
    const upgrade = (item: Item & { quality?: number }) => {
      if (item.metal) return item;
      // Before metals every item was steel; work out the forging quality from its value.
      const f = forgeItemFor(item.type);
      const legendaryMult = item.tier === "legendary" ? 5 : 1;
      const quality = Math.min(1, Math.max(0.3, Math.sqrt(item.value / (100 * f.valueMult * legendaryMult))));
      return { ...item, metal: "steel", quality, temper: 0, edge: 0, durability: 100 } as Item;
    };
    d.items = ((d.items as Item[]) ?? []).map(upgrade);
    const equipped = (d.equipped ?? {}) as Record<string, Item>;
    d.equipped = Object.fromEntries(Object.entries(equipped).map(([slot, item]) => [slot, upgrade(item)]));
    d.materials = { ...STARTER_MATERIALS, ...((d.materials as Record<string, number>) ?? {}) };
  }
  return { ...defaults(), ...d, version: SAVE_VERSION } as SaveData;
}

function isSaveLike(d: unknown): d is Record<string, unknown> {
  return typeof d === "object" && d !== null && typeof (d as SaveData).gold === "number" && Array.isArray((d as SaveData).items);
}

function load(): SaveData {
  try {
    localStorage.removeItem("blacksmith-best"); // leftover best score from game v1-v16
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isSaveLike(parsed)) return migrate(parsed);
    }
  } catch { /* no storage or bad data: start fresh */ }
  return defaults();
}

export const save: SaveData = load();

export function persist(): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
}
persist(); // store any migration straight away

// Downloads the save as a JSON file the player can keep as a backup.
export function exportSave(): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `blacksmith-save-day${save.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Lets the player pick a save file and replaces the current progress with it.
export function importSave(done: (message: string, ok: boolean) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isSaveLike(parsed)) throw new Error("not a save");
      const next = migrate(parsed);
      for (const key of Object.keys(save)) delete (save as unknown as Record<string, unknown>)[key];
      Object.assign(save, next);
      persist();
      done(`Loaded save from ${file.name}.`, true);
    } catch {
      done("That file is not a Blacksmith Simulator save.", false);
    }
  };
  input.click();
}
