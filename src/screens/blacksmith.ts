// Blacksmith: level and XP, perks bought with level points, a summary of all bonuses,
// and save / sound settings.

import { sfx, toggleMute } from "../audio";
import { playerAttack, playerDefense, playerMaxHp } from "../dungeons";
import { forgeItemFor } from "../forgeItems";
import { isFull } from "../items";
import {
  PERKS, buyPerk, inventorySize, legendaryChance, levelInfo, maxEnergy, perkPoints, perkRank, roundTime, sellMult,
} from "../progression";
import { SAVE_VERSION, exportSave, importSave, save } from "../save";
import { app, ctx, drawButton, drawMeter, drawPanel, drawText, drawTitle, inRect, type Point, type Rect } from "../ui";

const INFO_PANEL: Rect = { x: 40, y: 95, w: 300, h: 385 };
const PERK_PANEL: Rect = { x: 355, y: 95, w: 405, h: 300 };
const SAVE_PANEL: Rect = { x: 355, y: 405, w: 405, h: 75 };
const perkRow = (i: number) => PERK_PANEL.y + 58 + i * 40;
const perkBtn = (i: number): Rect => ({ x: PERK_PANEL.x + PERK_PANEL.w - 54, y: perkRow(i) - 18, w: 40, h: 28 });
const EXPORT_BTN: Rect = { x: SAVE_PANEL.x + 14, y: SAVE_PANEL.y + 32, w: 118, h: 30 };
const IMPORT_BTN: Rect = { x: SAVE_PANEL.x + 142, y: SAVE_PANEL.y + 32, w: 118, h: 30 };
const SOUND_BTN: Rect = { x: SAVE_PANEL.x + 270, y: SAVE_PANEL.y + 32, w: 120, h: 30 };

type Hit = { kind: "perk"; index: number } | { kind: "export" } | { kind: "import" } | { kind: "sound" };

function hit(p: Point): Hit | null {
  for (let i = 0; i < PERKS.length; i++) {
    if (inRect(p, perkBtn(i)) && perkPoints() > 0 && perkRank(PERKS[i].id) < PERKS[i].max) return { kind: "perk", index: i };
  }
  if (inRect(p, EXPORT_BTN)) return { kind: "export" };
  if (inRect(p, IMPORT_BTN)) return { kind: "import" };
  if (inRect(p, SOUND_BTN)) return { kind: "sound" };
  return null;
}

export function blacksmithHover(p: Point): boolean {
  return hit(p) !== null;
}

export function blacksmithClick(p: Point): void {
  const h = hit(p);
  if (!h) return;
  app.notice = "";
  if (h.kind === "perk") {
    if (buyPerk(PERKS[h.index].id)) sfx.levelUp();
  } else if (h.kind === "export") {
    exportSave();
    app.notice = "Save downloaded. Keep the file as a backup.";
  } else if (h.kind === "import") {
    importSave((message, ok) => {
      app.notice = message;
      if (ok) sfx.done();
      else sfx.error();
    });
  } else {
    toggleMute();
    sfx.click();
  }
}

export function drawBlacksmith(): void {
  drawTitle("Blacksmith");
  const { level, into, needed } = levelInfo();

  drawPanel(INFO_PANEL);
  const x = INFO_PANEL.x + 18;
  drawText(`Level ${level}`, x, 130, 24, "#e0a030", "left");
  drawMeter({ x, y: 142, w: INFO_PANEL.w - 36, h: 12 }, into / needed, "#9fe3ff");
  drawText(`${into} / ${needed} XP to level ${level + 1}`, x, 172, 12, "#b8a888", "left");
  const rows: [string, string][] = [
    ["HP", `${playerMaxHp()}`],
    ["Attack", `${playerAttack()}`],
    ["Defense", `${playerDefense()}`],
    ["Legendary chance", `${Math.round(legendaryChance() * 100)}%`],
    ["Max energy", `${maxEnergy()}`],
    ["Round length", `${roundTime()} s`],
    ["Sale prices", `+${Math.round((sellMult() - 1) * 100)}%`],
    ["Inventory", `${save.items.length}/${inventorySize()}${isFull() ? " (full)" : ""}`],
    ["Days worked", `${save.day - 1}`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 204 + i * 24;
    drawText(label, x, y, 14, "#f5e6c8", "left");
    drawText(value, INFO_PANEL.x + INFO_PANEL.w - 18, y, 14, "#ffd700", "right");
  });
  const bp = save.blueprints.map((t) => forgeItemFor(t).label);
  drawText(bp.length ? `Blueprints: ${bp.join(", ")}` : "No blueprints found yet", x, 432, 12, bp.length ? "#ff9f1c" : "#8a7a68", "left");
  drawText("Dungeon bosses can drop blueprints.", x, 452, 11, "#8a7a68", "left");

  drawPanel(PERK_PANEL);
  drawText("Perks", PERK_PANEL.x + 16, PERK_PANEL.y + 28, 20, "#e0a030", "left");
  const points = perkPoints();
  drawText(points > 0 ? `${points} point${points === 1 ? "" : "s"} to spend` : "Earn points by levelling up", PERK_PANEL.x + PERK_PANEL.w - 16, PERK_PANEL.y + 28, 13,
    points > 0 ? "#9fd86a" : "#8a7a68", "right");
  PERKS.forEach((perk, i) => {
    const y = perkRow(i);
    const rank = perkRank(perk.id);
    drawText(perk.label, PERK_PANEL.x + 16, y - 4, 15, "#f5e6c8", "left");
    drawText(`${perk.desc} per rank`, PERK_PANEL.x + 16, y + 12, 11, "#b8a888", "left");
    // Rank pips, right-aligned next to the + button
    const pipsX = perkBtn(i).x - 12 - perk.max * 13;
    for (let k = 0; k < perk.max; k++) {
      ctx.beginPath();
      ctx.arc(pipsX + k * 13 + 6, y - 9, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = k < rank ? "#e0a030" : "#3a2a22";
      ctx.fill();
    }
    drawButton(perkBtn(i), "+", points > 0 && rank < perk.max, 18);
  });

  drawPanel(SAVE_PANEL);
  drawText(`Save (format v${SAVE_VERSION}) and sound`, SAVE_PANEL.x + 14, SAVE_PANEL.y + 22, 14, "#e0a030", "left");
  drawButton(EXPORT_BTN, "Export save", true, 13);
  drawButton(IMPORT_BTN, "Import save", true, 13);
  drawButton(SOUND_BTN, save.muted ? "Sound: off" : "Sound: on", true, 13);
  if (app.notice) drawText(app.notice, 550, 495, 12, "#9fd86a");
}
