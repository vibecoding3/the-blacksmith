// Blacksmith Simulator — steer the marker into the sweet spot and strike the hot blade.

type State = "menu" | "playing" | "over";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const W = canvas.width;
const H = canvas.height;

const ROUND_TIME = 60; // seconds
const STRIKES_PER_SWORD = 3;
const BAR = { x: 150, y: 400, w: 500, h: 28 };
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
let hammerAnim = 0; // 1 right after a strike, decays to 0
let sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
let best = Number(safeGet("blacksmith-best") ?? 0);
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
  zoneCenter = zoneBaseWidth / 2 + Math.random() * (1 - zoneBaseWidth);
}

// How workable the blade is: 1 at full forge heat, 0 at the cold limit.
function warmth(): number {
  return Math.min(1, Math.max(0, (temp - COLD_TEMP) / (FORGE_TEMP - COLD_TEMP)));
}

// Hot metal is easier to work: the golden zone shrinks as the blade cools.
function zoneWidth(): number {
  return zoneBaseWidth * (0.4 + 0.6 * warmth());
}

function startGame(): void {
  state = "playing";
  timeLeft = ROUND_TIME;
  gold = 0;
  swords = 0;
  strikes = [];
  marker = 0.5;
  sparks = [];
  temp = FORGE_TEMP;
  inForge = false;
  newZone();
}

function flash(text: string): void {
  message = text;
  messageTimer = 1;
}

function strike(): void {
  if (inForge) return;
  hammerAnim = 1;
  if (temp < COLD_TEMP) {
    flash("Too cold! Reheat (S)");
    return;
  }

  const dist = Math.abs(marker - zoneCenter);
  const half = zoneWidth() / 2;
  const aim = dist <= half ? 1 - (dist / half) * 0.5 : Math.max(0, 0.5 - (dist - half) * 3);
  // Strikes on cooler metal are worth less (down to 60% just above the cold limit).
  const accuracy = aim * (0.6 + 0.4 * warmth());
  strikes.push(accuracy);
  temp = Math.max(ROOM_TEMP, temp - STRIKE_COOL);

  if (accuracy >= 0.9) flash("PERFECT!");
  else if (accuracy >= 0.5) flash("Good");
  else if (accuracy > 0) flash("Sloppy...");
  else flash("Miss!");

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
    const price = Math.round(quality * quality * 100);
    gold += price;
    swords++;
    strikes = [];
    temp = FORGE_TEMP; // a fresh blank comes out of the forge hot
    flash(`Sword sold for ${price}g!`);
  }
  newZone();
}

function onAction(): void {
  if (state === "playing") strike();
  else startGame();
}

const LEFT_KEYS = ["KeyA", "ArrowLeft"];
const RIGHT_KEYS = ["KeyD", "ArrowRight"];
const REHEAT_KEYS = ["KeyS", "ArrowDown"];

function reheat(): void {
  if (state === "playing" && !inForge && temp < FORGE_TEMP) inForge = true;
}

window.addEventListener("keydown", (e) => {
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
canvas.addEventListener("pointerdown", onAction);

// Mouse steering: the marker slides toward the pointer's position along the bar.
canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W; // canvas may be scaled by CSS
  mouseTarget = Math.min(1, Math.max(0, (x - BAR.x) / BAR.w));
});
canvas.addEventListener("pointerleave", () => (mouseTarget = null));

function update(dt: number): void {
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
      marker = Math.min(1, Math.max(0, marker + move * MARKER_SPEED * dt));
    } else if (mouseTarget !== null) {
      // Same top speed as the keys, so the mouse is not a shortcut.
      const step = MARKER_SPEED * dt;
      const diff = mouseTarget - marker;
      marker = Math.abs(diff) <= step ? mouseTarget : marker + Math.sign(diff) * step;
    }
  }

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    state = "over";
    if (gold > best) {
      best = gold;
      safeSet("blacksmith-best", String(best));
    }
  }
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

function drawForge(): void {
  // Background wall and forge glow
  ctx.fillStyle = "#2b1d18";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(400, 260, 20, 400, 260, 320);
  glow.addColorStop(0, "rgba(255,120,30,0.35)");
  glow.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

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
  ctx.fillStyle = "#111";
  ctx.fillRect(BAR.x - 3, BAR.y - 3, BAR.w + 6, BAR.h + 6);
  ctx.fillStyle = "#553322";
  ctx.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);

  const zw = zoneWidth();
  const zx = BAR.x + (zoneCenter - zw / 2) * BAR.w;
  ctx.fillStyle = "#e0a030";
  ctx.fillRect(zx, BAR.y, zw * BAR.w, BAR.h);
  ctx.fillStyle = "#fff3a0";
  ctx.fillRect(BAR.x + zoneCenter * BAR.w - 3, BAR.y, 6, BAR.h);

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
  drawForge();
  drawScreen();
  drawVersion();
}

function drawScreen(): void {
  if (state === "menu") {
    if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, W / 2 - 45, 20, 90, 90);
    drawText("Blacksmith Simulator", W / 2, 150, 48);
    drawText("Steer the marker with the mouse, A/D or the arrow keys,", W / 2, 360, 20);
    drawText("then press SPACE or click to strike in the golden zone.", W / 2, 385, 20);
    drawText("The blade cools down: press S or ↓ to reheat it in the forge.", W / 2, 410, 20);
    drawText(`3 strikes forge a sword. You have ${ROUND_TIME} seconds.`, W / 2, 435, 20);
    drawText("Press SPACE or click to start", W / 2, 475, 24, "#ffb347");
    return;
  }

  drawText(`Gold: ${gold}`, 20, 40, 26, "#ffd700", "left");
  drawText(`Swords: ${swords}`, 20, 72, 20, "#f5e6c8", "left");
  drawText(`${Math.ceil(timeLeft)}s`, W - 20, 40, 26, timeLeft < 10 ? "#ff6040" : "#f5e6c8", "right");
  drawText(`Best: ${best}`, W - 20, 72, 18, "#b8a888", "right");

  if (state === "playing") {
    drawBar();
    drawHeatGauge();
    if (messageTimer > 0) {
      ctx.globalAlpha = messageTimer;
      drawText(message, W / 2, 190 - (1 - messageTimer) * 20, 32, "#ffe080");
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);
    drawText("Time's up!", W / 2, 170, 52);
    drawText(`You forged ${swords} swords and earned ${gold} gold.`, W / 2, 230, 24);
    drawText(gold >= best && gold > 0 ? "New best!" : `Best: ${best}`, W / 2, 270, 22, "#ffd700");
    drawText("Press SPACE or click to play again", W / 2, 340, 24, "#ffb347");
  }
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
