// Trade Market: buy ore and gems on the left, sell items from the bag on the right at today's prices.

import { sfx } from "../audio";
import { drawMaterialIcon } from "../icons";
import { addMaterial, itemName, materialCount, sell, sellAll, spendGold, type Item } from "../items";
import { itemTypeLabel, salePrice } from "../market";
import { GEMS, GEM_IDS, METALS, METAL_IDS, type MaterialId } from "../metals";
import { save } from "../save";
import { W, app, ctx, drawButton, drawPanel, drawText, drawTitle, inRect, type Point, type Rect } from "../ui";
import { DETAILS, bag, cellHit, drawBag, drawDetails, drawEmptyDetails, drawTooltip, hoveredBagItem } from "./bag";

const SIDE_PANEL: Rect = { x: 40, y: 95, w: 240, h: 385 };
const SELL_BTN: Rect = { x: DETAILS.x + DETAILS.w - 98, y: DETAILS.y + 10, w: 88, h: 30 };
const SELL_ALL_BTN: Rect = { x: 60, y: 428, w: 200, h: 38 };
const MATERIALS: MaterialId[] = [...METAL_IDS, ...GEM_IDS];
const ROW_Y = 142;
const ROW_H = 30;

const priceOf = (id: MaterialId) => (id in METALS ? METALS[id as keyof typeof METALS].price : GEMS[id as keyof typeof GEMS].price);
const buyRect = (row: number, amount: 1 | 5): Rect => ({ x: amount === 1 ? 204 : 240, y: ROW_Y + row * ROW_H - 12, w: 32, h: 22 });

const isNormal = (i: Item) => i.tier === "normal";

type Hit = { kind: "cell"; index: number } | { kind: "sell" } | { kind: "sellAll" } | { kind: "buy"; id: MaterialId; amount: number };

function hit(p: Point): Hit | null {
  const index = cellHit(p);
  if (index >= 0) return { kind: "cell", index };
  if (bag.selectedId !== null && save.items.some((i) => i.id === bag.selectedId) && inRect(p, SELL_BTN)) return { kind: "sell" };
  if (save.items.some(isNormal) && inRect(p, SELL_ALL_BTN)) return { kind: "sellAll" };
  for (let row = 0; row < MATERIALS.length; row++) {
    for (const amount of [1, 5] as const) {
      if (inRect(p, buyRect(row, amount)) && save.gold >= priceOf(MATERIALS[row]) * amount) return { kind: "buy", id: MATERIALS[row], amount };
    }
  }
  return null;
}

export function marketHover(p: Point): boolean {
  return hit(p) !== null;
}

export function marketClick(p: Point): void {
  const h = hit(p);
  app.notice = "";
  if (!h) {
    bag.selectedId = null;
  } else if (h.kind === "cell") {
    bag.selectedId = save.items[h.index]?.id ?? null;
  } else if (h.kind === "sell" && bag.selectedId !== null) {
    const item = save.items.find((i) => i.id === bag.selectedId);
    if (item) {
      const price = salePrice(item);
      sell(item.id, price);
      app.notice = `Sold ${itemName(item)} for ${price}g.`;
      sfx.coin();
    }
    bag.selectedId = null;
  } else if (h.kind === "sellAll") {
    const { count, total } = sellAll(isNormal, salePrice);
    app.notice = `Sold ${count} normal item${count === 1 ? "" : "s"} for ${total}g.`;
    sfx.coin();
    bag.selectedId = null;
  } else if (h.kind === "buy") {
    if (spendGold(priceOf(h.id) * h.amount)) {
      addMaterial(h.id, h.amount);
      sfx.coin();
    }
  }
}

function demandText(): string {
  const entries = Object.entries(save.demand) as [Item["type"], number][];
  const up = entries.filter(([, m]) => m > 1).map(([t, m]) => `${itemTypeLabel(t)} +${Math.round((m - 1) * 100)}%`);
  const down = entries.filter(([, m]) => m < 1).map(([t, m]) => `${itemTypeLabel(t)} −${Math.round((1 - m) * 100)}%`);
  return [up.length ? `Wanted: ${up.join(", ")}` : "", down.length ? `Unwanted: ${down.join(", ")}` : ""].filter(Boolean).join("  ·  ");
}

function priceLabel(item: Item): string {
  const price = salePrice(item);
  return price === item.value ? `sells for ${price}g` : `sells for ${price}g today (base ${item.value}g)`;
}

export function drawMarket(): void {
  drawTitle("Trade Market");
  drawText(`Day ${save.day} prices`, W - 20, 36, 15, "#e0a030", "right");
  drawText(demandText(), W - 20, 56, 12, "#b8a888", "right");

  // Materials for sale
  drawPanel(SIDE_PANEL);
  drawText("Buy materials", SIDE_PANEL.x + SIDE_PANEL.w / 2, SIDE_PANEL.y + 26, 18, "#e0a030");
  MATERIALS.forEach((id, row) => {
    const y = ROW_Y + row * ROW_H;
    const name = id in METALS ? METALS[id as keyof typeof METALS].label : GEMS[id as keyof typeof GEMS].label;
    drawMaterialIcon(ctx, id, 50, y - 13, 20);
    drawText(name, 74, y - 1, 12, "#f5e6c8", "left");
    drawText(`x${materialCount(id)}`, 74, y + 11, 9, "#8a7a68", "left");
    drawText(`${priceOf(id)}g`, 198, y + 4, 11, "#ffd700", "right");
    for (const amount of [1, 5] as const) drawButton(buyRect(row, amount), `+${amount}`, save.gold >= priceOf(id) * amount, 11);
  });

  const normals = save.items.filter(isNormal);
  const normalValue = normals.reduce((sum, i) => sum + salePrice(i), 0);
  drawButton(SELL_ALL_BTN, normals.length ? `Sell all normal (${normalValue}g)` : "No normal items", normals.length > 0, 14);

  drawBag();
  const selected = drawDetails(priceLabel);
  if (selected) drawButton(SELL_BTN, `Sell ${salePrice(selected)}g`, true, 14);
  else drawEmptyDetails("Select an item to sell it.", "Equipped items can't be sold: unequip them in the Inventory.");
  drawTooltip(hoveredBagItem(), (i) => `Sells today for ${salePrice(i)}g`);
}
