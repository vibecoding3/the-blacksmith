// Blacksmith Simulator — steer the marker into the sweet spot and strike the hot blade.

type State = "menu" | "playing" | "over";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const W = canvas.width;
const H = canvas.height;

const ROUND_TIME = 60; // seconds
const STRIKES_PER_SWORD = 3;
const BAR = { x: 150, y: 400, w: 500, h: 28 };

let state: State = "menu";
let timeLeft = ROUND_TIME;
let gold = 0;
let swords = 0;
let strikes: number[] = []; // accuracy of each strike on the current sword (0..1)
let marker = 0; // 0..1 position along the bar
const MARKER_SPEED = 0.9; // bar-widths per second
const held = new Set<string>(); // movement keys currently pressed
let zoneCenter = 0.5;
let zoneWidth = 0.18;
let message = "";
let messageTimer = 0;
let hammerAnim = 0; // 1 right after a strike, decays to 0
let sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
let best = Number(safeGet("blacksmith-best") ?? 0);

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function newZone(): void {
  zoneWidth = Math.max(0.07, 0.18 - swords * 0.01);
  zoneCenter = zoneWidth / 2 + Math.random() * (1 - zoneWidth);
}

function startGame(): void {
  state = "playing";
  timeLeft = ROUND_TIME;
  gold = 0;
  swords = 0;
  strikes = [];
  marker = 0.5;
  sparks = [];
  newZone();
}

function flash(text: string): void {
  message = text;
  messageTimer = 1;
}

function strike(): void {
  const dist = Math.abs(marker - zoneCenter);
  const half = zoneWidth / 2;
  const accuracy = dist <= half ? 1 - (dist / half) * 0.5 : Math.max(0, 0.5 - (dist - half) * 3);
  strikes.push(accuracy);
  hammerAnim = 1;

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

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) onAction();
  } else if (LEFT_KEYS.includes(e.code) || RIGHT_KEYS.includes(e.code)) {
    e.preventDefault();
    held.add(e.code);
  }
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", () => held.clear());
canvas.addEventListener("pointerdown", onAction);

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

  const left = LEFT_KEYS.some((k) => held.has(k));
  const right = RIGHT_KEYS.some((k) => held.has(k));
  const move = (right ? 1 : 0) - (left ? 1 : 0);
  marker = Math.min(1, Math.max(0, marker + move * MARKER_SPEED * dt));

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

function drawForge(): void {
  // Background wall and forge glow
  ctx.fillStyle = "#2b1d18";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(400, 260, 20, 400, 260, 320);
  glow.addColorStop(0, "rgba(255,120,30,0.35)");
  glow.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Anvil
  ctx.fillStyle = "#4a4a52";
  ctx.beginPath();
  ctx.moveTo(270, 260); ctx.lineTo(530, 260); ctx.lineTo(560, 240);
  ctx.lineTo(240, 240); ctx.closePath(); ctx.fill();
  ctx.fillRect(270, 260, 260, 25);
  ctx.fillRect(340, 285, 120, 40);
  ctx.fillRect(300, 325, 200, 20);

  // Glowing blade on the anvil — cools toward grey as strikes accumulate
  const heat = 1 - strikes.length / STRIKES_PER_SWORD;
  const r = Math.round(120 + 135 * heat);
  const g = Math.round(120 + 40 * heat);
  const b = Math.round(130 - 100 * heat);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(310, 230, 180, 10);
  ctx.beginPath(); ctx.moveTo(490, 230); ctx.lineTo(515, 235); ctx.lineTo(490, 240); ctx.fill();
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(285, 228, 25, 14);

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

function drawBar(): void {
  ctx.fillStyle = "#111";
  ctx.fillRect(BAR.x - 3, BAR.y - 3, BAR.w + 6, BAR.h + 6);
  ctx.fillStyle = "#553322";
  ctx.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);

  const zx = BAR.x + (zoneCenter - zoneWidth / 2) * BAR.w;
  ctx.fillStyle = "#e0a030";
  ctx.fillRect(zx, BAR.y, zoneWidth * BAR.w, BAR.h);
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
    drawText("Blacksmith Simulator", W / 2, 110, 48);
    drawText("Steer the marker with A/D or the arrow keys,", W / 2, 375, 20);
    drawText("then press SPACE or click to strike in the golden zone.", W / 2, 400, 20);
    drawText(`3 strikes forge a sword. You have ${ROUND_TIME} seconds.`, W / 2, 425, 20);
    drawText("Press SPACE or click to start", W / 2, 470, 24, "#ffb347");
    return;
  }

  drawText(`Gold: ${gold}`, 20, 40, 26, "#ffd700", "left");
  drawText(`Swords: ${swords}`, 20, 72, 20, "#f5e6c8", "left");
  drawText(`${Math.ceil(timeLeft)}s`, W - 20, 40, 26, timeLeft < 10 ? "#ff6040" : "#f5e6c8", "right");
  drawText(`Best: ${best}`, W - 20, 72, 18, "#b8a888", "right");

  if (state === "playing") {
    drawBar();
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
