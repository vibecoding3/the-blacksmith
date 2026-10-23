// Blacksmith level and XP, perks (bought with level points) and workshop upgrades (bought with gold).
// Every gameplay bonus is read through the getters at the bottom of this file.

import type { ForgeItem } from "./forgeItems";
import { METALS, type MetalId } from "./metals";
import { persist, save } from "./save";

// Called when the blacksmith reaches a new level (main.ts shows a message and plays a sound).
export const progressEvents = { levelUp: (_level: number) => {} };

// ---- Levels ----

export function xpToNext(level: number): number {
  return 80 + 40 * (level - 1);
}

export function levelInfo(): { level: number; into: number; needed: number } {
  let level = 1;
  let rest = save.xp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level) };
}

export function level(): number {
  return levelInfo().level;
}

export function addXp(amount: number): void {
  const before = level();
  save.xp += Math.round(amount);
  persist();
  const after = level();
  if (after > before) progressEvents.levelUp(after);
}

// ---- Perks: one point per level after the first ----

export type PerkId = "lucky" | "stamina" | "retention" | "steady" | "haggler" | "warrior";
export const PERKS: { id: PerkId; label: string; desc: string; max: number }[] = [
  { id: "lucky", label: "Lucky Hammer", desc: "+1% legendary chance", max: 10 },
  { id: "stamina", label: "Stamina", desc: "+10 max energy", max: 10 },
  { id: "retention", label: "Heat Retention", desc: "Metal cools 8% slower", max: 5 },
  { id: "steady", label: "Steady Hand", desc: "+6% golden zone width", max: 5 },
  { id: "haggler", label: "Haggler", desc: "+5% sale prices", max: 5 },
  { id: "warrior", label: "Warrior", desc: "+5% attack in dungeons", max: 5 },
];

export function perkRank(id: PerkId): number {
  return save.perks[id] ?? 0;
}

export function perkPoints(): number {
  const spent = Object.values(save.perks).reduce((a, b) => a + b, 0);
  return level() - 1 - spent;
}

export function buyPerk(id: PerkId): boolean {
  const perk = PERKS.find((p) => p.id === id)!;
  if (perkPoints() <= 0 || perkRank(id) >= perk.max) return false;
  save.perks[id] = perkRank(id) + 1;
  persist();
  return true;
}

// ---- Workshop upgrades: bought with gold ----

export type UpgradeId = "bellows" | "anvil" | "storage" | "tank" | "whetstone" | "hourglass" | "pickaxe";
export const UPGRADES: { id: UpgradeId; label: string; desc: string; costs: number[] }[] = [
  { id: "bellows", label: "Bellows", desc: "Reheat 30% faster", costs: [150, 400, 900] },
  { id: "anvil", label: "Wide Anvil", desc: "+10% golden zone width", costs: [200, 500, 1200] },
  { id: "storage", label: "Storage Chest", desc: "+8 inventory slots", costs: [300, 800] },
  { id: "tank", label: "Quench Tank", desc: "Quench window 25% wider", costs: [250, 600] },
  { id: "whetstone", label: "Fine Whetstone", desc: "Finishing sweet spot 30% wider", costs: [250, 600] },
  { id: "hourglass", label: "Hourglass", desc: "+15 s per forging round", costs: [200, 500, 1000] },
  { id: "pickaxe", label: "Steel Pickaxe", desc: "+1 mining damage per swing", costs: [200, 600, 1500] },
];

export function upgradeLevel(id: UpgradeId): number {
  return save.upgrades[id] ?? 0;
}

export function nextUpgradeCost(id: UpgradeId): number | null {
  const u = UPGRADES.find((x) => x.id === id)!;
  return u.costs[upgradeLevel(id)] ?? null;
}

export function buyUpgrade(id: UpgradeId): boolean {
  const cost = nextUpgradeCost(id);
  if (cost === null || save.gold < cost) return false;
  save.gold -= cost;
  save.upgrades[id] = upgradeLevel(id) + 1;
  persist();
  return true;
}

// ---- Unlocks ----

export function isItemUnlocked(f: ForgeItem): boolean {
  return level() >= f.level || save.blueprints.includes(f.type);
}

export function isMetalUnlocked(id: MetalId): boolean {
  return level() >= METALS[id].level;
}

// ---- Bonuses ----

export const legendaryChance = () => 0.05 + 0.01 * perkRank("lucky");
export const maxEnergy = () => 100 + 10 * perkRank("stamina");
export const coolMult = () => 1 - 0.08 * perkRank("retention");
export const zoneMult = () => (1 + 0.06 * perkRank("steady")) * (1 + 0.1 * upgradeLevel("anvil"));
export const reheatMult = () => 1 + 0.3 * upgradeLevel("bellows");
export const sellMult = () => 1 + 0.05 * perkRank("haggler");
export const attackMult = () => 1 + 0.05 * perkRank("warrior");
export const inventorySize = () => 24 + 8 * upgradeLevel("storage");
export const roundTime = () => 90 + 15 * upgradeLevel("hourglass");
export const quenchWidthMult = () => 1 + 0.25 * upgradeLevel("tank");
export const finishWidthMult = () => 1 + 0.3 * upgradeLevel("whetstone");
export const pickaxePower = () => 1 + upgradeLevel("pickaxe");
