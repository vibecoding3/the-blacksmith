// Blacksmith Simulator — steer the marker into the sweet spot and strike the hot blade.

import { BAR, FORGE_ITEMS, type ForgeItem } from "./forgeItems";
import { drawItemIcon } from "./icons";
import {
  DESCRIPTIONS, INVENTORY_SIZE, LEGENDARY_COLOR, SLOT_FOR_TYPE, SLOT_LABELS, addGold, addItem, equip, equippedSlotOf, findItem, inventory,
  itemName, sell, sellAll, unequip, type Item, type Slot, type Tier,
} from "./items";

type State = "menu" | "playing" | "over";

// Sidebar tabs. More menus will be added here later.
type Tab = "forge" | "inventory" | "market";
const TABS: { id: Tab; label: string }[] = [
  { id: "forge", label: "Forge" },
  { id: "inventory", label: "Inventory" },
  { id: "market", label: "Trade Market" },
];

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// The canvas renders at a fixed 1280x720: a menu sidebar on the left (in screen
// pixels) and the content area to its right. Content is laid out in 800x500
// layout units, scaled to fit the content area and centred in it.
const SCREEN_W = 1280;
const SCREEN_H = 720;
const SIDEBAR_W = 170;
const W = 800;
const H = 500;
const SCALE = Math.min((SCREEN_W - SIDEBAR_W) / W, SCREEN_H / H);
const OFFSET_X = SIDEBAR_W + (SCREEN_W - SIDEBAR_W - W * SCALE) / 2;
const OFFSET_Y = (SCREEN_H - H * SCALE) / 2;
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;

const FPS = 60;
const FRAME_MS = 1000 / FPS;

const ROUND_TIME = 60; // seconds
const BASE_MAX_ENERGY = 100; // each hammer swing, hit or miss, costs 1
const LEGENDARY_PRICE_MULTIPLIER = 5;
let item: ForgeItem = FORGE_ITEMS[0]; // what is being forged right now
const GAUGE = { x: 700, y: 140, w: 24, h: 180 };

// Blade temperature in °C, based on common steel forging practice:
// yellow (~1200 °C) is the ideal forging heat, and below cherry red (~800 °C)
// the steel is too stiff to shape and may crack.
const FORGE_TEMP = 1200; // the forge heats the blade up to here
const COLD_TEMP = 800; // too cold to forge below this
const GAUGE_MIN_TEMP = 500; // below this steel no longer glows; bottom of the gauge
const ROOM_TEMP = 20;
const COOL_RATE = 30; // °C lost per second in the air
const STRIKE_COOL = 60; // °C lost per strike (the anvil and hammer draw heat out)
const REHEAT_RATE = 400; // °C gained per second in the forge

// Steel glow colours by temperature (°C → RGB).
const GLOW_COLORS: [number, [number, number, number]][] = [
  [500, [120, 120, 128]], // no visible glow
  [650, [110, 30, 20]], // dull red
  [800, [190, 30, 25]], // cherry red
  [900, [230, 70, 30]], // bright cherry / orange-red
  [1000, [255, 120, 30]], // orange
  [1100, [255, 175, 45]], // orange-yellow
  [1200, [255, 225, 100]], // yellow
];

let state: State = "menu";
let timeLeft = ROUND_TIME;
let tab: Tab = "forge";
let forged = 0; // items forged this round
let strikes: number[] = []; // value of each hit on the current item (0..1)
let heatCycle = 0; // which heat of the current item we are on (0-based)
let marker = 0; // 0..1 position along the bar
const MARKER_SPEED = 0.9; // bar-widths per second
const held = new Set<string>(); // movement keys currently pressed
let mouseTarget: number | null = null; // bar position (0..1) under the mouse, if steering by mouse
let zoneCenter = 0.5;
let zoneBaseWidth = 0.18; // golden zone width when the blade is fully hot
let temp = FORGE_TEMP; // blade temperature in °C
let inForge = false;
let message = "";
let messageTimer = 0;
let messageColor = "#ffe080";
let hammerAnim = 0; // 1 right after a strike, decays to 0
let sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
let maxEnergy = BASE_MAX_ENERGY; // can be raised later (e.g. by upgrades)
let energy = maxEnergy;
let helpOpen = false; // the game is paused while the help panel is shown
let selectedId: number | null = null; // item selected on the inventory screen
let notice = ""; // short feedback on the inventory and market screens (e.g. "Bag is full")
let pointer = { x: -1, y: -1 }; // pointer position in layout units, for hover effects
let pointerScreen = { x: -1, y: -1 }; // the same in screen pixels
let legendaryChance = 0.05; // chance (0..1) that a finished item turns out legendary
let legendaries = 0;
let endReason = ""; // headline on the game-over screen
const logo = new Image();
logo.src = `${import.meta.env.BASE_URL}favicon.svg`;

function newZone(): void {
  // Shrinks as the round goes on, and never takes up more than 60% of the item's workable part.
  zoneBaseWidth = Math.min(Math.max(0.07, 0.18 - forged * 0.01), (item.workEnd - item.workStart) * 0.6);
  zoneCenter = item.workStart + zoneBaseWidth / 2 + Math.random() * (item.workEnd - item.workStart - zoneBaseWidth);
}

// How workable the blade is: 1 at full forge heat, 0 at the cold limit.
function warmth(): number {
  return Math.min(1, Math.max(0, (temp - COLD_TEMP) / (FORGE_TEMP - COLD_TEMP)));
}

// Hot metal is easier to work: the golden zone shrinks as the blade cools.
function zoneWidth(): number {
  return zoneBaseWidth * (0.4 + 0.6 * warmth());
}

