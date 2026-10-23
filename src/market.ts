// The market economy: daily demand for item types, sale prices, and customer orders.
// A new day starts after each forging round.

import { emit } from "./events";
import { FORGE_ITEMS } from "./forgeItems";
import { addGold, computeValue, removeFromBag, type Item, type ItemType } from "./items";
import { METAL_IDS, METALS, type MetalId } from "./metals";
import { addXp, isItemUnlocked, isMetalUnlocked, sellMult } from "./progression";
import { persist, save, type Order } from "./save";

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ---- Prices ----

export function salePrice(item: Item): number {
  return Math.max(1, Math.round(item.value * (save.demand[item.type] ?? 1) * sellMult()));
}

// Two item types are wanted (+30..60%) and one is out of fashion (-30%) each day.
function rollDemand(): void {
  const types = FORGE_ITEMS.filter(isItemUnlocked).map((f) => f.type);
  const shuffled = [...types].sort(() => Math.random() - 0.5);
  save.demand = {};
  shuffled.slice(0, 2).forEach((t) => (save.demand[t] = Math.round(rand(1.3, 1.6) * 100) / 100));
  if (shuffled[2]) save.demand[shuffled[2]] = 0.7;
}

// ---- Customer orders ----

const CUSTOMERS = [
  "Sir Aldric", "Captain Mara", "Farmer Jon", "Lady Elowen", "Old Brannoc", "Guard Tilda",
  "Merchant Osric", "Ranger Fenn", "Baron Hollis", "Innkeeper Rosa", "Squire Pip", "Duchess Ilse",
];
export const MAX_ORDERS = 3;

function newOrder(): Order {
  // Only ask for things the player can make right now.
  const items = FORGE_ITEMS.filter(isItemUnlocked);
  const f = pick(items);
  const metals = METAL_IDS.filter((m) => isMetalUnlocked(m) && (f.kind !== "jewelry" || METALS[m].jewelryMult));
  const metal: MetalId = metals.length ? pick(metals) : "iron";
  const best = computeValue(f.type, metal, undefined, 1, 0, 0, false);
  const minValue = Math.max(1, Math.round(best * rand(0.3, 0.55)));
  return {
    id: save.nextId++,
    customer: pick(CUSTOMERS),
    type: f.type,
    metal,
    minValue,
    reward: Math.round(minValue * 1.8 + 15),
    xp: Math.round(15 + minValue / 4),
  };
}

function fillOrders(): void {
  save.orders = save.orders.filter((o) => FORGE_ITEMS.some((f) => f.type === o.type));
  while (save.orders.length < MAX_ORDERS) {
    const order = newOrder();
    // A jewelry order can't be filled before any fine metal is unlocked.
    if (FORGE_ITEMS.find((f) => f.type === order.type)?.kind === "jewelry" && !METALS[order.metal as MetalId].jewelryMult) continue;
    save.orders.push(order);
  }
}

// The cheapest bag item that satisfies an order, if any.
export function matchingItem(order: Order): Item | undefined {
  return save.items
    .filter((i) => i.type === order.type && i.metal === order.metal && i.value >= order.minValue)
    .sort((a, b) => a.value - b.value)[0];
}

export function deliver(orderId: number): Order | undefined {
  const order = save.orders.find((o) => o.id === orderId);
  const item = order && matchingItem(order);
  if (!order || !item) return undefined;
  removeFromBag(item.id);
  addGold(order.reward);
  addXp(order.xp);
  save.orders = save.orders.filter((o) => o.id !== orderId);
  fillOrders();
  persist();
  return order;
}

export const REROLL_COST = 20;

export function rerollOrders(): boolean {
  if (save.gold < REROLL_COST) return false;
  save.gold -= REROLL_COST;
  save.orders = [];
  fillOrders();
  persist();
  return true;
}

export function itemTypeLabel(type: ItemType): string {
  return FORGE_ITEMS.find((f) => f.type === type)!.label;
}

// ---- Days ----

export function newDay(): void {
  save.day++;
  rollDemand();
  fillOrders();
  persist();
  emit({ type: "newDay" });
}

// First run (or a save from before markets had days): set up today's prices and orders.
export function initMarket(): void {
  if (Object.keys(save.demand).length === 0) rollDemand();
  fillOrders();
  persist();
}
