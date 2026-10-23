// The bag grid, item details panel and hover tooltip shared by the Inventory and Trade Market.

import { drawItemIconFor } from "../icons";
import {
  DESCRIPTIONS, LEGENDARY_COLOR, MAX_DURABILITY, TRAITS, equipKind, findItem, isBroken, itemName, itemStats,
  usesDurability, type Item,
} from "../items";
import { inventorySize } from "../progression";
import { save } from "../save";
import { H, W, app, ctx, drawPanel, drawText, inRect, input, textWidth, type Point, type Rect } from "../ui";

export const bag = { selectedId: null as number | null };

const GRID_X = 310;
const GRID_Y = 95;
export const DETAILS: Rect = { x: 310, y: 395, w: 434, h: 85 };

// 24 slots fit a 6-wide grid of large cells; a bigger bag (Storage Chest upgrade) uses 8 smaller columns.
function gridLayout(): { cols: number; cell: number; gap: number } {
  return inventorySize() <= 24 ? { cols: 6, cell: 64, gap: 10 } : { cols: 8, cell: 48, gap: 6 };
}

export function cellRect(i: number): Rect {
  const { cols, cell, gap } = gridLayout();
  return { x: GRID_X + (i % cols) * (cell + gap), y: GRID_Y + Math.floor(i / cols) * (cell + gap), w: cell, h: cell };
}

export function cellHit(p: Point): number {
  for (let i = 0; i < inventorySize(); i++) if (inRect(p, cellRect(i))) return i;
  return -1;
}

export function hoveredBagItem(): Item | undefined {
  const i = cellHit(input.pointer);
  return i >= 0 ? save.items[i] : undefined;
}

export function selectedItem(): Item | undefined {
  return bag.selectedId !== null ? findItem(bag.selectedId) : undefined;
}

export function drawCell(r: Rect, item: Item | undefined, label?: string): void {
  const selected = item !== undefined && item.id === bag.selectedId;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = inRect(input.pointer, r) && item ? "#3a2a22" : "#1a1210";
  ctx.fill();
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? "#ffe080" : item?.tier === "legendary" ? LEGENDARY_COLOR : "#5a4030";
  ctx.stroke();
  if (item) {
    drawItemIconFor(ctx, item, r.x + 4, r.y + 4, r.w - 8);
    // Durability bar along the bottom once the item is worn
    if (usesDurability(item.type) && item.durability < MAX_DURABILITY) {
      const f = item.durability / MAX_DURABILITY;
      ctx.fillStyle = "#2a1c18";
      ctx.fillRect(r.x + 5, r.y + r.h - 7, r.w - 10, 3);
      ctx.fillStyle = f > 0.5 ? "#9fd86a" : f > 0.2 ? "#ffb347" : "#ff6040";
      ctx.fillRect(r.x + 5, r.y + r.h - 7, (r.w - 10) * f, 3);
    }
  } else if (label) {
    drawText(label, r.x + r.w / 2, r.y + r.h / 2 + 4, 11, "#5a4030");
  }
}

export function drawBag(): void {
  drawText(`Items ${save.items.length}/${inventorySize()}`, GRID_X, GRID_Y - 14, 18, "#e0a030", "left");
  for (let i = 0; i < inventorySize(); i++) drawCell(cellRect(i), save.items[i]);
  if (save.items.length === 0) drawText("No items yet. Forge something!", GRID_X + 217, GRID_Y + 145, 18, "#b8a888");
}

// "Attack 12" / "Defense 5" / "HP +20" for an item (empty for trade goods).
export function statsText(item: Item): string {
  const s = itemStats(item);
  const parts = [];
  if (s.attack) parts.push(`Attack ${s.attack}`);
  if (s.defense) parts.push(`Defense ${s.defense}`);
  if (s.hp) parts.push(`HP +${s.hp}`);
  return parts.join(" · ");
}

