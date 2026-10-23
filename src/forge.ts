// The forge: pick an item, metal (and gem), hammer it in the golden zone over one or more heats,
// quench it at the right temperature, then sharpen or polish it. Also used to repair worn gear.

import { sfx } from "./audio";
import { BAR, FORGE_ITEMS, forgeItemFor, type ForgeItem } from "./forgeItems";
import { drawItemIcon, drawMaterialIcon } from "./icons";
import {
  LEGENDARY_COLOR, MAX_DURABILITY, addGold, addItem, computeValue, findItem, itemName, materialCount, randomTrait,
  spendMaterial, type Tier, TRAITS,
} from "./items";
import { newDay } from "./market";
import { GEMS, GEM_IDS, METALS, METAL_IDS, type GemId, type MetalId } from "./metals";
import {
  addXp, coolMult, finishWidthMult, isItemUnlocked, isMetalUnlocked, legendaryChance, maxEnergy, quenchWidthMult,
  reheatMult, roundTime, zoneMult,
} from "./progression";
import { persist, save } from "./save";
import { W, app, ctx, dimScreen, drawText, inRect, input, plural, shake, textWidth, type Point, type Rect } from "./ui";

type State = "menu" | "playing" | "over";
type Phase = "hammer" | "quench" | "finish";

const GAUGE = { x: 700, y: 140, w: 24, h: 180 };
const ROOM_TEMP = 20;
const COOL_RATE = 30; // °C lost per second in the air
const STRIKE_COOL = 60; // °C lost per strike (the anvil and hammer draw heat out)
const REHEAT_RATE = 400; // °C gained per second in the forge
const MARKER_SPEED = 0.9; // bar-widths per second (keyboard steering)
const GRIND_RATE = 0.55; // finishing meter per second while held
const FINISH_OVERDONE = 1; // past this the edge or polish is ruined

// Glow colours of hot metal by temperature (°C -> RGB). These are physical, so silver and gold,
// worked much cooler than steel, only glow a dull red.
const GLOW_COLORS: [number, [number, number, number]][] = [
  [500, [120, 120, 128]], // no visible glow
  [650, [110, 30, 20]], // dull red
  [800, [190, 30, 25]], // cherry red
  [900, [230, 70, 30]], // bright cherry / orange-red
  [1000, [255, 120, 30]], // orange
  [1100, [255, 175, 45]], // orange-yellow
  [1200, [255, 225, 100]], // yellow
  [1400, [255, 245, 200]], // near white (mithril)
];

let state: State = "menu";
let phase: Phase = "hammer";
let timeLeft = 0;
let item: ForgeItem = FORGE_ITEMS[0]; // what is being forged right now
let metal: MetalId = "iron";
let gem: GemId = "ruby";
let repairId: number | null = null; // set while repairing an item instead of forging a new one
let paid = false; // materials for the current piece have been used
let forged = 0; // items forged this round
let legendaries = 0;
let strikes: number[] = []; // value of each hit on the current piece (0..1)
let heatCycle = 0; // which heat of the current piece we are on (0-based)
let marker = 0.5; // 0..1 position along the bar
const held = new Set<string>(); // movement keys currently pressed
let mouseTarget: number | null = null; // bar position under the mouse, if steering by mouse
let zoneCenter = 0.5;
let zoneBaseWidth = 0.18; // golden zone width when the metal is fully hot
let temp = METALS[metal].forgeTemp;
let inForge = false;
let temper = 0; // quench result for the current piece
let edge = 0; // finishing result for the current piece
let grinding = false;
let sharpness = 0;
let stopGrindSound: (() => void) | null = null;
let message = "";
let messageTimer = 0;
let messageColor = "#ffe080";
let hammerAnim = 0; // 1 right after a strike, decays to 0
let energy = maxEnergy();
let endReason = "";
type Particle = { x: number; y: number; vx: number; vy: number; life: number; steam?: boolean };
let sparks: Particle[] = [];
const logo = new Image();
logo.src = `${import.meta.env.BASE_URL}favicon.svg`;

const M = () => METALS[metal];
const isRepair = () => repairId !== null;
const hitsNeeded = () => (isRepair() ? Math.ceil(item.hits / 2) : item.hits);
const heatsNeeded = () => (isRepair() ? 1 : item.heats);
const finishVerb = () => (item.kind === "weapon" ? "sharpen" : "polish");

function flash(text: string, color = "#ffe080", duration = 1): void {
  message = text;
  messageColor = color;
  messageTimer = duration;
}

// ---- Materials ----

function metalAllowed(m: MetalId, f: ForgeItem = item): boolean {
  return isMetalUnlocked(m) && (f.kind !== "jewelry" || METALS[m].jewelryMult !== undefined);
}

function oreNeeded(): number {
  return isRepair() ? 1 : item.ore;
}

function needsGem(): boolean {
  return !isRepair() && item.kind === "jewelry";
}

