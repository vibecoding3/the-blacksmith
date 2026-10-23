// Items, equipment, materials and gold: what the player owns (stored in the save).

import { forgeItemFor, type ItemKind } from "./forgeItems";
import { GEMS, METALS, type GemId, type MaterialId, type MetalId } from "./metals";
import { inventorySize } from "./progression";
import { persist, save } from "./save";

// Item types and equipment slots. New item types and slots are added here.
export type ItemType =
  | "sword" | "dagger" | "axe" | "spear" | "greatsword" // weapons
  | "helmet" | "shield" | "chestplate" // armor
  | "ring" | "bracelet" | "necklace" // jewelry
  | "horseshoe" | "nails"; // trade goods (sell only)
export type Slot = "head" | "chest" | "weapon" | "offhand" | "necklace" | "bracelet" | "ring1" | "ring2";
export type Tier = "normal" | "legendary";

export const LEGENDARY_COLOR = "#ff9f1c";
export const LEGENDARY_VALUE_MULT = 5;
export const LEGENDARY_STAT_MULT = 1.5;
export const MAX_DURABILITY = 100;

// Which slots each item type can be worn in (the first free one is used); trade goods have none.
const SLOTS_FOR_TYPE: Partial<Record<ItemType, Slot[]>> = {
  sword: ["weapon"], dagger: ["weapon"], axe: ["weapon"], spear: ["weapon"], greatsword: ["weapon"],
  helmet: ["head"], chestplate: ["chest"], shield: ["offhand"],
  ring: ["ring1", "ring2"], bracelet: ["bracelet"], necklace: ["necklace"],
};
export const SLOT_LABELS: Record<Slot, string> = {
  head: "Head", chest: "Chest", weapon: "Weapon", offhand: "Off-hand",
  necklace: "Necklace", bracelet: "Bracelet", ring1: "Ring 1", ring2: "Ring 2",
};
const TYPE_NAMES: Record<ItemType, string> = {
  sword: "Sword", dagger: "Dagger", axe: "Axe", spear: "Spear", greatsword: "Greatsword",
  helmet: "Helmet", shield: "Shield", chestplate: "Chestplate", ring: "Ring", bracelet: "Bracelet", necklace: "Necklace",
  horseshoe: "Horseshoe", nails: "Nails",
};

// Flavour text shown in item tooltips.
export const DESCRIPTIONS: Record<ItemType, string> = {
  sword: "A trusty blade, balanced for any fight.",
  dagger: "A light, quick blade for close quarters.",
  axe: "A heavy head that bites deep.",
  spear: "Long reach keeps enemies at bay.",
  greatsword: "A massive blade that needs both hands.",
  helmet: "Guards the head against heavy blows.",
  shield: "Blocks attacks; held in the off-hand.",
  chestplate: "Heavy plate that protects the body.",
  ring: "A band set with a gem that lends its power.",
  bracelet: "A wrist band set with a gem.",
  necklace: "A fine chain with a gem pendant.",
  horseshoe: "Sold to stables and farriers.",
  nails: "A bundle of nails for builders.",
};

// Legendary items get one random trait, chosen from those that suit the item's kind.
export type TraitId = "keen" | "vampiric" | "swift" | "sturdy" | "thorns" | "blessed";
export const TRAITS: Record<TraitId, { label: string; desc: string; kinds: ItemKind[] }> = {
  keen: { label: "Keen", desc: "+15% critical hit chance", kinds: ["weapon", "jewelry"] },
  vampiric: { label: "Vampiric", desc: "Heals 10% of damage dealt", kinds: ["weapon", "jewelry"] },
  swift: { label: "Swift", desc: "20% chance to strike twice", kinds: ["weapon"] },
  sturdy: { label: "Sturdy", desc: "Never loses durability", kinds: ["weapon", "armor"] },
  thorns: { label: "Thorns", desc: "Reflects 20% of damage taken", kinds: ["armor", "jewelry"] },
  blessed: { label: "Blessed", desc: "+25% XP from dungeons", kinds: ["armor", "jewelry"] },
};

export function randomTrait(kind: ItemKind): TraitId | undefined {
  const options = (Object.keys(TRAITS) as TraitId[]).filter((t) => TRAITS[t].kinds.includes(kind));
  return options[Math.floor(Math.random() * options.length)];
}

export interface Item {
  id: number;
  type: ItemType;
  tier: Tier;
  value: number; // base sale value in gold (market demand changes the actual price)
  metal: MetalId;
  gem?: GemId; // jewelry only
  quality: number; // 0..1: how hot the metal was at each hit
  temper: number; // quench bonus (-0.1 too hot, 0 too cool, +0.15 perfect)
  edge: number; // sharpening / polishing bonus (-0.05 .. +0.1)
  trait?: TraitId; // legendary items only
  durability: number; // 0..MAX_DURABILITY; worn down in dungeons, restored by repairing at the forge
}

export interface Stats {
  attack: number;
  defense: number;
  hp: number;
}

export function itemKind(type: ItemType): ItemKind {
  return forgeItemFor(type).kind;
}

export function itemName(item: Item): string {
  const gem = item.gem ? `${GEMS[item.gem].label} ` : "";
  const prefix = item.tier === "legendary" ? "Legendary " : "";
  return `${prefix}${METALS[item.metal].label} ${gem}${TYPE_NAMES[item.type]}`;
}

export function canEquipType(type: ItemType): boolean {
  return (SLOTS_FOR_TYPE[type]?.length ?? 0) > 0;
}

// What kind of equipment an item is ("Weapon", "Ring", ...), or "Trade good".
export function equipKind(type: ItemType): string {
  const slot = SLOTS_FOR_TYPE[type]?.[0];
  return slot ? SLOT_LABELS[slot].replace(/ \d$/, "") : "Trade good";
}