// Draws the details panel for the selected item (if any) plus any notice; returns that item.
export function drawDetails(priceLabel: (item: Item) => string): Item | undefined {
  drawPanel(DETAILS);
  if (app.notice) drawText(app.notice, DETAILS.x + DETAILS.w / 2, DETAILS.y + DETAILS.h + 15, 13, "#ffb347");
  const selected = selectedItem();
  if (selected) {
    const legendary = selected.tier === "legendary";
    drawText(itemName(selected), DETAILS.x + 14, DETAILS.y + 28, 17, legendary ? LEGENDARY_COLOR : "#f5e6c8", "left");
    const stats = statsText(selected);
    const line = [legendary ? "★ Legendary" : "Normal", equipKind(selected.type), stats, priceLabel(selected)].filter(Boolean).join(" · ");
    drawText(line, DETAILS.x + 14, DETAILS.y + 52, 12, "#b8a888", "left");
    if (usesDurability(selected.type)) {
      const broken = isBroken(selected);
      drawText(`Durability ${selected.durability}/${MAX_DURABILITY}${broken ? " (broken: half strength)" : ""}`, DETAILS.x + 14, DETAILS.y + 72, 12,
        broken ? "#ff6040" : selected.durability < 50 ? "#ffb347" : "#8a7a68", "left");
    }
  }
  return selected;
}

export function drawEmptyDetails(line1: string, line2: string): void {
  drawText(line1, DETAILS.x + 16, DETAILS.y + 36, 16, "#b8a888", "left");
  drawText(line2, DETAILS.x + 16, DETAILS.y + 60, 13, "#8a7a68", "left");
}

// A small box next to the pointer with the item's name, stats, trait, description and price.
export function drawTooltip(it: Item | undefined, priceLine: (item: Item) => string): void {
  if (!it || app.helpOpen) return;
  const legendary = it.tier === "legendary";
  const lines: { text: string; size: number; color: string }[] = [
    { text: itemName(it), size: 16, color: legendary ? LEGENDARY_COLOR : "#f5e6c8" },
    { text: `${legendary ? "★ Legendary" : "Normal"} · ${equipKind(it.type)}`, size: 12, color: "#b8a888" },
  ];
  const stats = statsText(it);
  if (stats) lines.push({ text: stats, size: 14, color: "#9fe3ff" });
  if (it.trait) lines.push({ text: `${TRAITS[it.trait].label}: ${TRAITS[it.trait].desc}`, size: 13, color: LEGENDARY_COLOR });
  const bonuses = [`Quality ${Math.round(it.quality * 100)}%`];
  if (it.temper) bonuses.push(it.temper > 0 ? "Well quenched" : "Quench cracks");
  if (it.edge) bonuses.push(it.edge > 0 ? "Fine finish" : "Overdone finish");
  lines.push({ text: bonuses.join(" · "), size: 12, color: "#b8a888" });
  if (usesDurability(it.type)) {
    lines.push({ text: `Durability ${it.durability}/${MAX_DURABILITY}`, size: 12, color: isBroken(it) ? "#ff6040" : "#b8a888" });
  }
  lines.push({ text: DESCRIPTIONS[it.type], size: 13, color: "#f5e6c8" });
  lines.push({ text: priceLine(it), size: 13, color: "#ffd700" });

  const pad = 10;
  const lineGap = 5;
  const w = pad * 2 + Math.max(...lines.map((l) => textWidth(l.text, l.size)));
  const h = pad * 2 + lines.reduce((sum, l) => sum + l.size + lineGap, -lineGap);
  // Below-right of the pointer, flipped to stay inside the layout area
  const p = input.pointer;
  let x = p.x + 14;
  let y = p.y + 18;
  if (x + w > W - 4) x = p.x - 14 - w;
  if (y + h > H - 4) y = Math.max(4, p.y - 10 - h);

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fillStyle = "rgba(20,13,11,0.96)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = legendary ? LEGENDARY_COLOR : "#e0a030";
  ctx.stroke();
  let ty = y + pad;
  for (const l of lines) {
    ty += l.size;
    drawText(l.text, x + pad, ty - 2, l.size, l.color, "left");
    ty += lineGap;
  }
}