function clampToItem(pos: number): number {
  return Math.min(item.workEnd, Math.max(item.workStart, pos));
}

// Number of hits that must be done by the end of heat cycle `cycle` (0-based).
// Hits are split as evenly as possible, earlier heats taking any extra (5 over 2 heats = 3 + 2).
function hitsByEndOfHeat(cycle: number): number {
  let total = 0;
  for (let c = 0; c <= cycle; c++) total += Math.ceil((item.hits - total) / (item.heats - c));
  return total;
}

// True when this heat's hits are done and the blade must go back in the forge.
function needsReheat(): boolean {
  return strikes.length >= hitsByEndOfHeat(heatCycle) && strikes.length < item.hits;
}

function startGame(): void {
  state = "playing";
  timeLeft = ROUND_TIME;
  energy = maxEnergy;
  legendaries = 0;
  forged = 0;
  strikes = [];
  heatCycle = 0;
  marker = (item.workStart + item.workEnd) / 2;
  sparks = [];
  temp = FORGE_TEMP;
  inForge = false;
  newZone();
}

function flash(text: string, color = "#ffe080", duration = 1): void {
  message = text;
  messageColor = color;
  messageTimer = duration;
}

function strike(): void {
  if (inForge) return;
  if (energy <= 0) return;
  if (needsReheat()) {
    flash(`Heat ${heatCycle + 1} done! Reheat the blade (S)`);
    return;
  }
  hammerAnim = 1;
  energy--;
  if (temp < COLD_TEMP) {
    flash("Too cold! Reheat (S)");
    return;
  }

  // Only strikes inside the golden zone shape the blade; a miss does nothing.
  if (Math.abs(marker - zoneCenter) > zoneWidth() / 2) {
    flash("Miss!");
    return;
  }

  // Strikes on cooler metal are worth less (down to 60% just above the cold limit).
  const accuracy = 0.6 + 0.4 * warmth();
  strikes.push(accuracy);
  temp = Math.max(ROOM_TEMP, temp - STRIKE_COOL * item.coolMult);
  flash("Hit!");

  const n = Math.round(accuracy * 25) + 3;
  for (let i = 0; i < n; i++) {
    sparks.push({
      x: 400, y: 250,
      vx: (Math.random() - 0.5) * 400,
      vy: -Math.random() * 300 - 50,
      life: 0.6 + Math.random() * 0.4,
    });
  }

  if (strikes.length >= item.hits) {
    const quality = strikes.reduce((a, b) => a + b, 0) / strikes.length;
    let price = Math.max(1, Math.round(quality * quality * 100 * item.valueMult));
    // Quality is only revealed once the item is finished.
    const legendary = Math.random() < legendaryChance;
    const tier: Tier = legendary ? "legendary" : "normal";
    if (legendary) {
      price *= LEGENDARY_PRICE_MULTIPLIER;
      legendaries++;
      for (let i = 0; i < 80; i++) {
        sparks.push({
          x: 400, y: 235,
          vx: (Math.random() - 0.5) * 700,
          vy: -Math.random() * 500 - 100,
          life: 1 + Math.random() * 0.8,
        });
      }
    }
    if (addItem(item.type, tier, price)) {
      if (legendary) flash(`LEGENDARY ${item.label.toLowerCase()}! Worth ${price}g`, LEGENDARY_COLOR, 2.5);
      else flash(`${item.label} forged! Worth ${price}g`);
    } else {
      addGold(price);
      flash(`Inventory full! ${item.label} sold for ${price}g`, legendary ? LEGENDARY_COLOR : "#ffe080", 2.5);
    }
    forged++;
    strikes = [];
    heatCycle = 0;
    temp = FORGE_TEMP; // a fresh blank comes out of the forge hot
  }
  newZone();
}

// Picks the item to forge next. Only allowed between items, so no progress is lost.
function chooseItem(index: number): void {
  const next = FORGE_ITEMS[index];
  if (!next || next === item) return;
  if (strikes.length > 0) {
    flash(`Finish the ${item.label.toLowerCase()} first!`);
    return;
  }
  item = next;
  heatCycle = 0;
  marker = clampToItem(marker);
  newZone();
  if (state === "playing") flash(`Now forging: ${item.label}`);
}

function onAction(): void {
  if (state === "playing") {
    strike();
    // Checked after the strike so an item finished on the last swing still counts.
    if (energy <= 0) endGame("Out of energy!");
  } else {
    startGame();
  }
}

const LEFT_KEYS = ["KeyA", "ArrowLeft"];
const RIGHT_KEYS = ["KeyD", "ArrowRight"];
const REHEAT_KEYS = ["KeyS", "ArrowDown"];
const ITEM_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"];

function reheat(): void {
  if (state === "playing" && !inForge && temp < FORGE_TEMP) inForge = true;
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyH") {
    helpOpen = !helpOpen;
    return;
  }
  if (helpOpen) {
    // Any action key closes help instead of acting on the game.
    if (["Escape", "Space", "Enter"].includes(e.code)) {
      e.preventDefault();
      helpOpen = false;
    }
    return;
  }
  if (e.code === "KeyI") {
    switchTab(tab === "inventory" ? "forge" : "inventory");
    return;
  }
  if (tab !== "forge") return;
  if (ITEM_KEYS.includes(e.code)) {
    chooseItem(ITEM_KEYS.indexOf(e.code));
    return;
  }
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) onAction();
  } else if (LEFT_KEYS.includes(e.code) || RIGHT_KEYS.includes(e.code)) {
    e.preventDefault();
    held.add(e.code);
    mouseTarget = null; // keyboard takes over from the mouse
  } else if (REHEAT_KEYS.includes(e.code)) {
    e.preventDefault();
    reheat();
  }
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", () => held.clear());
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