function missingMaterials(): string | null {
  if (!metalAllowed(metal) && !isRepair()) return item.kind === "jewelry" ? "Jewelry needs silver, gold or mithril" : `${M().label} unlocks at level ${M().level}`;
  if (materialCount(metal) < oreNeeded()) return `Not enough ${M().label.toLowerCase()} ore (need ${oreNeeded()}): buy some at the Trade Market`;
  if (needsGem() && materialCount(gem) < 1) return `You need a ${GEMS[gem].label.toLowerCase()}: buy one at the Trade Market`;
  return null;
}

function payMaterials(): void {
  spendMaterial(metal, oreNeeded());
  if (needsGem()) spendMaterial(gem, 1);
  paid = true;
}

// ---- The piece on the anvil ----

function newZone(): void {
  // Shrinks as the round goes on, and never takes up more than 60% of the item's workable part.
  const workWidth = item.workEnd - item.workStart;
  zoneBaseWidth = Math.min(Math.max(0.07, 0.18 - forged * 0.01) * zoneMult(), workWidth * 0.6);
  zoneCenter = item.workStart + zoneBaseWidth / 2 + Math.random() * (workWidth - zoneBaseWidth);
}

// How workable the metal is: 1 at full forge heat, 0 at the cold limit.
function warmth(): number {
  return Math.min(1, Math.max(0, (temp - M().coldTemp) / (M().forgeTemp - M().coldTemp)));
}

// Hot metal is easier to work: the golden zone shrinks as it cools.
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
  for (let c = 0; c <= cycle; c++) total += Math.ceil((hitsNeeded() - total) / (heatsNeeded() - c));
  return total;
}

// True when this heat's hits are done and the metal must go back in the forge.
function needsReheat(): boolean {
  return phase === "hammer" && strikes.length >= hitsByEndOfHeat(heatCycle) && strikes.length < hitsNeeded();
}

function stopGrinding(): void {
  grinding = false;
  stopGrindSound?.();
  stopGrindSound = null;
}

function resetPiece(): void {
  strikes = [];
  heatCycle = 0;
  phase = "hammer";
  paid = false;
  temper = 0;
  edge = 0;
  sharpness = 0;
  stopGrinding();
  temp = M().forgeTemp; // a fresh blank comes out of the forge hot
  inForge = false;
  marker = clampToItem(marker);
  newZone();
}

// Keeps the chosen item, metal and gem valid (e.g. after a save import or a level change).
function fixSelection(): void {
  if (!isItemUnlocked(item)) item = FORGE_ITEMS.find(isItemUnlocked)!;
  if (!metalAllowed(metal)) metal = METAL_IDS.find((m) => metalAllowed(m)) ?? metal;
}

function startGame(): void {
  state = "playing";
  timeLeft = roundTime();
  energy = maxEnergy();
  legendaries = 0;
  forged = 0;
  sparks = [];
  fixSelection();
  resetPiece();
  marker = (item.workStart + item.workEnd) / 2;
}

function endGame(reason: string): void {
  if (phase !== "hammer") completePiece(); // a piece being quenched or finished still comes out
  stopGrinding();
  state = "over";
  endReason = reason;
  newDay();
}

// ---- Hammering ----

function strike(): void {
  if (inForge || energy <= 0) return;
  if (needsReheat()) {
    flash(`Heat ${heatCycle + 1} done! Reheat (S)`);
    return;
  }
  if (!paid) {
    const missing = missingMaterials();
    if (missing) {
      flash(missing, "#ff8a6a", 2.5);
      sfx.error();
      return;
    }
  }
  hammerAnim = 1;
  energy--;
  if (temp < M().coldTemp) {
    flash("Too cold! Reheat (S)");
    sfx.cold();
    return;
  }

  // Only strikes inside the golden zone shape the metal; a miss does nothing.
  if (Math.abs(marker - zoneCenter) > zoneWidth() / 2) {
    flash("Miss!");
    sfx.miss();
    return;
  }

  if (!paid) payMaterials();
  // Strikes on cooler metal are worth less (down to 60% just above the cold limit).
  const accuracy = 0.6 + 0.4 * warmth();
  strikes.push(accuracy);
  temp = Math.max(ROOM_TEMP, temp - STRIKE_COOL * item.coolMult * M().coolMult * coolMult());
  flash("Hit!");
  sfx.hit();
  shake(3, 0.08);
  burst(400, 250, Math.round(accuracy * 25) + 3, 400);

  if (strikes.length >= hitsNeeded()) hammerDone();
  else newZone();
}

function burst(x: number, y: number, n: number, speed: number, steam = false): void {
  for (let i = 0; i < n; i++) {
    sparks.push({
      x, y, steam,
      vx: (Math.random() - 0.5) * speed,
      vy: -Math.random() * speed * 0.75 - 50,
      life: 0.6 + Math.random() * 0.6,
    });
  }
}

