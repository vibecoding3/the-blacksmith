// Customer orders: deliver a matching item from the bag for a bonus reward (gold and XP).

import { sfx } from "../audio";
import { forgeItemFor } from "../forgeItems";
import { drawItemIcon } from "../icons";
import { itemName } from "../items";
import { REROLL_COST, deliver, matchingItem } from "../market";
import { METALS, type MetalId } from "../metals";
import { save } from "../save";
import { app, ctx, drawButton, drawPanel, drawText, drawTitle, inRect, type Point, type Rect } from "../ui";

const cardRect = (i: number): Rect => ({ x: 40, y: 90 + i * 118, w: 720, h: 106 });
const deliverRect = (i: number): Rect => ({ x: 610, y: cardRect(i).y + 36, w: 130, h: 36 });
const REROLL_BTN: Rect = { x: 560, y: 34, w: 200, h: 34 };

type Hit = { kind: "deliver"; index: number } | { kind: "reroll" };

function hit(p: Point): Hit | null {
  for (let i = 0; i < save.orders.length; i++) {
    if (inRect(p, deliverRect(i)) && matchingItem(save.orders[i])) return { kind: "deliver", index: i };
  }
  if (inRect(p, REROLL_BTN) && save.gold >= REROLL_COST) return { kind: "reroll" };
  return null;
}

export function ordersHover(p: Point): boolean {
  return hit(p) !== null;
}

export function ordersClick(p: Point, reroll: () => void): void {
  const h = hit(p);
  app.notice = "";
  if (h?.kind === "deliver") {
    const order = save.orders[h.index];
    const item = matchingItem(order);
    const done = deliver(order.id);
    if (done && item) {
      app.notice = `${done.customer} paid ${done.reward}g and you gained ${done.xp} XP for your ${itemName(item)}.`;
      sfx.coin();
    }
  } else if (h?.kind === "reroll") {
    reroll();
  }
}

export function drawOrders(): void {
  drawTitle("Orders");
  drawButton(REROLL_BTN, `New orders (${REROLL_COST}g)`, save.gold >= REROLL_COST, 14);
  drawText("Customers pay well above market price. New orders arrive each day.", 40, 82, 13, "#b8a888", "left");

  save.orders.forEach((order, i) => {
    const r = cardRect(i);
    drawPanel(r);
    const f = forgeItemFor(order.type);
    const metal = METALS[order.metal as MetalId];
    // Icon
    ctx.beginPath();
    ctx.roundRect(r.x + 16, r.y + 18, 70, 70, 8);
    ctx.fillStyle = "#1a1210";
    ctx.fill();
    drawItemIcon(ctx, order.type, false, r.x + 21, r.y + 23, 60, metal.color);
    // Text
    drawText(order.customer, r.x + 104, r.y + 32, 18, "#e0a030", "left");
    drawText(`Wants: ${metal.label} ${f.label}, worth at least ${order.minValue}g`, r.x + 104, r.y + 58, 15, "#f5e6c8", "left");
    drawText(`Reward: ${order.reward}g + ${order.xp} XP`, r.x + 104, r.y + 82, 14, "#ffd700", "left");
    const match = matchingItem(order);
    drawButton(deliverRect(i), match ? "Deliver" : "Not in bag", match !== undefined, 15);
    if (match) drawText(`Uses: ${itemName(match)} (${match.value}g)`, r.x + r.w - 14, deliverRect(i).y + 54, 10, "#9fd86a", "right");
  });

  if (app.notice) drawText(app.notice, 400, 476, 13, "#9fd86a");
}
