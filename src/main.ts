// Blacksmith Simulator — steer the marker into the sweet spot and strike the hot blade.

type State = "menu" | "playing" | "over";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// The canvas renders at a fixed 1280x720. The scene is laid out in 800x500
// layout units, scaled up to fill the screen height and centred horizontally.
const SCREEN_W = 1280;
const SCREEN_H = 720;
const W = 800;
const H = 500;
const SCALE = SCREEN_H / H;
const OFFSET_X = (SCREEN_W - W * SCALE) / 2;
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;

const FPS = 60;
const FRAME_MS = 1000 / FPS;

const ROUND_TIME = 60; // seconds
const BASE_MAX_ENERGY = 100; // each hammer swing, hit or miss, costs 1
const LEGENDARY_PRICE_MULTIPLIER = 5;
const LEGENDARY_COLOR = "#ff9f1c";
const STRIKES_PER_SWORD = 3;
const BAR = { x: 150, y: 400, w: 500, h: 28 };

// The item being forged, drawn as the strike bar. Positions along the bar run
// 0..1; the marker and golden zone stay within the workable part of the item.
interface ForgeItem {
  name: string;
  workStart: number;
  workEnd: number;
  body: Path2D; // the part that gets hammered; the golden zone is clipped to it
  drawFittings(): void; // parts that are not forged, such as a hilt
}

const SWORD: ForgeItem = (() => {
  const cy = BAR.y + BAR.h / 2;
  const bladeX = BAR.x + 67;
  const tipX = BAR.x + 460;
  const body = new Path2D();
  body.moveTo(bladeX, BAR.y);
  body.lineTo(tipX, BAR.y);
  body.lineTo(BAR.x + BAR.w, cy);
  body.lineTo(tipX, BAR.y + BAR.h);
  body.lineTo(bladeX, BAR.y + BAR.h);
  body.closePath();
  return {
    name: "sword",
    workStart: (bladeX - BAR.x) / BAR.w,
    workEnd: (tipX - BAR.x) / BAR.w,
    body,
    drawFittings() {
      ctx.fillStyle = "#6b4423"; // grip
      ctx.fillRect(BAR.x + 15, cy - 7, 40, 14);
      ctx.fillStyle = "#c9a227"; // crossguard and pommel
      ctx.fillRect(bladeX - 12, BAR.y - 12, 12, BAR.h + 24);
      ctx.beginPath();
      ctx.arc(BAR.x + 9, cy, 9, 0, Math.PI * 2);
      ctx.fill();
    },
  };
})();

let item: ForgeItem = SWORD;
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
let gold = 0;
let swords = 0;
let strikes: number[] = []; // accuracy of each strike on the current sword (0..1)
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
let best = Number(safeGet("blacksmith-best") ?? 0);
let maxEnergy = BASE_MAX_ENERGY; // can be raised later (e.g. by upgrades)
let energy = maxEnergy;
let helpOpen = false; // the game is paused while the help panel is shown
// Help button in the top-right corner (layout units; sits just outside the 800-wide layout).
const HELP_BUTTON = { x: 822, y: 30, r: 16 };
let legendaryChance = 0.05; // chance (0..1) that a finished sword turns out legendary
let legendaries = 0;
let endReason = ""; // headline on the game-over screen
const logo = new Image();
logo.src = `${import.meta.env.BASE_URL}favicon.svg`;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function newZone(): void {
  zoneBaseWidth = Math.max(0.07, 0.18 - swords * 0.01);
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

function startGame(): void {
  state = "playing";
  timeLeft = ROUND_TIME;
  gold = 0;
  energy = maxEnergy;
  legendaries = 0;
  swords = 0;
  strikes = [];
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
  temp = Math.max(ROOM_TEMP, temp - STRIKE_COOL);
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

  if (strikes.length >= STRIKES_PER_SWORD) {
    const quality = strikes.reduce((a, b) => a + b, 0) / strikes.length;
    let price = Math.round(quality * quality * 100);
    // Quality is only revealed once the sword is finished.
    const legendary = Math.random() < legendaryChance;
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
      flash(`LEGENDARY sword! Sold for ${price}g!`, LEGENDARY_COLOR, 2.5);
    } else {
      flash(`Sword sold for ${price}g!`);
    }
    gold += price;
    swords++;
    strikes = [];
    temp = FORGE_TEMP; // a fresh blank comes out of the forge hot
  }
  newZone();
}

function onAction(): void {
  if (state === "playing") {
    strike();
    // Checked after the strike so a sword finished on the last swing still sells.
    if (energy <= 0) endGame("Out of energy!");
  } else {
    startGame();
  }
}

const LEFT_KEYS = ["KeyA", "ArrowLeft"];
const RIGHT_KEYS = ["KeyD", "ArrowRight"];
const REHEAT_KEYS = ["KeyS", "ArrowDown"];

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
// Converts a pointer event to layout units (the canvas may also be scaled by CSS).
function toLayout(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const screenX = ((e.clientX - rect.left) / rect.width) * SCREEN_W;
  const screenY = ((e.clientY - rect.top) / rect.height) * SCREEN_H;
  return { x: (screenX - OFFSET_X) / SCALE, y: screenY / SCALE };
}

function overHelpButton(p: { x: number; y: number }): boolean {
  return Math.hypot(p.x - HELP_BUTTON.x, p.y - HELP_BUTTON.y) <= HELP_BUTTON.r + 4;
}

canvas.addEventListener("pointerdown", (e) => {
  if (overHelpButton(toLayout(e))) helpOpen = !helpOpen;
  else if (helpOpen) helpOpen = false;
  else onAction();
});