const inRect = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Pointer position in canvas pixels (the canvas may be scaled by CSS).
function toScreen(e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * SCREEN_W, y: ((e.clientY - rect.top) / rect.height) * SCREEN_H };
}

function toLayout(s: Point): Point {
  return { x: (s.x - OFFSET_X) / SCALE, y: (s.y - OFFSET_Y) / SCALE };
}

function switchTab(next: Tab): void {
  tab = next;
  held.clear();
  mouseTarget = null;
  notice = "";
  selectedId = null;
}

canvas.addEventListener("pointerdown", (e) => {
  const s = toScreen(e);
  const hit = sidebarHit(s);
  if (hit === "help") {
    helpOpen = !helpOpen;
    return;
  }
  if (helpOpen) {
    helpOpen = false;
    if (!hit) return;
  }
  if (hit) {
    switchTab(hit);
    return;
  }
  if (s.x < SIDEBAR_W) return;
  const p = toLayout(s);
  if (tab === "inventory") {
    inventoryClick(p);
    return;
  }
  if (tab === "market") {
    marketClick(p);
    return;
  }
  if (state === "playing" && pickerHit(p) >= 0) {
    chooseItem(pickerHit(p));
    return;
  }
  // Strike exactly where the player clicked, even if no frame has run since the last move.
  mouseTarget = clampToItem((p.x - BAR.x) / BAR.w);
  if (state === "playing" && !inForge) marker = mouseTarget;
  onAction();
});

// Mouse steering: the marker follows the pointer's position along the bar.
canvas.addEventListener("pointermove", (e) => {
  pointerScreen = toScreen(e);
  pointer = toLayout(pointerScreen);
  const screenHit =
    tab === "inventory" ? inventoryHit(pointer) !== null
    : tab === "market" ? marketHit(pointer) !== null
    : state === "playing" && pickerHit(pointer) >= 0;
  const clickable = sidebarHit(pointerScreen) !== null || (!helpOpen && screenHit);
  canvas.style.cursor = clickable ? "pointer" : "";
  mouseTarget = tab === "forge" && pointerScreen.x >= SIDEBAR_W ? clampToItem((pointer.x - BAR.x) / BAR.w) : null;
});
canvas.addEventListener("pointerleave", () => {
  mouseTarget = null;
  pointer = pointerScreen = { x: -1, y: -1 };
});

function update(dt: number): void {
  if (helpOpen || tab !== "forge") return; // the forge pauses while help or another menu is open
  hammerAnim = Math.max(0, hammerAnim - dt * 4);
  messageTimer = Math.max(0, messageTimer - dt);
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 600 * dt;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);

  if (state !== "playing") return;

  if (inForge) {
    // The blade stays in the fire until it is fully hot again; no steering meanwhile.
    temp = Math.min(FORGE_TEMP, temp + REHEAT_RATE * dt);
    if (temp >= FORGE_TEMP) {
      inForge = false;
      if (needsReheat()) heatCycle++; // the next heat's hits can start
    }
  } else {
    temp = Math.max(ROOM_TEMP, temp - COOL_RATE * item.coolMult * dt);
    const left = LEFT_KEYS.some((k) => held.has(k));
    const right = RIGHT_KEYS.some((k) => held.has(k));
    const move = (right ? 1 : 0) - (left ? 1 : 0);
    if (move !== 0) {
      marker = clampToItem(marker + move * MARKER_SPEED * dt);
    } else if (mouseTarget !== null) {
      marker = mouseTarget; // follows the pointer directly
    }
  }

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame("Time's up!");
  }
}

function endGame(reason: string): void {
  state = "over";
  endReason = reason;
}

// Yellow lightning bolt, the energy symbol, drawn in a box of the given size at (x, y).
function drawBolt(x: number, y: number, size: number): void {
  const pts = [[0.6, 0], [0.1, 0.55], [0.45, 0.55], [0.3, 1], [0.9, 0.4], [0.55, 0.4], [0.75, 0]];
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * size, y + py * size));
  ctx.closePath();
  ctx.fillStyle = "#ffd60a";
  ctx.fill();
}