function hammerDone(): void {
  if (isRepair()) {
    completeRepair();
  } else if (item.kind === "weapon" || item.kind === "armor") {
    const [lo, hi] = quenchWindow();
    phase = "quench";
    flash(`Quench it at ${lo}–${hi} °C: press SPACE`, "#9fe3ff", 3);
  } else if (item.kind === "jewelry") {
    startFinish(true);
  } else {
    completePiece();
  }
}

// ---- Quenching: plunge the hot piece into water at the right temperature ----

function quenchWindow(): [number, number] {
  const [lo, hi] = M().quench;
  const centre = (lo + hi) / 2;
  const half = ((hi - lo) / 2) * quenchWidthMult();
  return [Math.round(centre - half), Math.round(centre + half)];
}

function quench(): void {
  if (inForge) return;
  const [lo, hi] = quenchWindow();
  if (temp > hi) {
    temper = -0.1;
    flash("Too hot! The quench left small cracks", "#ff8a6a", 2);
  } else if (temp >= lo) {
    temper = 0.15;
    flash("Perfect quench!", "#9fd86a", 2);
  } else {
    temper = 0;
    flash("Too cool: it stays soft", "#b8a888", 2);
  }
  sfx.quench();
  burst(625, 270, 30, 160, true);
  temp = 60;
  startFinish(false); // keep the quench result on screen; the track below explains the next step
}

// ---- Finishing: hold to sharpen (weapons) or polish (armor, jewelry), release in the green zone ----

function finishZone(): [number, number] {
  const half = 0.09 * finishWidthMult();
  return [0.81 - half, Math.min(0.98, 0.81 + half)];
}

function startFinish(showHint: boolean): void {
  phase = "finish";
  sharpness = 0;
  if (showHint) flash(`Hold SPACE to ${finishVerb()}, release in the green zone`, "#ffe080", 2.5);
}

function beginGrind(): void {
  if (phase !== "finish" || grinding) return;
  grinding = true;
  stopGrindSound = sfx.grind();
}

function endGrind(): void {
  if (!grinding) return;
  stopGrinding();
  const [lo, hi] = finishZone();
  const sharpen = item.kind === "weapon";
  let result: string;
  if (sharpness > FINISH_OVERDONE) {
    edge = -0.05;
    result = sharpen ? "Over-ground!" : "Scratched!";
  } else if (sharpness >= lo && sharpness <= hi) {
    edge = 0.1;
    result = sharpen ? "Razor sharp!" : "Brilliant polish!";
  } else if (sharpness > hi) {
    edge = 0.02;
    result = "A little overdone.";
  } else if (sharpness >= 0.5) {
    edge = 0.05;
    result = sharpen ? "Sharp." : "Polished.";
  } else {
    edge = 0;
    result = sharpen ? "Still dull." : "Rough finish.";
  }
  completePiece(result, edge > 0.05 ? "#9fd86a" : edge < 0 ? "#ff8a6a" : "#ffe080");
}

// ---- Results ----

// `result` describes the finishing step (if any) and leads the message about the new item.
function completePiece(result = "", resultColor = "#ffe080"): void {
  stopGrinding();
  const quality = strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : 0.6;
  // Quality is only revealed once the item is finished.
  const legendary = Math.random() < legendaryChance();
  const tier: Tier = legendary ? "legendary" : "normal";
  const trait = legendary && item.kind !== "trade" ? randomTrait(item.kind) : undefined;
  const g = item.kind === "jewelry" ? gem : undefined;
  const value = computeValue(item.type, metal, g, quality, temper, edge, legendary);
  const fields = { type: item.type, tier, value, metal, gem: g, quality, temper, edge, trait, durability: MAX_DURABILITY };
  const name = itemName({ id: 0, ...fields });
  if (legendary) {
    legendaries++;
    sfx.legendary();
    shake(8, 0.4);
    app.flash = 0.7;
    burst(400, 235, 80, 700);
  } else {
    sfx.done();
  }
  if (addItem(fields)) {
    if (legendary) flash(`LEGENDARY ${item.label.toLowerCase()}${trait ? ` (${TRAITS[trait].label})` : ""}! Worth ${value}g`, LEGENDARY_COLOR, 3);
    else flash(`${result ? result + " " : ""}${name}, worth ${value}g`, result ? resultColor : "#ffe080", 2.5);
  } else {
    addGold(value);
    sfx.coin();
    flash(`Inventory full! ${name} sold for ${value}g`, legendary ? LEGENDARY_COLOR : "#ffe080", 2.5);
  }
  addXp(item.hits * (item.kind === "trade" ? 2 : 4) * (legendary ? 3 : 1));
  forged++;
  resetPiece();
}

function completeRepair(): void {
  const target = repairId !== null ? findItem(repairId) : undefined;
  if (target) {
    target.durability = MAX_DURABILITY;
    persist();
    flash(`${itemName(target)} repaired!`, "#9fd86a", 2);
    addXp(8);
  }
  sfx.done();
  repairId = null;
  resetPiece();
}

