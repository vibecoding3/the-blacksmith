// Everything the player can forge: stats, and the shape drawn as the strike bar.
// Positions along the bar run 0..1; the marker and golden zone stay within the
// workable part of the item (the part that actually gets hammered).

import type { ItemType } from "./items";

export const BAR = { x: 150, y: 400, w: 500, h: 28 };
const CY = BAR.y + BAR.h / 2;

export interface ForgeItem {
  type: ItemType;
  label: string;
  note: string; // short description shown in the item picker
  hits: number; // hits in the golden zone needed to finish the item
  heats: number; // heat cycles: the hits are split across this many heats
  valueMult: number; // value relative to a sword
  coolMult: number; // how fast it loses heat relative to a sword (thin items cool faster)
  workStart: number;
  workEnd: number;
  body: Path2D; // the part that gets hammered; the golden zone is clipped to it
  drawFittings(ctx: CanvasRenderingContext2D): void; // parts that are not forged, such as a hilt
}

type Stats = Pick<ForgeItem, "type" | "label" | "note" | "hits" | "heats" | "valueMult" | "coolMult">;

const toBar = (x: number) => (x - BAR.x) / BAR.w;

const WOOD = "#6b4423";
const BRASS = "#c9a227";

// Blades (dagger, sword, greatsword): pommel, grip, crossguard, then a pointed blade, centred on the bar.
function bladed(stats: Stats, g: { grip: number; blade: number; tip: number; half: number; guard: number }): ForgeItem {
  const length = 9 + 6 + g.grip + 12 + g.blade + g.tip;
  const pommelX = BAR.x + BAR.w / 2 - length / 2 + 9;
  const gripX = pommelX + 6;
  const guardX = gripX + g.grip;
  const bladeX = guardX + 12;
  const tipX = bladeX + g.blade;
  const body = new Path2D();
  body.moveTo(bladeX, CY - g.half);
  body.lineTo(tipX, CY - g.half);
  body.lineTo(tipX + g.tip, CY);
  body.lineTo(tipX, CY + g.half);
  body.lineTo(bladeX, CY + g.half);
  body.closePath();
  return {
    ...stats,
    workStart: toBar(bladeX),
    workEnd: toBar(tipX),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = WOOD;
      ctx.fillRect(gripX, CY - 7, g.grip, 14);
      ctx.fillStyle = BRASS;
      ctx.fillRect(guardX, CY - g.guard, 12, g.guard * 2);
      ctx.beginPath();
      ctx.arc(pommelX, CY, 9, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

const SWORD = bladed(
  { type: "sword", label: "Sword", note: "Balanced all-rounder", hits: 5, heats: 2, valueMult: 1, coolMult: 1 },
  { grip: 40, blade: 393, tip: 40, half: 14, guard: 26 },
);

const DAGGER = bladed(
  { type: "dagger", label: "Dagger", note: "Thin blade: cools fast", hits: 3, heats: 1, valueMult: 0.5, coolMult: 1.5 },
  { grip: 30, blade: 200, tip: 40, half: 11, guard: 20 },
);

const GREATSWORD = bladed(
  { type: "greatsword", label: "Greatsword", note: "Huge blade over three heats", hits: 8, heats: 3, valueMult: 2, coolMult: 1 },
  { grip: 70, blade: 350, tip: 40, half: 18, guard: 32 },
);

// Axe: a long handle with a wide head at the end; only the head is forged.
const AXE: ForgeItem = (() => {
  const headX = 520;
  const edgeX = 640;
  const body = new Path2D();
  body.moveTo(headX, CY - 14);
  body.lineTo(600, BAR.y - 18);
  body.quadraticCurveTo(edgeX + 12, CY, 600, BAR.y + BAR.h + 18);
  body.lineTo(headX, CY + 14);
  body.closePath();
  return {
    type: "axe", label: "Axe", note: "Only the head is forged", hits: 6, heats: 2, valueMult: 1.3, coolMult: 1,
    workStart: toBar(headX + 4),
    workEnd: toBar(edgeX),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = WOOD;
      ctx.fillRect(BAR.x, CY - 6, headX - BAR.x + 10, 12);
    },
  };
})();

// Spear: a long wooden pole with a small leaf-shaped tip; only the tip is forged.
const SPEAR: ForgeItem = (() => {
  const tipStart = 545;
  const tipEnd = BAR.x + BAR.w;
  const body = new Path2D();
  body.moveTo(tipStart, CY);
  body.quadraticCurveTo(580, BAR.y - 8, tipEnd, CY);
  body.quadraticCurveTo(580, BAR.y + BAR.h + 8, tipStart, CY);
  body.closePath();
  return {
    type: "spear", label: "Spear", note: "Tiny forging area, few hits", hits: 4, heats: 1, valueMult: 0.9, coolMult: 1,
    workStart: toBar(tipStart + 8),
    workEnd: toBar(tipEnd - 8),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = WOOD;
      ctx.fillRect(BAR.x, CY - 5, tipStart - BAR.x + 6, 10);
      ctx.fillStyle = BRASS;
      ctx.fillRect(tipStart - 14, CY - 8, 10, 16); // socket ring
    },
  };
})();

// Helmet: a dome seen from the side, with a small brim.
const HELMET: ForgeItem = (() => {
  const left = 220;
  const right = 580;
  const body = new Path2D();
  body.moveTo(left, BAR.y + BAR.h);
  body.ellipse((left + right) / 2, BAR.y + BAR.h, (right - left) / 2, 46, 0, Math.PI, Math.PI * 2);
  body.closePath();
  return {
    type: "helmet", label: "Helmet", note: "Armor for the head", hits: 6, heats: 2, valueMult: 1.2, coolMult: 1,
    workStart: toBar(left + 30),
    workEnd: toBar(right - 30),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = "#3a3a42";
      ctx.fillRect(left - 20, BAR.y + BAR.h, right - left + 40, 8); // brim
    },
  };
})();