function drawText(text: string, x: number, y: number, size: number, color = "#f5e6c8", align: CanvasTextAlign = "center"): void {
  ctx.font = `bold ${size}px Georgia, serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Glow colour of steel at a given temperature, interpolated from GLOW_COLORS.
function heatColor(t: number): string {
  let i = 1;
  while (i < GLOW_COLORS.length - 1 && t > GLOW_COLORS[i][0]) i++;
  const [t0, c0] = GLOW_COLORS[i - 1];
  const [t1, c1] = GLOW_COLORS[i];
  const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  const [r, g, b] = c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
  return `rgb(${r},${g},${b})`;
}

function drawBlade(x: number, y: number): void {
  ctx.fillStyle = heatColor(temp);
  ctx.fillRect(x, y, 180, 10);
  ctx.beginPath(); ctx.moveTo(x + 180, y); ctx.lineTo(x + 205, y + 5); ctx.lineTo(x + 180, y + 10); ctx.fill();
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(x - 25, y - 2, 25, 14);
}

// Fills the whole canvas in screen pixels, so it must be drawn without the layout transform.
function drawBackground(): void {
  ctx.fillStyle = "#2b1d18";
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const cx = OFFSET_X + 400 * SCALE;
  const cy = OFFSET_Y + 260 * SCALE;
  const glow = ctx.createRadialGradient(cx, cy, 20 * SCALE, cx, cy, 320 * SCALE);
  glow.addColorStop(0, "rgba(255,120,30,0.35)");
  glow.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

function drawForge(): void {
  // Forge on the left, with flickering fire
  ctx.fillStyle = "#5a2e22";
  ctx.fillRect(30, 200, 150, 140);
  ctx.fillStyle = "#1a0d08";
  ctx.fillRect(50, 230, 110, 70);
  const flicker = 0.75 + Math.random() * 0.25;
  ctx.fillStyle = `rgba(255,${Math.round(90 + 60 * flicker)},20,${flicker})`;
  ctx.beginPath();
  ctx.moveTo(55, 300);
  for (let i = 0; i <= 10; i++) ctx.lineTo(55 + i * 10, 300 - (i % 2 ? 35 : 15) * flicker - Math.random() * 10);
  ctx.lineTo(155, 300);
  ctx.closePath();
  ctx.fill();

  // Anvil
  ctx.fillStyle = "#4a4a52";
  ctx.beginPath();
  ctx.moveTo(270, 260); ctx.lineTo(530, 260); ctx.lineTo(560, 240);
  ctx.lineTo(240, 240); ctx.closePath(); ctx.fill();
  ctx.fillRect(270, 260, 260, 25);
  ctx.fillRect(340, 285, 120, 40);
  ctx.fillRect(300, 325, 200, 20);

  // Blade: in the fire while reheating, otherwise on the anvil
  if (inForge) drawBlade(60, 272);
  else drawBlade(310, 230);

  // Hammer (swings down on strike)
  ctx.save();
  ctx.translate(560, 120);
  ctx.rotate(-0.6 + hammerAnim * 0.9 - (state === "playing" ? 0 : 0.2));
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(-150, -6, 150, 12);
  ctx.fillStyle = "#777";
  ctx.fillRect(-175, -25, 40, 50);
  ctx.restore();

  // Sparks
  for (const s of sparks) {
    ctx.fillStyle = `rgba(255,${180 + Math.random() * 75},60,${Math.min(1, s.life * 2)})`;
    ctx.fillRect(s.x, s.y, 3, 3);
  }
}

function drawHeatGauge(): void {
  const { x, y, w, h } = GAUGE;
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = "#2a1c18";
  ctx.fillRect(x, y, w, h);
  // The gauge spans GAUGE_MIN_TEMP (bottom) to FORGE_TEMP (top).
  const level = (t: number) => Math.min(1, Math.max(0, (t - GAUGE_MIN_TEMP) / (FORGE_TEMP - GAUGE_MIN_TEMP)));
  const fill = level(temp) * h;
  ctx.fillStyle = heatColor(temp);
  ctx.fillRect(x, y + h - fill, w, fill);
  // Cold limit line, labelled on the left
  const coldY = y + h - level(COLD_TEMP) * h;
  ctx.fillStyle = "#6ab0ff";
  ctx.fillRect(x - 6, coldY - 1, w + 12, 2);
  drawText(`${COLD_TEMP}°`, x - 10, coldY + 5, 13, "#6ab0ff", "right");
  // Current temperature, to the right of the bar at the fill level
  const tempY = Math.min(y + h, Math.max(y + 10, y + h - fill + 6));
  drawText(`${Math.round(temp)}°C`, x + w + 8, tempY, 15, temp < COLD_TEMP ? "#6ab0ff" : "#f5e6c8", "left");
  drawText("HEAT", x + w / 2, y - 12, 16);
  if (inForge) drawText("Heating...", x + w / 2, y + h + 28, 16, "#ffb347");
  else if (temp < COLD_TEMP || needsReheat()) drawText("Press S!", x + w / 2, y + h + 28, 16, "#6ab0ff");
}

function drawBar(): void {
  item.drawFittings(ctx);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.stroke(item.body);
  ctx.fillStyle = "#4a4a52";
  ctx.fill(item.body);

  // Golden zone, clipped to the item's outline
  const zw = zoneWidth();
  const zx = BAR.x + (zoneCenter - zw / 2) * BAR.w;
  ctx.save();
  ctx.clip(item.body);
  ctx.fillStyle = "#e0a030";
  ctx.fillRect(zx, BAR.y - 60, zw * BAR.w, BAR.h + 120); // full height of any shape; the clip trims it
  ctx.restore();

  const mx = BAR.x + marker * BAR.w;
  ctx.fillStyle = "#fff";
  ctx.fillRect(mx - 2, BAR.y - 10, 4, BAR.h + 20);

  // Hit pips, grouped by heat cycle with a small flame between heats
  const PIP = 26;
  const GAP = 30; // extra space between heats, holding the flame
  const totalW = (item.hits - 1) * PIP + (item.heats - 1) * GAP;
  let px = W / 2 - totalW / 2;
  const py = BAR.y + 74; // below the tallest item shapes
  let cycle = 0;
  for (let i = 0; i < item.hits; i++) {
    if (i > 0 && i === hitsByEndOfHeat(cycle)) {
      const fx = px + (GAP - PIP) / 2; // midway between the last pip of this heat and the next
      px += GAP;
      // Lit once the blade has been reheated for the next heat
      drawFlame(fx, py, cycle < heatCycle ? "#ff8a1c" : needsReheat() && cycle === heatCycle ? "#6ab0ff" : "#3a2a22");
      cycle++;
    }
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = i < strikes.length ? "#e0a030" : "#3a2a22";
    ctx.fill();
    px += PIP;
  }
}

// Item picker: a row of item icons along the top of the forge (keys 1-9, 0).
const PICKER = { size: 40, gap: 6, y: 12 };
const PICKER_X = W / 2 - (FORGE_ITEMS.length * (PICKER.size + PICKER.gap) - PICKER.gap) / 2;

function pickerRect(i: number): Rect {
  return { x: PICKER_X + i * (PICKER.size + PICKER.gap), y: PICKER.y, w: PICKER.size, h: PICKER.size };
}

function pickerHit(p: Point): number {
  return FORGE_ITEMS.findIndex((_, i) => inRect(p, pickerRect(i)));
}

function drawPicker(): void {
  FORGE_ITEMS.forEach((it, i) => {
    const r = pickerRect(i);
    const current = it === item;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 6);
    ctx.fillStyle = current ? "#4a3420" : inRect(pointer, r) ? "#3a2a22" : "rgba(26,18,16,0.85)";
    ctx.fill();
    ctx.lineWidth = current ? 2.5 : 1.5;
    ctx.strokeStyle = current ? "#e0a030" : "#5a4030";
    ctx.stroke();
    drawItemIcon(ctx, it.type, false, r.x + 3, r.y + 3, r.w - 6);
    drawText(`${(i + 1) % 10}`, r.x + 4, r.y + 11, 9, "#8a7a68", "left");
  });
  // Details of the hovered item, or of the current one
  const shown = FORGE_ITEMS[pickerHit(pointer)] ?? item;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  drawText(shown.label, W / 2, PICKER.y + PICKER.size + 18, 15, shown === item ? "#e0a030" : "#f5e6c8");
  drawText(`${plural(shown.hits, "hit")} \u00b7 ${plural(shown.heats, "heat")} \u00b7 ${shown.valueMult}\u00d7 value \u00b7 ${shown.note}`,
    W / 2, PICKER.y + PICKER.size + 35, 12, "#b8a888");
}

function drawFlame(x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 11);
  ctx.quadraticCurveTo(x + 9, y + 1, x + 5, y + 7);
  ctx.quadraticCurveTo(x, y + 11, x - 5, y + 7);
  ctx.quadraticCurveTo(x - 9, y + 1, x, y - 11);
  ctx.fillStyle = color;
  ctx.fill();
}

// Drawn in screen pixels, in the bottom-right corner.
function drawVersion(): void {
  ctx.font = "18px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(245,230,200,0.5)";
  ctx.fillText(`v${__APP_VERSION__}`, SCREEN_W - 14, SCREEN_H - 14);
}

function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground();
  ctx.setTransform(SCALE, 0, 0, SCALE, OFFSET_X, OFFSET_Y);
  if (tab === "forge") {
    drawForge();
    drawScreen();
  } else if (tab === "inventory") {
    drawInventory();
  } else {
    drawMarket();
  }
  if (helpOpen) drawHelp();
  // The sidebar goes on top of any dimming, so its buttons always stay usable.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSidebar();
  drawVersion();
}

// ---- Sidebar (screen pixels) ----

const TAB_RECTS: Rect[] = TABS.map((_, i) => ({ x: 14, y: 110 + i * 58, w: SIDEBAR_W - 28, h: 46 }));
const HELP_RECT: Rect = { x: 14, y: SCREEN_H - 70, w: SIDEBAR_W - 28, h: 46 };

function sidebarHit(s: Point): Tab | "help" | null {
  if (inRect(s, HELP_RECT)) return "help";
  const i = TAB_RECTS.findIndex((r) => inRect(s, r));
  return i >= 0 ? TABS[i].id : null;
}

function drawSidebarButton(r: Rect, label: string, active: boolean): void {
  const hover = inRect(pointerScreen, r);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = active ? "#e0a030" : hover ? "#3a2a22" : "#2b1d18";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? "#e0a030" : "#5a4030";
  ctx.stroke();
  drawText(label, r.x + r.w / 2, r.y + r.h / 2 + 6, 18, active ? "#2b1d18" : "#f5e6c8");
}

function drawSidebar(): void {
  ctx.fillStyle = "#1a1210";
  ctx.fillRect(0, 0, SIDEBAR_W, SCREEN_H);
  ctx.fillStyle = "#3a2a22";
  ctx.fillRect(SIDEBAR_W - 2, 0, 2, SCREEN_H);

  if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, SIDEBAR_W / 2 - 34, 18, 68, 68);
  TABS.forEach((t, i) => drawSidebarButton(TAB_RECTS[i], t.label, tab === t.id));

  // Gold is kept between rounds, so it lives in the sidebar
  const gy = 110 + TABS.length * 58 + 30;
  ctx.beginPath();
  ctx.arc(32, gy - 7, 11, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  drawText(`${inventory.gold}g`, 52, gy, 22, "#ffd700", "left");

  drawSidebarButton(HELP_RECT, "? Help", helpOpen);
}

// ---- Inventory and Trade Market screens (layout units) ----
// Both show the bag as a grid on the right, a panel on the left and item details below.

const GRID = { x: 310, y: 95, cell: 64, gap: 10, cols: 6 };
const SIDE_PANEL: Rect = { x: 40, y: 95, w: 240, h: 385 };
const SLOT_RECTS: Record<Slot, Rect> = {
  head: { x: 194, y: 152, w: 56, h: 56 },
  chest: { x: 194, y: 234, w: 56, h: 56 },
  weapon: { x: 194, y: 316, w: 56, h: 56 },
  offhand: { x: 194, y: 398, w: 56, h: 56 },
};
const DETAILS: Rect = { x: 310, y: 395, w: 434, h: 85 };
const ACTION_BTN: Rect = { x: 646, y: 427, w: 88, h: 34 }; // Equip/Unequip in the inventory, Sell in the market
const SELL_ALL_BTN: Rect = { x: 60, y: 420, w: 200, h: 40 };

function cellRect(i: number): Rect {
  const col = i % GRID.cols;
  const row = Math.floor(i / GRID.cols);
  return { x: GRID.x + col * (GRID.cell + GRID.gap), y: GRID.y + row * (GRID.cell + GRID.gap), w: GRID.cell, h: GRID.cell };
}

function cellHit(p: Point): number {
  for (let i = 0; i < INVENTORY_SIZE; i++) if (inRect(p, cellRect(i))) return i;
  return -1;
}

type InventoryHit = { kind: "cell"; index: number } | { kind: "slot"; slot: Slot } | { kind: "equip" };

function inventoryHit(p: Point): InventoryHit | null {
  const index = cellHit(p);
  if (index >= 0) return { kind: "cell", index };
  for (const slot of Object.keys(SLOT_RECTS) as Slot[]) if (inRect(p, SLOT_RECTS[slot])) return { kind: "slot", slot };
  if (selectedId !== null && canEquipOrUnequip(selectedId) && inRect(p, ACTION_BTN)) return { kind: "equip" };
  return null;
}

function canEquipOrUnequip(id: number): boolean {
  const it = findItem(id);
  return it !== undefined && (equippedSlotOf(id) !== undefined || SLOT_FOR_TYPE[it.type] !== undefined);
}

function inventoryClick(p: Point): void {
  const hit = inventoryHit(p);
  notice = "";
  if (!hit) {
    selectedId = null;
  } else if (hit.kind === "cell") {
    selectedId = inventory.items[hit.index]?.id ?? null;
  } else if (hit.kind === "slot") {
    selectedId = inventory.equipped[hit.slot]?.id ?? null;
  } else if (selectedId !== null) {
    const slot = equippedSlotOf(selectedId);
    if (slot) {
      if (!unequip(slot)) notice = "Your bag is full: sell something at the Trade Market first.";
    } else {
      equip(selectedId);
    }
  }
}

const isNormal = (i: Item) => i.tier === "normal";

type MarketHit = { kind: "cell"; index: number } | { kind: "sell" } | { kind: "sellAll" };

// The market only deals in bag items; equipped items must be unequipped first.
function marketHit(p: Point): MarketHit | null {
  const index = cellHit(p);
  if (index >= 0) return { kind: "cell", index };
  if (selectedId !== null && inventory.items.some((i) => i.id === selectedId) && inRect(p, ACTION_BTN)) return { kind: "sell" };
  if (inventory.items.some(isNormal) && inRect(p, SELL_ALL_BTN)) return { kind: "sellAll" };
  return null;
}

function marketClick(p: Point): void {
  const hit = marketHit(p);
  notice = "";
  if (!hit) {
    selectedId = null;
  } else if (hit.kind === "cell") {
    selectedId = inventory.items[hit.index]?.id ?? null;
  } else if (hit.kind === "sell" && selectedId !== null) {
    const item = findItem(selectedId);
    sell(selectedId);
    if (item) notice = `Sold ${itemName(item)} for ${item.value}g.`;
    selectedId = null;
  } else if (hit.kind === "sellAll") {
    const { count, total } = sellAll(isNormal);
    notice = `Sold ${count} normal item${count === 1 ? "" : "s"} for ${total}g.`;
    selectedId = null;
  }
}

function drawIcon(it: Item, x: number, y: number, size: number): void {
  drawItemIcon(ctx, it.type, it.tier === "legendary", x, y, size);
}

function drawCell(r: Rect, item: Item | undefined, label?: string): void {
  const selected = item !== undefined && item.id === selectedId;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = inRect(pointer, r) && item ? "#3a2a22" : "#1a1210";
  ctx.fill();
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? "#ffe080" : item?.tier === "legendary" ? LEGENDARY_COLOR : "#5a4030";
  ctx.stroke();
  if (item) drawIcon(item, r.x + 4, r.y + 4, r.w - 8);
  else if (label) drawText(label, r.x + r.w / 2, r.y + r.h / 2 + 4, 11, "#5a4030");
}

function drawButton(r: Rect, label: string, enabled = true): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = !enabled ? "#3a2a22" : inRect(pointer, r) ? "#ffb347" : "#e0a030";
  ctx.fill();
  drawText(label, r.x + r.w / 2, r.y + r.h / 2 + 6, 16, enabled ? "#2b1d18" : "#8a7a68");
}

function drawPanel(r: Rect): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = "rgba(26,18,16,0.85)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#5a4030";
  ctx.stroke();
}

function drawInventory(): void {
  drawText("Inventory", 40, 60, 34, "#f5e6c8", "left");

  // Equipment: the blacksmith with an equipment slot per item kind
  drawPanel(SIDE_PANEL);
  drawText("Equipment", SIDE_PANEL.x + SIDE_PANEL.w / 2, SIDE_PANEL.y + 32, 20, "#e0a030");
  ctx.fillStyle = "#5a4a44";
  ctx.beginPath();
  ctx.arc(120, 175, 22, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(98, 202, 44, 92, 8); // body
  ctx.roundRect(80, 206, 16, 72, 6); // arms
  ctx.roundRect(144, 206, 16, 72, 6);
  ctx.roundRect(100, 296, 18, 84, 6); // legs
  ctx.roundRect(122, 296, 18, 84, 6);
  ctx.fill();
  for (const slot of Object.keys(SLOT_RECTS) as Slot[]) {
    const r = SLOT_RECTS[slot];
    drawText(SLOT_LABELS[slot], r.x + r.w / 2, r.y - 8, 14, "#b8a888");
    drawCell(r, inventory.equipped[slot], "empty");
  }

  drawBag();
  const selected = drawDetails();
  if (selected) drawButton(ACTION_BTN, equippedSlotOf(selected.id) ? "Unequip" : "Equip", canEquipOrUnequip(selected.id));
  else drawEmptyDetails("Select an item to equip it.", "To sell items, visit the Trade Market.");

  const slot = (Object.keys(SLOT_RECTS) as Slot[]).find((s) => inRect(pointer, SLOT_RECTS[s]));
  drawTooltip(slot ? inventory.equipped[slot] : hoveredBagItem());
}

function drawBag(): void {
  drawText(`Items ${inventory.items.length}/${INVENTORY_SIZE}`, GRID.x, GRID.y - 14, 18, "#e0a030", "left");
  for (let i = 0; i < INVENTORY_SIZE; i++) drawCell(cellRect(i), inventory.items[i]);
  if (inventory.items.length === 0) {
    drawText("No items yet. Forge something!", GRID.x + 217, GRID.y + 145, 18, "#b8a888");
  }
}

// Draws the details panel for the selected item (if any) plus any notice; returns that item.
function drawDetails(): Item | undefined {
  drawPanel(DETAILS);
  if (notice) drawText(notice, DETAILS.x + DETAILS.w / 2, DETAILS.y + DETAILS.h + 16, 14, "#ffb347");
  const selected = selectedId !== null ? findItem(selectedId) : undefined;
  if (selected) {
    const legendary = selected.tier === "legendary";
    drawText(itemName(selected), DETAILS.x + 16, DETAILS.y + 30, 20, legendary ? LEGENDARY_COLOR : "#f5e6c8", "left");
    const slot = SLOT_FOR_TYPE[selected.type];
    const kind = slot ? SLOT_LABELS[slot] : "Trade good";
    drawText(`${legendary ? "\u2605 Legendary" : "Normal"} \u00b7 ${kind} \u00b7 worth ${selected.value}g`, DETAILS.x + 16, DETAILS.y + 56, 15, "#b8a888", "left");
  }
  return selected;
}

function drawEmptyDetails(line1: string, line2: string): void {
  drawText(line1, DETAILS.x + 16, DETAILS.y + 36, 16, "#b8a888", "left");
  drawText(line2, DETAILS.x + 16, DETAILS.y + 60, 14, "#8a7a68", "left");
}

function hoveredBagItem(): Item | undefined {
  const i = cellHit(pointer);
  return i >= 0 ? inventory.items[i] : undefined;
}

// A small box next to the pointer with the item's name and description.
// Item stats (attack, defence, ...) will be added here as extra lines once they exist.
function drawTooltip(it: Item | undefined): void {
  if (!it || helpOpen) return;
  const legendary = it.tier === "legendary";
  const slot = SLOT_FOR_TYPE[it.type];
  const lines: { text: string; size: number; color: string }[] = [
    { text: itemName(it), size: 16, color: legendary ? LEGENDARY_COLOR : "#f5e6c8" },
    { text: `${legendary ? "★ Legendary" : "Normal"} · ${slot ? SLOT_LABELS[slot] : "Trade good"}`, size: 12, color: "#b8a888" },
    { text: DESCRIPTIONS[it.type], size: 13, color: "#f5e6c8" },
    { text: `Worth ${it.value}g`, size: 13, color: "#ffd700" },
  ];
  const pad = 10;
  const lineGap = 6;
  const w = pad * 2 + Math.max(...lines.map((l) => {
    ctx.font = `bold ${l.size}px Georgia, serif`;
    return ctx.measureText(l.text).width;
  }));
  const h = pad * 2 + lines.reduce((sum, l) => sum + l.size + lineGap, -lineGap);
  // Below-right of the pointer, flipped to stay inside the layout area
  let x = pointer.x + 14;
  let y = pointer.y + 18;
  if (x + w > W - 4) x = pointer.x - 14 - w;
  if (y + h > H - 4) y = pointer.y - 10 - h;

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

function drawMarket(): void {
  drawText("Trade Market", 40, 60, 34, "#f5e6c8", "left");

  // Merchant's stall with a summary of what the bag is worth
  drawPanel(SIDE_PANEL);
  drawText("Merchant", SIDE_PANEL.x + SIDE_PANEL.w / 2, SIDE_PANEL.y + 32, 20, "#e0a030");
  const stripes = 8;
  const awningW = 180;
  const ax = SIDE_PANEL.x + (SIDE_PANEL.w - awningW) / 2;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? "#f5e6c8" : "#a8322a";
    ctx.fillRect(ax + (i * awningW) / stripes, 150, awningW / stripes, 26);
  }
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(ax + 6, 176, 8, 70); // posts
  ctx.fillRect(ax + awningW - 14, 176, 8, 70);
  ctx.fillStyle = "#5a4a44"; // merchant behind the counter
  ctx.beginPath();
  ctx.arc(SIDE_PANEL.x + SIDE_PANEL.w / 2, 205, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(SIDE_PANEL.x + SIDE_PANEL.w / 2 - 20, 222, 40, 30);
  ctx.fillStyle = "#8a5a32"; // counter
  ctx.fillRect(ax - 4, 240, awningW + 8, 30);

  const normals = inventory.items.filter(isNormal);
  const bagValue = inventory.items.reduce((sum, i) => sum + i.value, 0);
  const normalValue = normals.reduce((sum, i) => sum + i.value, 0);
  const left = SIDE_PANEL.x + 20;
  drawText(`For sale: ${inventory.items.length} item${inventory.items.length === 1 ? "" : "s"}`, left, 310, 16, "#f5e6c8", "left");
  drawText(`Total value: ${bagValue}g`, left, 336, 16, "#ffd700", "left");
  drawText("Equipped items can't be sold.", left, 372, 13, "#8a7a68", "left");
  drawText("Unequip them in the Inventory.", left, 390, 13, "#8a7a68", "left");
  drawButton(SELL_ALL_BTN, normals.length ? `Sell all normal (${normalValue}g)` : "No normal items", normals.length > 0);

  drawBag();
  const selected = drawDetails();
  if (selected) drawButton(ACTION_BTN, `Sell ${selected.value}g`);
  else drawEmptyDetails("Select an item to sell it.", "Legendary items are worth 5\u00d7 a normal one.");
  drawTooltip(hoveredBagItem());
}

function drawHelp(): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // dim the whole screen
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.restore();

  const px = 110;
  const py = 30;
  const pw = 580;
  const ph = 440;
  ctx.fillStyle = "#2b1d18";
  ctx.fillRect(px, py, pw, ph);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e0a030";
  ctx.strokeRect(px, py, pw, ph);

  const left = px + 30;
  drawText("Help", W / 2, py + 45, 32);

  drawText("Controls", left, py + 85, 20, "#e0a030", "left");
  drawText("Mouse, A/D or ←/→: move the marker      1–9, 0: pick the item to forge", left, py + 112, 16, "#f5e6c8", "left");
  drawText("SPACE or click: strike (hits only count in the golden zone)", left, py + 134, 16, "#f5e6c8", "left");
  drawText("S or ↓: reheat the blade in the forge      H: help      I: inventory", left, py + 156, 16, "#f5e6c8", "left");
  drawText("Finished items go to your Inventory (equip them) and sell at the Trade Market.", left, py + 178, 16, "#f5e6c8", "left");

  drawText("Item tiers", left, py + 218, 20, "#e0a030", "left");
  drawText("Every item you forge has a tier, revealed only once it is finished.", left, py + 245, 16, "#f5e6c8", "left");

  drawText("Normal", left, py + 278, 18, "#f5e6c8", "left");
  drawText("The usual result. A sword is worth up to 100g; hotter hits", left + 20, py + 302, 16, "#b8a888", "left");
  drawText("make it worth more.", left + 20, py + 322, 16, "#b8a888", "left");

  drawText("★ Legendary", left, py + 355, 18, LEGENDARY_COLOR, "left");
  drawText(`Rare. Each finished item has a ${Math.round(legendaryChance * 100)}% chance (your ★ stat)`, left + 20, py + 379, 16, "#b8a888", "left");
  drawText(`to become legendary. Worth ${LEGENDARY_PRICE_MULTIPLIER}× the normal price.`, left + 20, py + 399, 16, "#b8a888", "left");

  drawText("Click anywhere or press H to close", W / 2, py + ph - 18, 16, "#ffb347");
}

function drawScreen(): void {
  if (state === "menu") {
    if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, W / 2 - 45, 20, 90, 90);
    drawText("Blacksmith Simulator", W / 2, 150, 48);
    drawText("Steer the marker with the mouse, A/D or the arrow keys,", W / 2, 360, 20);
    drawText("then press SPACE or click to strike in the golden zone.", W / 2, 385, 20);
    drawText(`The blade cools: press S or ↓ to reheat. You have ${ROUND_TIME}s and ${maxEnergy} energy.`, W / 2, 410, 20);
    drawText("Pick what to forge with the item bar or keys 1–9, 0. Items go to your Inventory.", W / 2, 435, 20);
    drawText("Press SPACE or click to start", W / 2, 475, 24, "#ffb347");
    return;
  }

  drawText(`Forged: ${forged}`, 20, 40, 24, "#f5e6c8", "left");
  drawBolt(18, 54, 22);
  drawText(`${energy}/${maxEnergy}`, 44, 73, 20, "#ffd60a", "left");
  drawText(`★ ${Math.round(legendaryChance * 100)}% legendary`, 20, 104, 18, LEGENDARY_COLOR, "left");
  drawText(`${Math.ceil(timeLeft)}s`, W - 20, 40, 26, timeLeft < 10 ? "#ff6040" : "#f5e6c8", "right");

  if (state === "playing") {
    drawPicker();
    drawBar();
    drawHeatGauge();
    if (messageTimer > 0) {
      const fade = Math.min(1, messageTimer); // longer messages hold, then fade over the last second
      ctx.globalAlpha = fade;
      drawText(message, W / 2, 190 - (1 - fade) * 20, 32, messageColor);
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // darken the whole screen, not just the layout area
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.restore();
    drawText(endReason, W / 2, 170, 52);
    const legendaryNote = legendaries > 0 ? ` (${legendaries} legendary)` : "";
    drawText(`You forged ${forged} item${forged === 1 ? "" : "s"}${legendaryNote}.`, W / 2, 230, 24);
    drawText("Equip them in your Inventory or sell them at the Trade Market.", W / 2, 266, 20, "#b8a888");
    drawText("Press SPACE or click to forge again", W / 2, 340, 24, "#ffb347");
  }
}

// Capped at 60 fps: on faster screens (120/144 Hz) some animation frames are skipped.
let lastFrame = performance.now();
let lastUpdate = lastFrame;
function loop(now: number): void {
  requestAnimationFrame(loop);
  if (now - lastFrame < FRAME_MS - 1) return; // 1 ms tolerance for timing jitter on 60 Hz screens
  // Advance on a 60 fps schedule without falling behind (or drifting ahead of) real time.
  lastFrame = Math.max(Math.min(now, lastFrame + FRAME_MS), now - FRAME_MS);
  const dt = Math.min(0.05, (now - lastUpdate) / 1000);
  lastUpdate = now;
  update(dt);
  render();
}
requestAnimationFrame(loop);