// Called from the Inventory: puts a worn item on the anvil. Returns an error message, or null.
export function startRepair(id: number): string | null {
  const target = findItem(id);
  if (!target) return "That item is gone.";
  if (target.durability >= MAX_DURABILITY) return "That item doesn't need repairs.";
  if (state === "playing" && (strikes.length > 0 || phase !== "hammer")) return "Finish the piece on the anvil first.";
  if (state !== "playing") startGame();
  item = forgeItemFor(target.type);
  metal = target.metal;
  repairId = id;
  resetPiece();
  marker = (item.workStart + item.workEnd) / 2;
  flash(`Repairing: ${plural(hitsNeeded(), "hit")}, 1 ${M().label.toLowerCase()} ore`, "#9fe3ff", 2.5);
  return null;
}

// ---- Choosing what to forge ----

// Only allowed between pieces, so no progress (or material) is lost.
function canChange(): boolean {
  if (strikes.length > 0 || phase !== "hammer") {
    flash(isRepair() ? "Finish the repair first!" : `Finish the ${item.label.toLowerCase()} first!`);
    sfx.error();
    return false;
  }
  return true;
}

function chooseItem(index: number): void {
  const next = FORGE_ITEMS[index];
  if (!next || (next === item && !isRepair()) || !canChange()) return;
  if (!isItemUnlocked(next)) {
    flash(`${next.label} unlocks at level ${next.level} (or find its blueprint in a dungeon)`, "#ff8a6a", 2.5);
    sfx.error();
    return;
  }
  repairId = null;
  item = next;
  if (!metalAllowed(metal)) metal = METAL_IDS.find((m) => metalAllowed(m)) ?? metal;
  resetPiece();
  sfx.click();
  if (state === "playing") flash(`Now forging: ${item.label}`);
}

function chooseMetal(m: MetalId): void {
  if (m === metal || !canChange()) return;
  if (isRepair()) {
    flash("Repairs use the item's own metal", "#ff8a6a");
    return;
  }
  if (!metalAllowed(m)) {
    flash(!isMetalUnlocked(m) ? `${METALS[m].label} unlocks at level ${METALS[m].level}` : "Jewelry needs silver, gold or mithril", "#ff8a6a", 2);
    sfx.error();
    return;
  }
  metal = m;
  resetPiece();
  sfx.click();
}

function chooseGem(g: GemId): void {
  if (g === gem || !canChange()) return;
  gem = g;
  sfx.click();
}

// ---- Input ----

const LEFT_KEYS = ["KeyA", "ArrowLeft"];
const RIGHT_KEYS = ["KeyD", "ArrowRight"];
const REHEAT_KEYS = ["KeyS", "ArrowDown"];
const ITEM_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"];

function reheat(): void {
  if (state === "playing" && phase !== "finish" && !inForge && temp < M().forgeTemp) {
    inForge = true;
    sfx.reheat();
  }
}

function onAction(): void {
  if (state !== "playing") {
    startGame();
    return;
  }
  if (phase === "quench") quench();
  else if (phase === "finish") beginGrind();
  else {
    strike();
    // Checked after the strike so a piece finished on the last swing still counts.
    if (energy <= 0 && phase === "hammer") endGame("Out of energy!");
  }
}

export function forgeKeyDown(e: KeyboardEvent): void {
  if (ITEM_KEYS.includes(e.code)) {
    chooseItem(ITEM_KEYS.indexOf(e.code));
  } else if (e.code === "Space" || e.code === "Enter") {
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
}

export function forgeKeyUp(e: KeyboardEvent): void {
  held.delete(e.code);
  if (e.code === "Space" || e.code === "Enter") endGrind();
}

export function forgeLeave(): void {
  held.clear();
  mouseTarget = null;
  endGrind();
}

export function forgePointerMove(p: Point): void {
  mouseTarget = clampToItem((p.x - BAR.x) / BAR.w);
}

export function forgePointerLeave(): void {
  mouseTarget = null;
}

export function forgePointerUp(): void {
  endGrind();
}

export function forgeClick(p: Point): void {
  if (state === "playing") {
    const i = pickerHit(p);
    if (i >= 0) return chooseItem(i);
    const m = metalHit(p);
    if (m) return chooseMetal(m);
    const g = gemHit(p);
    if (g) return chooseGem(g);
    // Strike exactly where the player clicked, even if no frame has run since the last move.
    mouseTarget = clampToItem((p.x - BAR.x) / BAR.w);
    if (phase === "hammer" && !inForge) marker = mouseTarget;
  }
  onAction();
}

// True when the pointer is over something clickable (for the hand cursor).
export function forgeHover(p: Point): boolean {
  return state === "playing" && (pickerHit(p) >= 0 || metalHit(p) !== null || gemHit(p) !== null);
}

// ---- Update ----

export function forgeUpdate(dt: number): void {
  hammerAnim = Math.max(0, hammerAnim - dt * 4);
  messageTimer = Math.max(0, messageTimer - dt);
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += (s.steam ? -80 : 600) * dt;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);

  if (state !== "playing") return;

  if (inForge) {
    // The metal stays in the fire until it is fully hot again; no steering meanwhile.
    temp = Math.min(M().forgeTemp, temp + REHEAT_RATE * reheatMult() * dt);
    if (temp >= M().forgeTemp) {
      inForge = false;
      if (needsReheat()) heatCycle++; // the next heat's hits can start
    }
  } else if (phase !== "finish") {
    // In the air a finished piece (waiting to be quenched) cools a little faster than on the anvil.
    const rate = COOL_RATE * item.coolMult * M().coolMult * coolMult() * (phase === "quench" ? 1.5 : 1);
    temp = Math.max(ROOM_TEMP, temp - rate * dt);
    if (phase === "hammer") {
      const left = LEFT_KEYS.some((k) => held.has(k));
      const right = RIGHT_KEYS.some((k) => held.has(k));
      const move = (right ? 1 : 0) - (left ? 1 : 0);
      if (move !== 0) marker = clampToItem(marker + move * MARKER_SPEED * dt);
      else if (mouseTarget !== null) marker = mouseTarget; // follows the pointer directly
    }
  }

  if (grinding) {
    sharpness += GRIND_RATE * dt;
    if (Math.random() < 0.6) burst(440, 218, 1, 300);
    if (sharpness >= FINISH_OVERDONE + 0.08) endGrind(); // held far too long
  }

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame("Time's up!");
  }
}