// Shield: a round shield seen at an angle, with a wooden backing.
const SHIELD: ForgeItem = (() => {
  const rx = 200;
  const body = new Path2D();
  body.ellipse(BAR.x + BAR.w / 2, CY, rx, 34, 0, 0, Math.PI * 2);
  return {
    type: "shield", label: "Shield", note: "Thick metal: holds heat", hits: 7, heats: 2, valueMult: 1.4, coolMult: 0.7,
    workStart: toBar(BAR.x + BAR.w / 2 - rx + 30),
    workEnd: toBar(BAR.x + BAR.w / 2 + rx - 30),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = WOOD;
      ctx.beginPath();
      ctx.ellipse(BAR.x + BAR.w / 2, CY + 6, rx + 6, 36, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  };
})();

// Chestplate: a wide breastplate seen from the front.
const CHESTPLATE: ForgeItem = (() => {
  const body = new Path2D();
  body.moveTo(190, BAR.y - 10);
  body.lineTo(320, BAR.y - 18);
  body.quadraticCurveTo(400, BAR.y + 2, 480, BAR.y - 18); // neck opening
  body.lineTo(610, BAR.y - 10);
  body.lineTo(590, BAR.y + 18);
  body.lineTo(560, BAR.y + BAR.h + 20);
  body.lineTo(240, BAR.y + BAR.h + 20);
  body.lineTo(210, BAR.y + 18);
  body.closePath();
  return {
    type: "chestplate", label: "Chestplate", note: "Biggest piece: armor for the chest", hits: 9, heats: 3, valueMult: 2.5, coolMult: 0.75,
    workStart: toBar(215),
    workEnd: toBar(585),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = "#6b4423"; // leather straps at the shoulders
      ctx.fillRect(250, BAR.y - 26, 20, 14);
      ctx.fillRect(530, BAR.y - 26, 20, 14);
    },
  };
})();

// Horseshoe: a thick U, opening to the right.
const HORSESHOE: ForgeItem = (() => {
  const cx = 400;
  const armEnd = 580;
  const outer = { rx: 150, ry: 34 };
  const inner = { rx: 126, ry: 18 };
  const body = new Path2D();
  body.moveTo(armEnd, CY - outer.ry);
  body.lineTo(cx, CY - outer.ry);
  body.ellipse(cx, CY, outer.rx, outer.ry, 0, -Math.PI / 2, Math.PI / 2, true);
  body.lineTo(armEnd, CY + outer.ry);
  body.lineTo(armEnd, CY + inner.ry);
  body.lineTo(cx, CY + inner.ry);
  body.ellipse(cx, CY, inner.rx, inner.ry, 0, Math.PI / 2, -Math.PI / 2, false);
  body.lineTo(armEnd, CY - inner.ry);
  body.closePath();
  return {
    type: "horseshoe", label: "Horseshoe", note: "Quick trade good", hits: 2, heats: 1, valueMult: 0.25, coolMult: 1.2,
    workStart: toBar(cx - outer.rx + 12),
    workEnd: toBar(armEnd - 8),
    body,
    drawFittings() {},
  };
})();

// Nails: one long nail standing for the bundle; the head is already formed.
const NAILS: ForgeItem = (() => {
  const shaftX = 222;
  const pointX = 560;
  const body = new Path2D();
  body.moveTo(shaftX, CY - 6);
  body.lineTo(pointX, CY - 6);
  body.lineTo(pointX + 40, CY);
  body.lineTo(pointX, CY + 6);
  body.lineTo(shaftX, CY + 6);
  body.closePath();
  return {
    type: "nails", label: "Nails", note: "One hit, very cheap", hits: 1, heats: 1, valueMult: 0.1, coolMult: 1.5,
    workStart: toBar(shaftX + 4),
    workEnd: toBar(pointX),
    body,
    drawFittings(ctx) {
      ctx.fillStyle = "#3a3a42";
      ctx.fillRect(shaftX - 12, CY - 17, 12, 34); // head
    },
  };
})();

// Order of the item picker (keys 1-9, then 0).
export const FORGE_ITEMS: ForgeItem[] = [SWORD, DAGGER, AXE, SPEAR, GREATSWORD, HELMET, SHIELD, CHESTPLATE, HORSESHOE, NAILS];
