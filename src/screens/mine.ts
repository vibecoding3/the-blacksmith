// Mine: click a reachable rock to swing the pickaxe. The whole wall is visible, but only rocks in
// the top row or next to a broken one can be dug, so you dig a path down to the rare ore.

import { sfx } from "../audio";
import { drawMaterialIcon } from "../icons";
import { materialCount } from "../items";
import { GEMS, METALS, materialLabel, type MaterialId, type MetalId } from "../metals";
import {
  IRON_PER_STEEL, MINE_COLS, MINE_ROWS, SWINGS_PER_TRIP, currentMine, smelt, swing, type MineTile,
} from "../mine";
import { pickaxePower } from "../progression";
import { app, ctx, drawButton, drawMeter, drawPanel, drawText, drawTitle, inRect, input, plural, shake, type Point, type Rect } from "../ui";

const SIDE_PANEL: Rect = { x: 40, y: 95, w: 240, h: 385 };
const TILE = 54;
const GAP = 4;
const GRID_X = 300;
const GRID_Y = 95;
const SMELT_1: Rect = { x: 56, y: 424, w: 100, h: 32 };
const SMELT_5: Rect = { x: 164, y: 424, w: 100, h: 32 };

type Floater = { text: string; x: number; y: number; color: string; life: number };
type Chip = { x: number; y: number; vx: number; vy: number; life: number; color: string };
let floaters: Floater[] = [];
let chips: Chip[] = [];

const tileRect = (i: number): Rect => ({
  x: GRID_X + (i % MINE_COLS) * (TILE + GAP),
  y: GRID_Y + Math.floor(i / MINE_COLS) * (TILE + GAP),
  w: TILE,
  h: TILE,
});

function tileAt(p: Point): number {
  for (let i = 0; i < MINE_COLS * MINE_ROWS; i++) if (inRect(p, tileRect(i))) return i;
  return -1;
}

function canSwing(i: number): boolean {
  const m = currentMine();
  const t = m.tiles[i];
  return t !== undefined && t.reachable && !t.broken && m.swings > 0;
}

const canSmelt = (n: number) => materialCount("iron") >= IRON_PER_STEEL * n;

type Hit = { kind: "tile"; index: number } | { kind: "smelt"; amount: number };

function hit(p: Point): Hit | null {
  const i = tileAt(p);
  if (i >= 0 && canSwing(i)) return { kind: "tile", index: i };
  if (inRect(p, SMELT_1) && canSmelt(1)) return { kind: "smelt", amount: 1 };
  if (inRect(p, SMELT_5) && canSmelt(5)) return { kind: "smelt", amount: 5 };
  return null;
}

export function mineHover(p: Point): boolean {
  return hit(p) !== null;
}

function kindColor(t: MineTile): string {
  if (t.kind === "stone") return "#8a8078";
  if (t.kind === "gem") return "#e0115f";
  return METALS[t.kind as MetalId].color;
}

function chipBurst(r: Rect, color: string, n: number): void {
  for (let k = 0; k < n; k++) {
    chips.push({
      x: r.x + r.w / 2, y: r.y + r.h / 2, color,
      vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 180 - 40, life: 0.5 + Math.random() * 0.4,
    });
  }
}

export function mineClick(p: Point): void {
  const h = hit(p);
  if (!h) {
    const t = currentMine().tiles[tileAt(p)];
    if (currentMine().swings <= 0 && t) app.notice = "Out of swings for today. Finish a forging round to start a new day.";
    else if (t && !t.reachable && !t.broken) app.notice = "Too deep to reach: dig down to it from the top row.";
    return;
  }
  if (h.kind === "smelt") {
    const made = smelt(h.amount);
    app.notice = `Smelted ${plural(made, "steel ingot")} from ${made * IRON_PER_STEEL} iron ore.`;
    sfx.reheat();
    return;
  }
  const m = currentMine();
  const tile = m.tiles[h.index];
  const r = tileRect(h.index);
  const res = swing(h.index);
  if (!res) return;
  app.notice = "";
  sfx.pick();
  shake(1.5, 0.08);
  chipBurst(r, kindColor(tile), 6);
  if (res.broken) {
    sfx.rockBreak();
    chipBurst(r, "#6e625a", 14);
    if (res.loot) {
      const label = res.loot.id in GEMS ? GEMS[res.loot.id as keyof typeof GEMS].label : `${METALS[res.loot.id as MetalId].label} ore`;
      floaters.push({ text: `+${res.loot.amount} ${label}`, x: r.x + r.w / 2, y: r.y + r.h / 2, color: "#9fd86a", life: 1.3 });
      if (res.loot.id in GEMS) sfx.coin();
    }
  }
  if (m.swings === 0) app.notice = "That was your last swing today. Fresh veins open tomorrow.";
}

export function mineUpdate(dt: number): void {
  for (const f of floaters) {
    f.y -= 30 * dt;
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  for (const c of chips) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += 500 * dt;
    c.life -= dt;
  }
  chips = chips.filter((c) => c.life > 0);
}

// ---- Drawing ----

// Small deterministic "random" numbers per tile, so specks and cracks don't flicker.
const hash = (i: number, k: number) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function rockColor(row: number): string {
  // Lighter near the surface, darker deeper down.
  const f = row / (MINE_ROWS - 1);
  const c = (a: number, b: number) => Math.round(a + (b - a) * f);
  return `rgb(${c(122, 70)},${c(108, 60)},${c(98, 56)})`;
}