// ---- Drawing ----

// Glow colour of hot metal at a given temperature, interpolated from GLOW_COLORS.
function heatColor(t: number): string {
  let i = 1;
  while (i < GLOW_COLORS.length - 1 && t > GLOW_COLORS[i][0]) i++;
  const [t0, c0] = GLOW_COLORS[i - 1];
  const [t1, c1] = GLOW_COLORS[i];
  const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  const [r, g, b] = c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
  return `rgb(${r},${g},${b})`;
}

// Below a visible glow the piece shows its own metal colour.
function pieceColor(): string {
  return temp < 520 ? M().color : heatColor(temp);
}

function drawBlade(x: number, y: number): void {
  ctx.fillStyle = pieceColor();
  ctx.fillRect(x, y, 180, 10);
  ctx.beginPath(); ctx.moveTo(x + 180, y); ctx.lineTo(x + 205, y + 5); ctx.lineTo(x + 180, y + 10); ctx.fill();
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(x - 25, y - 2, 25, 14);
}

function drawScene(): void {
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

  // Quench tank (a barrel of water) on the right
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(590, 280, 70, 65);
  ctx.fillStyle = "#3a2a22";
  ctx.fillRect(590, 295, 70, 5);
  ctx.fillRect(590, 325, 70, 5);
  ctx.fillStyle = "#3d6f8f";
  ctx.fillRect(594, 280, 62, 8);

  // Anvil
  ctx.fillStyle = "#4a4a52";
  ctx.beginPath();
  ctx.moveTo(270, 260); ctx.lineTo(530, 260); ctx.lineTo(560, 240);
  ctx.lineTo(240, 240); ctx.closePath(); ctx.fill();
  ctx.fillRect(270, 260, 260, 25);
  ctx.fillRect(340, 285, 120, 40);
  ctx.fillRect(300, 325, 200, 20);

  if (state === "playing" && phase === "finish") drawGrindstone();
  else if (inForge) drawBlade(60, 272); // in the fire while reheating
  else drawBlade(310, 230);

  // Hammer (swings down on strike); put away while finishing at the grindstone
  if (state === "playing" && phase === "finish") return drawParticles();
  ctx.save();
  ctx.translate(560, 120);
  ctx.rotate(-0.6 + hammerAnim * 0.9 - (state === "playing" ? 0 : 0.2));
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(-150, -6, 150, 12);
  ctx.fillStyle = "#777";
  ctx.fillRect(-175, -25, 40, 50);
  ctx.restore();
  drawParticles();
}

function drawParticles(): void {
  for (const s of sparks) {
    const alpha = Math.min(1, s.life * 2);
    ctx.fillStyle = s.steam ? `rgba(220,230,240,${alpha * 0.6})` : `rgba(255,${180 + Math.random() * 75},60,${alpha})`;
    const size = s.steam ? 6 : 3;
    ctx.fillRect(s.x, s.y, size, size);
  }
}

// The grindstone used for sharpening and polishing, spinning while held.
function drawGrindstone(): void {
  const cx = 470;
  const cy = 200;
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(cx - 6, cy, 12, 55); // stand
  ctx.fillStyle = "#8a8a92";
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5a5a62";
  ctx.lineWidth = 3;
  const spin = grinding ? performance.now() / 60 : 0;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33);
    ctx.stroke();
  }
  ctx.save(); // the piece pressed against the wheel from the left
  ctx.translate(cx - 34, cy + 16);
  ctx.rotate(0.25);
  ctx.fillStyle = M().color;
  ctx.fillRect(-170, -5, 170, 10);
  ctx.restore();
}

