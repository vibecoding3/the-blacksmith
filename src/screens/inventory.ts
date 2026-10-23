// Inventory: equipment slots on the left, the bag on the right. Select an item to equip,
// unequip or repair it (repairs happen at the forge).

import { sfx } from "../audio";
import { startRepair } from "../forge";
import {
  MAX_DURABILITY, SLOT_LABELS, canEquipType, equip, equippedSlotOf, findItem, unequip, usesDurability, type Slot,
} from "../items";
import { save } from "../save";
import { app, drawButton, drawPanel, drawText, drawTitle, inRect, input, type Point, type Rect } from "../ui";
import { DETAILS, bag, cellHit, drawBag, drawCell, drawDetails, drawEmptyDetails, drawTooltip, hoveredBagItem } from "./bag";

const SIDE_PANEL: Rect = { x: 40, y: 95, w: 240, h: 385 };
// Equipment slots in three columns: armor on the left, jewelry on the right, and the
// weapon and off-hand at the bottom of the centre column, between the two.
const slotAt = (col: number, row: number): Rect => ({ x: 54 + col * 78, y: 164 + row * 80, w: 56, h: 56 });
const SLOT_RECTS: Record<Slot, Rect> = {
  head: slotAt(0, 0), chest: slotAt(0, 1), legs: slotAt(0, 2), feet: slotAt(0, 3),
  weapon: slotAt(1, 2), offhand: slotAt(1, 3),
  necklace: slotAt(2, 0), bracelet: slotAt(2, 1), ring1: slotAt(2, 2), ring2: slotAt(2, 3),
};
const EQUIP_BTN: Rect = { x: DETAILS.x + DETAILS.w - 98, y: DETAILS.y + 10, w: 88, h: 30 };
const REPAIR_BTN: Rect = { x: DETAILS.x + DETAILS.w - 98, y: DETAILS.y + 46, w: 88, h: 30 };

const SLOTS = Object.keys(SLOT_RECTS) as Slot[];

function canEquipOrUnequip(id: number): boolean {
  const it = findItem(id);
  return it !== undefined && (equippedSlotOf(id) !== undefined || canEquipType(it.type));
}

function canRepair(id: number): boolean {
  const it = findItem(id);
  return it !== undefined && usesDurability(it.type) && it.durability < MAX_DURABILITY;
}

type Hit = { kind: "cell"; index: number } | { kind: "slot"; slot: Slot } | { kind: "equip" } | { kind: "repair" };

function hit(p: Point): Hit | null {
  const index = cellHit(p);
  if (index >= 0) return { kind: "cell", index };
  const slot = SLOTS.find((s) => inRect(p, SLOT_RECTS[s]));
  if (slot) return { kind: "slot", slot };
  const id = bag.selectedId;
  if (id !== null && canEquipOrUnequip(id) && inRect(p, EQUIP_BTN)) return { kind: "equip" };
  if (id !== null && canRepair(id) && inRect(p, REPAIR_BTN)) return { kind: "repair" };
  return null;
}

export function inventoryHover(p: Point): boolean {
  return hit(p) !== null;
}

export function inventoryClick(p: Point): void {
  const h = hit(p);
  app.notice = "";
  if (!h) {
    bag.selectedId = null;
  } else if (h.kind === "cell") {
    bag.selectedId = save.items[h.index]?.id ?? null;
  } else if (h.kind === "slot") {
    bag.selectedId = save.equipped[h.slot]?.id ?? null;
  } else if (h.kind === "equip" && bag.selectedId !== null) {
    const slot = equippedSlotOf(bag.selectedId);
    if (slot) {
      if (!unequip(slot)) app.notice = "Your bag is full: sell something at the Trade Market first.";
    } else {
      equip(bag.selectedId);
    }
    sfx.click();
  } else if (h.kind === "repair" && bag.selectedId !== null) {
    const error = startRepair(bag.selectedId);
    if (error) {
      app.notice = error;
      sfx.error();
    } else {
      app.tab = "forge";
    }
  }
}

export function drawInventory(): void {
  drawTitle("Inventory");

  drawPanel(SIDE_PANEL);
  drawText("Equipment", SIDE_PANEL.x + SIDE_PANEL.w / 2, SIDE_PANEL.y + 32, 20, "#e0a030");
  for (const slot of SLOTS) {
    const r = SLOT_RECTS[slot];
    drawText(SLOT_LABELS[slot], r.x + r.w / 2, r.y - 8, 13, "#b8a888");
    drawCell(r, save.equipped[slot], "empty");
  }

  drawBag();
  const selected = drawDetails((i) => `worth ${i.value}g`);
  if (selected) {
    drawButton(EQUIP_BTN, equippedSlotOf(selected.id) ? "Unequip" : "Equip", canEquipOrUnequip(selected.id), 14);
    if (usesDurability(selected.type)) drawButton(REPAIR_BTN, "Repair", canRepair(selected.id), 14);
  } else {
    drawEmptyDetails("Select an item to equip or repair it.", "To sell items, visit the Trade Market.");
  }

  const slot = SLOTS.find((s) => inRect(input.pointer, SLOT_RECTS[s]));
  drawTooltip(slot ? save.equipped[slot] : hoveredBagItem(), (i) => `Worth ${i.value}g`);
}

