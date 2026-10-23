// Inventory and equipment: what the player owns, saved in the browser between visits.

// Item types and equipment slots. Only swords exist so far; armor and other
// weapon types will add entries here.
export type ItemType = "sword";
export type Slot = "weapon";
export type Tier = "normal" | "legendary";

export const SLOT_FOR_TYPE: Record<ItemType, Slot> = { sword: "weapon" };
export const SLOT_LABELS: Record<Slot, string> = { weapon: "Weapon" };
const TYPE_NAMES: Record<ItemType, string> = { sword: "Sword" };

export const INVENTORY_SIZE = 24;

export interface Item {
  id: number;
  type: ItemType;
  tier: Tier;
  value: number; // gold the item sells for
}

interface SaveData {
  gold: number;
  items: Item[]; // items in the bag (not equipped)
  equipped: Partial<Record<Slot, Item>>;
  nextId: number;
}

const SAVE_KEY = "blacksmith-save";

function load(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { gold: 0, items: [], equipped: {}, nextId: 1, ...JSON.parse(raw) };
  } catch { /* no storage or bad data: start fresh */ }
  return { gold: 0, items: [], equipped: {}, nextId: 1 };
}

export const inventory: SaveData = load();

function persist(): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(inventory)); } catch { /* ignore */ }
}

export function itemName(item: Item): string {
  const base = TYPE_NAMES[item.type];
  return item.tier === "legendary" ? `Legendary ${base}` : `Steel ${base}`;
}

export function isFull(): boolean {
  return inventory.items.length >= INVENTORY_SIZE;
}

// Adds a newly forged item. Returns false (and adds nothing) when the bag is full.
export function addItem(type: ItemType, tier: Tier, value: number): boolean {
  if (isFull()) return false;
  inventory.items.push({ id: inventory.nextId++, type, tier, value });
  persist();
  return true;
}

export function findItem(id: number): Item | undefined {
  return inventory.items.find((i) => i.id === id) ?? Object.values(inventory.equipped).find((i) => i?.id === id);
}

export function equippedSlotOf(id: number): Slot | undefined {
  return (Object.keys(inventory.equipped) as Slot[]).find((s) => inventory.equipped[s]?.id === id);
}

export function addGold(amount: number): void {
  inventory.gold += amount;
  persist();
}

// Sells an item from the bag or an equipment slot.
export function sell(id: number): void {
  const item = findItem(id);
  if (!item) return;
  const slot = equippedSlotOf(id);
  if (slot) delete inventory.equipped[slot];
  else inventory.items = inventory.items.filter((i) => i.id !== id);
  inventory.gold += item.value;
  persist();
}

// Equips an item from the bag; whatever was in that slot goes back to the bag.
export function equip(id: number): void {
  const item = inventory.items.find((i) => i.id === id);
  if (!item) return;
  const slot = SLOT_FOR_TYPE[item.type];
  const previous = inventory.equipped[slot];
  inventory.items = inventory.items.filter((i) => i.id !== id);
  if (previous) inventory.items.push(previous);
  inventory.equipped[slot] = item;
  persist();
}

// Moves an equipped item back to the bag (if there is room).
export function unequip(slot: Slot): boolean {
  const item = inventory.equipped[slot];
  if (!item || isFull()) return false;
  delete inventory.equipped[slot];
  inventory.items.push(item);
  persist();
  return true;
}