function drawBolt(x: number, y: number, size: number): void {
  const pts = [[0.6, 0], [0.1, 0.55], [0.45, 0.55], [0.3, 1], [0.9, 0.4], [0.55, 0.4], [0.75, 0]];
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * size, y + py * size));
  ctx.closePath();
  ctx.fillStyle = "#ffd60a";
  ctx.fill();
}

function gaugeRange(): [number, number] {
  return [Math.max(ROOM_TEMP, M().coldTemp - 300), M().forgeTemp];
}

function drawHeatGauge(): void {
  const { x, y, w, h } = GAUGE;
  const [min, max] = gaugeRange();
  const level = (t: number) => Math.min(1, Math.max(0, (t - min) / (max - min)));
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = "#2a1c18";
  ctx.fillRect(x, y, w, h);
  const fill = level(temp) * h;
  ctx.fillStyle = heatColor(temp);
  ctx.fillRect(x, y + h - fill, w, fill);
  if (phase === "quench") {
    // Quench window, labelled on the left
    const [lo, hi] = quenchWindow();
    const top = y + h - level(hi) * h;
    const bottom = y + h - level(lo) * h;
    ctx.fillStyle = "rgba(120,220,160,0.45)";
    ctx.fillRect(x - 6, top, w + 12, bottom - top);
    drawText("QUENCH", x - 10, (top + bottom) / 2 + 4, 11, "#9fd86a", "right");
  } else {
    // Cold limit line, labelled on the left
    const coldY = y + h - level(M().coldTemp) * h;
    ctx.fillStyle = "#6ab0ff";
    ctx.fillRect(x - 6, coldY - 1, w + 12, 2);
    drawText(`${M().coldTemp}°`, x - 10, coldY + 5, 13, "#6ab0ff", "right");
  }
  // Current temperature, to the right of the bar at the fill level
  const tempY = Math.min(y + h, Math.max(y + 10, y + h - fill + 6));
  drawText(`${Math.round(temp)}°C`, x + w + 8, tempY, 15, temp < M().coldTemp && phase === "hammer" ? "#6ab0ff" : "#f5e6c8", "left");
  drawText("HEAT", x + w / 2, y - 12, 16);
  if (inForge) drawText("Heating...", x + w / 2, y + h + 28, 16, "#ffb347");
  else if (phase === "hammer" && (temp < M().coldTemp || needsReheat())) drawText("Press S!", x + w / 2, y + h + 28, 16, "#6ab0ff");
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
  const totalW = (hitsNeeded() - 1) * PIP + (heatsNeeded() - 1) * GAP;
  let px = W / 2 - totalW / 2;
  const py = BAR.y + 74; // below the tallest item shapes
  let cycle = 0;
  for (let i = 0; i < hitsNeeded(); i++) {
    if (i > 0 && i === hitsByEndOfHeat(cycle)) {
      const fx = px + (GAP - PIP) / 2; // midway between the last pip of this heat and the next
      px += GAP;
      // Lit once the metal has been reheated for the next heat
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

function drawFlame(x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 11);
  ctx.quadraticCurveTo(x + 9, y + 1, x + 5, y + 7);
  ctx.quadraticCurveTo(x, y + 11, x - 5, y + 7);
  ctx.quadraticCurveTo(x - 9, y + 1, x, y - 11);
  ctx.fillStyle = color;
  ctx.fill();
}

// A horizontal track used by the quench and finishing steps, in place of the strike bar.
function drawTrack(fraction: number, zone: [number, number], over?: number): void {
  const r: Rect = { x: BAR.x, y: BAR.y, w: BAR.w, h: BAR.h };
  ctx.fillStyle = "#111";
  ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.fillStyle = "#2a1c18";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (over !== undefined) {
    ctx.fillStyle = "rgba(200,60,40,0.6)";
    ctx.fillRect(r.x + over * r.w, r.y, r.w * (1 - over), r.h);
  }
  ctx.fillStyle = "rgba(120,220,160,0.75)";
  ctx.fillRect(r.x + zone[0] * r.w, r.y, (zone[1] - zone[0]) * r.w, r.h);
  const mx = r.x + Math.max(0, Math.min(1, fraction)) * r.w;
  ctx.fillStyle = "#fff";
  ctx.fillRect(mx - 2, r.y - 10, 4, r.h + 20);
}

function drawQuench(): void {
  const [min, max] = gaugeRange();
  const at = (t: number) => (t - min) / (max - min);
  const [lo, hi] = quenchWindow();
  drawTrack(at(temp), [at(lo), at(hi)]);
  drawText(`${min}°`, BAR.x, BAR.y + 50, 12, "#8a7a68", "left");
  drawText(`${max}°`, BAR.x + BAR.w, BAR.y + 50, 12, "#8a7a68", "right");
  drawText(`Quench at ${lo}–${hi} °C: press SPACE or click when the marker is in the green`, W / 2, BAR.y + 72, 14, "#9fe3ff");
}

function drawFinish(): void {
  // The track runs to 110%: the last part (red) ruins the edge.
  const scale = FINISH_OVERDONE + 0.1;
  const [lo, hi] = finishZone();
  drawTrack(sharpness / scale, [lo / scale, hi / scale], FINISH_OVERDONE / scale);
  drawText(`Hold SPACE or the mouse button to ${finishVerb()}, release in the green zone`, W / 2, BAR.y + 72, 14, "#ffe080");
}

// Hammer -> Quench -> Sharpen/Polish, with the current step highlighted.
function drawSteps(): void {
  const steps: { id: Phase; label: string }[] = [{ id: "hammer", label: isRepair() ? "Repair" : "Hammer" }];
  if (!isRepair() && (item.kind === "weapon" || item.kind === "armor")) steps.push({ id: "quench", label: "Quench" });
  if (!isRepair() && item.kind !== "trade") steps.push({ id: "finish", label: item.kind === "weapon" ? "Sharpen" : "Polish" });
  if (steps.length < 2) return;
  const order: Phase[] = ["hammer", "quench", "finish"];
  const y = BAR.y - 42; // above the tallest item shapes and fittings
  const sep = "  ›  ";
  const total = steps.reduce((sum, s) => sum + textWidth(s.label, 13), 0) + textWidth(sep, 13) * (steps.length - 1);
  let x = W / 2 - total / 2;
  steps.forEach((s, i) => {
    const done = order.indexOf(s.id) < order.indexOf(phase);
    const current = s.id === phase;
    drawText(s.label, x, y, 13, current ? "#ffe080" : done ? "#9fd86a" : "#8a7a68", "left");
    x += textWidth(s.label, 13);
    if (i < steps.length - 1) {
      drawText(sep, x, y, 13, "#8a7a68", "left");
      x += textWidth(sep, 13);
    }
  });
}

// ---- Item, metal and gem pickers along the top ----

const PICKER = { size: 34, gap: 4, y: 10 };
const PICKER_X = W / 2 - (FORGE_ITEMS.length * (PICKER.size + PICKER.gap) - PICKER.gap) / 2;
const CHIP = { w: 82, h: 22, gap: 4, metalY: 86, gemY: 112 };

function pickerRect(i: number): Rect {
  return { x: PICKER_X + i * (PICKER.size + PICKER.gap), y: PICKER.y, w: PICKER.size, h: PICKER.size };
}

function pickerHit(p: Point): number {
  return FORGE_ITEMS.findIndex((_, i) => inRect(p, pickerRect(i)));
}

function chipRect(i: number, count: number, y: number, w = CHIP.w): Rect {
  const x0 = W / 2 - (count * (w + CHIP.gap) - CHIP.gap) / 2;
  return { x: x0 + i * (w + CHIP.gap), y, w, h: CHIP.h };
}

const GEM_CHIP_W = 100;

function metalHit(p: Point): MetalId | null {
  const i = METAL_IDS.findIndex((_, k) => inRect(p, chipRect(k, METAL_IDS.length, CHIP.metalY)));
  return i >= 0 ? METAL_IDS[i] : null;
}

function gemHit(p: Point): GemId | null {
  if (item.kind !== "jewelry" || isRepair()) return null;
  const i = GEM_IDS.findIndex((_, k) => inRect(p, chipRect(k, GEM_IDS.length, CHIP.gemY, GEM_CHIP_W)));
  return i >= 0 ? GEM_IDS[i] : null;
}

function drawChip(r: Rect, label: string, count: number, selected: boolean, enabled: boolean, draw: (x: number, y: number) => void): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 5);
  ctx.fillStyle = selected ? "#4a3420" : inRect(input.pointer, r) && enabled ? "#3a2a22" : "rgba(26,18,16,0.85)";
  ctx.fill();
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? "#e0a030" : "#5a4030";
  ctx.stroke();
  ctx.globalAlpha = enabled ? 1 : 0.35;
  draw(r.x + 3, r.y + 3);
  drawText(label, r.x + 22, r.y + 15, 10, "#f5e6c8", "left");
  drawText(`${count}`, r.x + r.w - 5, r.y + 15, 10, count > 0 ? "#ffd700" : "#8a7a68", "right");
  ctx.globalAlpha = 1;
}