export function usesDurability(type: ItemType): boolean {
  const kind = itemKind(type);
  return kind === "weapon" || kind === "armor";
}

export function isBroken(item: Item): boolean {
  return usesDurability(item.type) && item.durability <= 0;
}

// Stats come from the item's base power, metal, forging quality, quench and finish bonuses.
// A broken item (0 durability) only works at half strength.
export function itemStats(item: Item): Stats {
  const f = forgeItemFor(item.type);
  const metal = METALS[item.metal];
  const factor = (0.5 + 0.5 * item.quality) * (1 + item.temper + item.edge)
    * (item.tier === "legendary" ? LEGENDARY_STAT_MULT : 1) * (isBroken(item) ? 0.5 : 1);
  const stats: Stats = { attack: 0, defense: 0, hp: 0 };
  if (f.kind === "weapon") stats.attack = Math.round(f.power * metal.statMult * factor);
  else if (f.kind === "armor") stats.defense = Math.round(f.power * metal.statMult * factor);
  else if (f.kind === "jewelry" && item.gem) {
    const gem = GEMS[item.gem];
    stats[gem.stat] = Math.round(gem.amount * (metal.jewelryMult ?? 1) * factor);
  }
  return stats;
}

export function computeValue(type: ItemType, metal: MetalId, gem: GemId | undefined, quality: number,
  temper: number, edge: number, legendary: boolean): number {
  const f = forgeItemFor(type);
  const legendaryMult = legendary ? LEGENDARY_VALUE_MULT : 1;
  const metalValue = 100 * f.valueMult * METALS[metal].valueMult * quality * quality * (1 + temper + edge) * legendaryMult;
  const gemValue = gem ? GEMS[gem].value * (legendary ? 2 : 1) : 0;
  return Math.max(1, Math.round(metalValue + gemValue));
}

// ---- Bag and equipment ----

export function isFull(): boolean {
  return save.items.length >= inventorySize();
}

// Adds a newly made item to the bag. Returns false (and adds nothing) when the bag is full.
export function addItem(fields: Omit<Item, "id">): boolean {
  if (isFull()) return false;
  save.items.push({ id: save.nextId++, ...fields });
  persist();
  return true;
}

export function findItem(id: number): Item | undefined {
  return save.items.find((i) => i.id === id) ?? Object.values(save.equipped).find((i) => i?.id === id);
}

export function equippedSlotOf(id: number): Slot | undefined {
  return (Object.keys(save.equipped) as Slot[]).find((s) => save.equipped[s]?.id === id);
}

export function removeFromBag(id: number): void {
  save.items = save.items.filter((i) => i.id !== id);
  persist();
}

// Sells a bag item for the given price.
export function sell(id: number, price: number): void {
  if (!save.items.some((i) => i.id === id)) return;
  removeFromBag(id);
  addGold(price);
}

// Sells every bag item matching `filter`, each at its own price. Returns how many were sold and for how much.
export function sellAll(filter: (item: Item) => boolean, priceOf: (item: Item) => number): { count: number; total: number } {
  const sold = save.items.filter(filter);
  const total = sold.reduce((sum, i) => sum + priceOf(i), 0);
  save.items = save.items.filter((i) => !filter(i));
  addGold(total);
  return { count: sold.length, total };
}

// Equips an item from the bag; whatever was in that slot goes back to the bag.
export function equip(id: number): void {
  const item = save.items.find((i) => i.id === id);
  if (!item) return;
  const slots = SLOTS_FOR_TYPE[item.type];
  if (!slots) return; // trade goods can't be equipped
  const slot = slots.find((s) => !save.equipped[s]) ?? slots[0]; // e.g. the free ring slot
  const previous = save.equipped[slot];
  save.items = save.items.filter((i) => i.id !== id);
  if (previous) save.items.push(previous);
  save.equipped[slot] = item;
  persist();
}

// Moves an equipped item back to the bag (if there is room).
export function unequip(slot: Slot): boolean {
  const item = save.equipped[slot];
  if (!item || isFull()) return false;
  delete save.equipped[slot];
  save.items.push(item);
  persist();
  return true;
}

export function equippedItems(): Item[] {
  return Object.values(save.equipped).filter((i): i is Item => i !== undefined);
}

// Combined stats and traits of everything the blacksmith wears.
export function gearStats(): Stats & { traits: TraitId[] } {
  const total = { attack: 0, defense: 0, hp: 0, traits: [] as TraitId[] };
  for (const item of equippedItems()) {
    const s = itemStats(item);
    total.attack += s.attack;
    total.defense += s.defense;
    total.hp += s.hp;
    if (item.trait) total.traits.push(item.trait);
  }
  return total;
}

// Wears down equipped weapons and armor (dungeon fights). Sturdy items are unaffected.
export function wearEquipment(amount: number): void {
  for (const item of equippedItems()) {
    if (usesDurability(item.type) && item.trait !== "sturdy") item.durability = Math.max(0, item.durability - amount);
  }
  persist();
}

// ---- Gold and materials ----

export function addGold(amount: number): void {
  save.gold += amount;
  persist();
}

export function spendGold(amount: number): boolean {
  if (save.gold < amount) return false;
  save.gold -= amount;
  persist();
  return true;
}

export function materialCount(id: MaterialId): number {
  return save.materials[id] ?? 0;
}

export function addMaterial(id: MaterialId, amount: number): void {
  save.materials[id] = materialCount(id) + amount;
  persist();
}

export function spendMaterial(id: MaterialId, amount: number): boolean {
  if (materialCount(id) < amount) return false;
  save.materials[id] = materialCount(id) - amount;
  persist();
  return true;
}
