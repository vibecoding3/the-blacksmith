// Inventory and equipment: what the player owns, saved in the browser between visits.

// Item types and equipment slots. New item types and slots are added here.
export type ItemType =
  | "sword" | "dagger" | "axe" | "spear" | "greatsword" // weapons
  | "helmet" | "shield" | "chestplate" // armor
  | "horseshoe" | "nails"; // trade goods (sell only)
export type Slot = "head" | "chest" | "weapon" | "offhand" | "necklace" | "bracelet" | "ring1" | "ring2";
export type Tier = "normal" | "legendary";

export const LEGENDARY_COLOR = "#ff9f1c";

// Which slots each item type can be worn in (first free one is used); trade goods have none.
// No jewelry can be forged yet, so the necklace, bracelet and ring slots stay empty for now.
const SLOTS_FOR_TYPE: Partial<Record<ItemType, Slot[]>> = {
  sword: ["weapon"], dagger: ["weapon"], axe: ["weapon"], spear: ["weapon"], greatsword: ["weapon"],
  helmet: ["head"], chestplate: ["chest"], shield: ["offhand"],
};
export const SLOT_LABELS: Record<Slot, string> = {
  head: "Head", chest: "Chest", weapon: "Weapon", offhand: "Off-hand",
  necklace: "Necklace", bracelet: "Bracelet", ring1: "Ring 1", ring2: "Ring 2",
};

export function canEquipType(type: ItemType): boolean {
  return (SLOTS_FOR_TYPE[type]?.length ?? 0) > 0;
}

// What kind of equipment an item is ("Weapon", "Ring", ...), or "Trade good".
export function equipKind(type: ItemType): string {
  const slot = SLOTS_FOR_TYPE[type]?.[0];
  return slot ? SLOT_LABELS[slot].replace(/ \d$/, "") : "Trade good";
}
const TYPE_NAMES: Record<ItemType, string> = {
  sword: "Sword", dagger: "Dagger", axe: "Axe", spear: "Spear", greatsword: "Greatsword",
  helmet: "Helmet", shield: "Shield", chestplate: "Chestplate", horseshoe: "Horseshoe", nails: "Nails",
};

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

// Flavour text shown in item tooltips.
export const DESCRIPTIONS: Record<ItemType, string> = {
  sword: "A trusty steel blade, balanced for any fight.",
  dagger: "A light, quick blade for close quarters.",
  axe: "A heavy head that bites deep.",
  spear: "Long reach keeps enemies at bay.",
  greatsword: "A massive blade that needs both hands.",
  helmet: "Guards the head against heavy blows.",
  shield: "Blocks attacks; held in the off-hand.",
  chestplate: "Heavy plate that protects the body.",
  horseshoe: "Sold to stables and farriers.",
  nails: "A bundle of nails for builders.",
};

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

// Sells every bag item matching `filter`. Returns how many were sold and for how much.
export function sellAll(filter: (item: Item) => boolean): { count: number; total: number } {
  const sold = inventory.items.filter(filter);
  const total = sold.reduce((sum, i) => sum + i.value, 0);
  inventory.items = inventory.items.filter((i) => !filter(i));
  inventory.gold += total;
  persist();
  return { count: sold.length, total };
}

// Equips an item from the bag; whatever was in that slot goes back to the bag.
export function equip(id: number): void {
  const item = inventory.items.find((i) => i.id === id);
  if (!item) return;
  const slots = SLOTS_FOR_TYPE[item.type];
  if (!slots) return; // trade goods can't be equipped
  const slot = slots.find((s) => !inventory.equipped[s]) ?? slots[0]; // e.g. the free ring slot
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