function drawPickers(): void {
  FORGE_ITEMS.forEach((f, i) => {
    const r = pickerRect(i);
    const current = f === item;
    const unlocked = isItemUnlocked(f);
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 6);
    ctx.fillStyle = current ? "#4a3420" : inRect(input.pointer, r) ? "#3a2a22" : "rgba(26,18,16,0.85)";
    ctx.fill();
    ctx.lineWidth = current ? 2.5 : 1.5;
    ctx.strokeStyle = current ? "#e0a030" : "#5a4030";
    ctx.stroke();
    ctx.globalAlpha = unlocked ? 1 : 0.3;
    drawItemIcon(ctx, f.type, false, r.x + 3, r.y + 3, r.w - 6, current ? M().color : undefined, current && f.kind === "jewelry" ? GEMS[gem].color : undefined);
    ctx.globalAlpha = 1;
    if (!unlocked) drawText(`Lv${f.level}`, r.x + r.w / 2, r.y + r.h / 2 + 4, 10, "#ffb347");
    else if (i < 10) drawText(`${(i + 1) % 10}`, r.x + 3, r.y + 10, 8, "#8a7a68", "left");
  });

  // Details of the hovered item, or of the current one
  const shown = FORGE_ITEMS[pickerHit(input.pointer)] ?? item;
  const title = isRepair() && shown === item ? `Repairing: ${item.label}` : shown.label;
  drawText(title, W / 2, 60, 15, shown === item ? "#e0a030" : "#f5e6c8");
  const detail = !isItemUnlocked(shown)
    ? `Unlocks at level ${shown.level}, or with a blueprint from a dungeon`
    : `${shown.ore} ore${shown.kind === "jewelry" ? " + 1 gem" : ""} · ${plural(shown.hits, "hit")} · ${plural(shown.heats, "heat")} · ${shown.note}`;
  drawText(detail, W / 2, 76, 12, "#b8a888");

  METAL_IDS.forEach((m, i) => {
    const r = chipRect(i, METAL_IDS.length, CHIP.metalY);
    const ok = metalAllowed(m) || (isRepair() && m === metal);
    drawChip(r, isMetalUnlocked(m) ? METALS[m].label : `Lv${METALS[m].level}`, materialCount(m), m === metal, ok,
      (x, y) => drawMaterialIcon(ctx, m, x, y, 16));
  });
  if (item.kind === "jewelry" && !isRepair()) {
    GEM_IDS.forEach((g, i) => {
      const r = chipRect(i, GEM_IDS.length, CHIP.gemY, GEM_CHIP_W);
      drawChip(r, GEMS[g].label, materialCount(g), g === gem, true, (x, y) => drawMaterialIcon(ctx, g, x, y, 16));
    });
  }
}