// Mouse steering: the marker follows the pointer's position along the bar.
canvas.addEventListener("pointermove", (e) => {
  const p = toLayout(e);
  canvas.style.cursor = overHelpButton(p) ? "pointer" : "";
  mouseTarget = clampToItem((p.x - BAR.x) / BAR.w);
});
canvas.addEventListener("pointerleave", () => (mouseTarget = null));

function update(dt: number): void {
  if (helpOpen) return;
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
    if (temp >= FORGE_TEMP) inForge = false;
  } else {
    temp = Math.max(ROOM_TEMP, temp - COOL_RATE * dt);
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
  if (gold > best) {
    best = gold;
    safeSet("blacksmith-best", String(best));
  }
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
  const cy = 260 * SCALE;
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
  else if (temp < COLD_TEMP) drawText("Press S!", x + w / 2, y + h + 28, 16, "#6ab0ff");
}

function drawBar(): void {
  item.drawFittings();
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
  ctx.fillRect(zx, BAR.y, zw * BAR.w, BAR.h);
  ctx.restore();

  const mx = BAR.x + marker * BAR.w;
  ctx.fillStyle = "#fff";
  ctx.fillRect(mx - 2, BAR.y - 10, 4, BAR.h + 20);

  // Strike pips
  for (let i = 0; i < STRIKES_PER_SWORD; i++) {
    ctx.beginPath();
    ctx.arc(400 - 30 + i * 30, BAR.y + 60, 8, 0, Math.PI * 2);
    ctx.fillStyle = i < strikes.length ? "#e0a030" : "#3a2a22";
    ctx.fill();
  }
}

function drawVersion(): void {
  ctx.font = "14px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(245,230,200,0.5)";
  ctx.fillText(`v${__APP_VERSION__}`, W - 10, H - 10);
}

function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground();
  ctx.setTransform(SCALE, 0, 0, SCALE, OFFSET_X, 0);
  drawForge();
  drawScreen();
  drawVersion();
  if (helpOpen) drawHelp();
  drawHelpButton(); // on top of the help panel's dimming, so it stays clickable-looking
}

function drawHelpButton(): void {
  const { x, y, r } = HELP_BUTTON;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = helpOpen ? "#e0a030" : "#2b1d18";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#e0a030";
  ctx.stroke();
  drawText("?", x, y + 7, 20, helpOpen ? "#2b1d18" : "#e0a030");
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
  drawText("Mouse, A/D or ←/→: move the marker", left, py + 112, 16, "#f5e6c8", "left");
  drawText("SPACE or click: strike (hits only count in the golden zone)", left, py + 134, 16, "#f5e6c8", "left");
  drawText("S or ↓: reheat the blade in the forge      H: open/close help", left, py + 156, 16, "#f5e6c8", "left");

  drawText("Item tiers", left, py + 200, 20, "#e0a030", "left");
  drawText("Every item you forge has a tier, revealed only once it is finished.", left, py + 227, 16, "#f5e6c8", "left");

  drawText("Normal", left, py + 262, 18, "#f5e6c8", "left");
  drawText("The usual result. Sells for up to 100g: hits on hotter metal", left + 20, py + 286, 16, "#b8a888", "left");
  drawText("make it worth more.", left + 20, py + 306, 16, "#b8a888", "left");

  drawText("★ Legendary", left, py + 341, 18, LEGENDARY_COLOR, "left");
  drawText(`Rare. Each finished item has a ${Math.round(legendaryChance * 100)}% chance (your ★ stat)`, left + 20, py + 365, 16, "#b8a888", "left");
  drawText(`to become legendary. Sells for ${LEGENDARY_PRICE_MULTIPLIER}× the normal price.`, left + 20, py + 385, 16, "#b8a888", "left");

  drawText("Click anywhere or press H to close", W / 2, py + ph - 18, 16, "#ffb347");
}

function drawScreen(): void {
  if (state === "menu") {
    if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, W / 2 - 45, 20, 90, 90);
    drawText("Blacksmith Simulator", W / 2, 150, 48);
    drawText("Steer the marker with the mouse, A/D or the arrow keys,", W / 2, 360, 20);
    drawText("then press SPACE or click to strike in the golden zone.", W / 2, 385, 20);
    drawText("The blade cools down: press S or ↓ to reheat it in the forge.", W / 2, 410, 20);
    drawText(`3 hits forge a sword. You have ${ROUND_TIME} seconds and ${maxEnergy} energy (1 per swing).`, W / 2, 435, 20);
    drawText("Press SPACE or click to start", W / 2, 475, 24, "#ffb347");
    return;
  }

  drawText(`Gold: ${gold}`, 20, 40, 26, "#ffd700", "left");
  drawText(`Swords: ${swords}`, 20, 72, 20, "#f5e6c8", "left");
  drawBolt(18, 84, 22);
  drawText(`★ ${Math.round(legendaryChance * 100)}% legendary`, 20, 134, 18, LEGENDARY_COLOR, "left");
  drawText(`${energy}/${maxEnergy}`, 44, 103, 20, "#ffd60a", "left");
  drawText(`${Math.ceil(timeLeft)}s`, W - 20, 40, 26, timeLeft < 10 ? "#ff6040" : "#f5e6c8", "right");
  drawText(`Best: ${best}`, W - 20, 72, 18, "#b8a888", "right");

  if (state === "playing") {
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
    drawText(`You forged ${swords} swords${legendaryNote} and earned ${gold} gold.`, W / 2, 230, 24);
    drawText(gold >= best && gold > 0 ? "New best!" : `Best: ${best}`, W / 2, 270, 22, "#ffd700");
    drawText("Press SPACE or click to play again", W / 2, 340, 24, "#ffb347");
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