function drawTile(i: number, t: MineTile): void {
  const r = tileRect(i);
  const row = Math.floor(i / MINE_COLS);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  if (t.broken) {
    ctx.fillStyle = "#0b0706";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#2a1c18";
    ctx.stroke();
    return;
  }
  ctx.fillStyle = rockColor(row);
  ctx.fill();
  const hover = inRect(input.pointer, r) && canSwing(i);
  ctx.lineWidth = hover ? 2.5 : 1.5;
  ctx.strokeStyle = hover ? "#e0a030" : "#2a1c18";
  ctx.stroke();

  // Ore specks
  if (t.kind !== "stone") {
    ctx.fillStyle = kindColor(t);
    const n = t.kind === "gem" ? 3 : 6;
    for (let k = 0; k < n; k++) {
      const x = r.x + 8 + hash(i, k) * (r.w - 16);
      const y = r.y + 8 + hash(i, k + 9) * (r.h - 16);
      ctx.beginPath();
      if (t.kind === "gem") {
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y);
      } else {
        ctx.arc(x, y, 2.5 + hash(i, k + 3) * 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  // Cracks grow as the tile takes damage
  const cracks = Math.round((1 - t.hp / t.maxHp) * 5);
  ctx.strokeStyle = "rgba(20,12,10,0.85)";
  ctx.lineWidth = 1.5;
  for (let k = 0; k < cracks; k++) {
    const a = hash(i, k + 20) * Math.PI * 2;
    const len = 12 + hash(i, k + 30) * 14;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w / 2, r.y + r.h / 2);
    ctx.lineTo(r.x + r.w / 2 + Math.cos(a) * len * 0.5 + 3, r.y + r.h / 2 + Math.sin(a) * len * 0.5);
    ctx.lineTo(r.x + r.w / 2 + Math.cos(a) * len, r.y + r.h / 2 + Math.sin(a) * len);
    ctx.stroke();
  }

  // Rocks you can't reach yet are shaded: dig a path down to them
  if (!t.reachable) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 6);
    ctx.fillStyle = "rgba(10,6,5,0.55)";
    ctx.fill();
  }
}

function tileLabel(t: MineTile): string {
  if (t.kind === "stone") return "Plain stone";
  if (t.kind === "gem") return "Gem pocket";
  return `${METALS[t.kind as MetalId].label} vein`;
}

export function drawMine(): void {
  const m = currentMine();
  drawTitle("Mine");
  drawText("Start at the top and dig a path down: the deeper rocks hold the rarest ore.", 40, 84, 13, "#b8a888", "left");

  // Today's trip
  drawPanel(SIDE_PANEL);
  const x = SIDE_PANEL.x + 16;
  drawText("Today's trip", x, 122, 17, "#e0a030", "left");
  drawMeter({ x, y: 134, w: SIDE_PANEL.w - 32, h: 10 }, m.swings / SWINGS_PER_TRIP, "#9fe3ff");
  drawText(`Pickaxe swings: ${m.swings}/${SWINGS_PER_TRIP}`, x, 162, 13, "#f5e6c8", "left");
  drawText(`Pickaxe power: ${pickaxePower()}`, x, 180, 11, "#8a7a68", "left");

  drawText("Found today", x, 208, 15, "#e0a030", "left");
  const haul = Object.entries(m.haul) as [MaterialId, number][];
  if (!haul.length) drawText("Nothing yet", x, 230, 12, "#8a7a68", "left");
  haul.slice(0, 10).forEach(([id, n], k) => {
    const hx = x + (k % 2) * 108;
    const hy = 218 + Math.floor(k / 2) * 24;
    drawMaterialIcon(ctx, id, hx, hy, 18);
    drawText(`${n} ${materialLabel(id).replace(" ore", "")}`, hx + 22, hy + 14, 12, "#f5e6c8", "left");
  });

  // Smelter: iron into steel
  drawText("Smelter", x, 368, 15, "#e0a030", "left");
  drawText(`${IRON_PER_STEEL} iron ore → 1 steel (steel isn't mined)`, x, 388, 11, "#b8a888", "left");
  drawText(`You have: Iron x${materialCount("iron")} · Steel x${materialCount("steel")}`, x, 406, 11, "#f5e6c8", "left");
  drawButton(SMELT_1, "Smelt 1", canSmelt(1), 13);
  drawButton(SMELT_5, "Smelt 5", canSmelt(5), 13);

  // The rock wall
  m.tiles.forEach((t, i) => drawTile(i, t));

  for (const c of chips) {
    ctx.fillStyle = c.color;
    ctx.globalAlpha = Math.min(1, c.life * 2);
    ctx.fillRect(c.x, c.y, 3, 3);
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    drawText(f.text, f.x, f.y, 14, f.color);
  }
  ctx.globalAlpha = 1;

  // Hovered tile info, or feedback
  const i = tileAt(input.pointer);
  const t = m.tiles[i];
  const line = app.notice
    || (t && !t.broken ? (t.reachable ? `${tileLabel(t)}: ${t.hp}/${t.maxHp} to break` : `${tileLabel(t)}: dig down to reach it`) : "")
    || (m.swings > 0 ? "Click a rock to swing your pickaxe." : "Out of swings. Fresh veins tomorrow (after a forging round).");
  drawText(line, GRID_X + (MINE_COLS * (TILE + GAP) - GAP) / 2, 468, 13, app.notice ? "#9fd86a" : "#b8a888");
}