function drawHud(): void {
  drawText(`Forged: ${forged}`, 20, 40, 22, "#f5e6c8", "left");
  drawBolt(18, 52, 20);
  drawText(`${energy}/${maxEnergy()}`, 42, 69, 18, "#ffd60a", "left");
  drawText(`★ ${Math.round(legendaryChance() * 100)}% legendary`, 20, 96, 14, LEGENDARY_COLOR, "left");
  drawText(`${Math.ceil(timeLeft)}s`, W - 20, 40, 26, timeLeft < 10 ? "#ff6040" : "#f5e6c8", "right");
  drawText(`Day ${save.day}`, W - 20, 64, 15, "#b8a888", "right");
}

export function drawForgeScreen(): void {
  drawScene();
  if (state === "menu") {
    if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, W / 2 - 45, 20, 90, 90);
    drawText("Blacksmith Simulator", W / 2, 150, 48);
    drawText("Pick an item and metal, then steer the marker (mouse, A/D or arrows)", W / 2, 360, 18);
    drawText("and press SPACE or click to strike in the golden zone. S reheats the metal.", W / 2, 383, 18);
    drawText("Weapons and armor are then quenched and sharpened or polished.", W / 2, 406, 18);
    drawText(`Rounds last ${roundTime()}s with ${maxEnergy()} energy. Buy ore at the Trade Market.`, W / 2, 429, 18);
    drawText("Press SPACE or click to start", W / 2, 475, 24, "#ffb347");
    return;
  }

  drawHud();
  if (state === "playing") {
    drawPickers();
    drawSteps();
    if (phase === "hammer") drawBar();
    else if (phase === "quench") drawQuench();
    else drawFinish();
    drawHeatGauge();
    if (messageTimer > 0) {
      const fade = Math.min(1, messageTimer); // longer messages hold, then fade over the last second
      ctx.globalAlpha = fade;
      drawText(message, W / 2, 160 - (1 - fade) * 20, message.length > 34 ? 22 : 30, messageColor);
      ctx.globalAlpha = 1;
    }
  } else {
    dimScreen(0.6);
    drawText(endReason, W / 2, 170, 52);
    const legendaryNote = legendaries > 0 ? ` (${legendaries} legendary)` : "";
    drawText(`You forged ${plural(forged, "item")}${legendaryNote}.`, W / 2, 230, 24);
    drawText("Equip them in your Inventory or sell them at the Trade Market.", W / 2, 266, 20, "#b8a888");
    drawText(`Day ${save.day} begins: new prices and customer orders at the market.`, W / 2, 296, 18, "#9fe3ff");
    drawText("Press SPACE or click to forge again", W / 2, 350, 24, "#ffb347");
  }
}
