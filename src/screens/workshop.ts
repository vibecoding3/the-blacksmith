// Workshop: spend gold on permanent forge upgrades.

import { sfx } from "../audio";
import { UPGRADES, buyUpgrade, nextUpgradeCost, upgradeLevel } from "../progression";
import { save } from "../save";
import { app, ctx, drawButton, drawPanel, drawText, drawTitle, inRect, type Point, type Rect } from "../ui";

const cardRect = (i: number): Rect => ({ x: 40 + (i % 2) * 365, y: 95 + Math.floor(i / 2) * 125, w: 355, h: 113 });
const buyRect = (i: number): Rect => ({ x: cardRect(i).x + cardRect(i).w - 120, y: cardRect(i).y + 64, w: 106, h: 34 });

function hit(p: Point): number {
  return UPGRADES.findIndex((u, i) => {
    const cost = nextUpgradeCost(u.id);
    return inRect(p, buyRect(i)) && cost !== null && save.gold >= cost;
  });
}

export function workshopHover(p: Point): boolean {
  return hit(p) >= 0;
}

export function workshopClick(p: Point): void {
  const i = hit(p);
  if (i < 0) return;
  const u = UPGRADES[i];
  if (buyUpgrade(u.id)) {
    app.notice = `${u.label} upgraded to level ${upgradeLevel(u.id)}.`;
    sfx.coin();
  }
}

export function drawWorkshop(): void {
  drawTitle("Workshop");
  drawText("Permanent upgrades for your forge, paid in gold.", 40, 82, 13, "#b8a888", "left");
  UPGRADES.forEach((u, i) => {
    const r = cardRect(i);
    drawPanel(r);
    drawText(u.label, r.x + 16, r.y + 28, 18, "#e0a030", "left");
    drawText(u.desc, r.x + 16, r.y + 52, 13, "#f5e6c8", "left");
    // Level pips
    for (let k = 0; k < u.costs.length; k++) {
      ctx.beginPath();
      ctx.arc(r.x + 24 + k * 22, r.y + 82, 7, 0, Math.PI * 2);
      ctx.fillStyle = k < upgradeLevel(u.id) ? "#e0a030" : "#3a2a22";
      ctx.fill();
    }
    const cost = nextUpgradeCost(u.id);
    drawButton(buyRect(i), cost === null ? "Maxed" : `Buy ${cost}g`, cost !== null && save.gold >= cost, 14);
  });
  if (app.notice) drawText(app.notice, 400, 476, 13, "#9fd86a");
}
