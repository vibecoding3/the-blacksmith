// Blacksmith Simulator: forge gear, equip it, sell it, fight in dungeons and grow your smithy.
// This file wires the screens together: sidebar, input routing, help, effects and the game loop.

import { sfx, unlockAudio } from "./audio";
import { battle } from "./dungeons";
import {
  drawForgeScreen, forgeClick, forgeHover, forgeKeyDown, forgeKeyUp, forgeLeave, forgePointerLeave, forgePointerMove,
  forgePointerUp, forgeUpdate,
} from "./forge";
import { LEGENDARY_COLOR } from "./items";
import { REROLL_COST, initMarket, rerollOrders } from "./market";
import { levelInfo, perkPoints, progressEvents } from "./progression";
import { persist, save } from "./save";
import { blacksmithClick, blacksmithHover, drawBlacksmith } from "./screens/blacksmith";
import { dungeonClick, dungeonHover, dungeonUpdate, drawDungeon } from "./screens/dungeon";
import { drawInventory, inventoryClick, inventoryHover } from "./screens/inventory";
import { bag } from "./screens/bag";
import { drawMarket, marketClick, marketHover } from "./screens/market";
import { drawMine, mineClick, mineHover, mineUpdate } from "./screens/mine";
import { drawOrders, ordersClick, ordersHover } from "./screens/orders";
import { drawWorkshop, workshopClick, workshopHover } from "./screens/workshop";
import {
  OFFSET_X, OFFSET_Y, SCALE, SCREEN_H, SCREEN_W, SIDEBAR_W, W, app, canvas, ctx, dimScreen, drawMeter, drawText, inRect,
  input, toast, type Point, type Rect, type Tab,
} from "./ui";

const FPS = 60;
const FRAME_MS = 1000 / FPS;

// Sidebar menus, top to bottom.
const TABS: { id: Tab; label: string }[] = [
  { id: "forge", label: "Forge" },
  { id: "mine", label: "Mine" },
  { id: "inventory", label: "Inventory" },
  { id: "market", label: "Trade Market" },
  { id: "orders", label: "Orders" },
  { id: "dungeon", label: "Dungeon" },
  { id: "workshop", label: "Workshop" },
  { id: "blacksmith", label: "Blacksmith" },
];

// Each menu screen: how to draw it, react to clicks, and whether the pointer is over something clickable.
const SCREENS: Record<Exclude<Tab, "forge">, { draw: () => void; click: (p: Point) => void; hover: (p: Point) => boolean }> = {
  mine: { draw: drawMine, click: mineClick, hover: mineHover },
  inventory: { draw: drawInventory, click: inventoryClick, hover: inventoryHover },
  market: { draw: drawMarket, click: marketClick, hover: marketHover },
  orders: {
    draw: drawOrders,
    click: (p) => ordersClick(p, () => {
      if (rerollOrders()) app.notice = `New customers arrived (${REROLL_COST}g).`;
    }),
    hover: ordersHover,
  },
  dungeon: { draw: drawDungeon, click: dungeonClick, hover: dungeonHover },
  workshop: { draw: drawWorkshop, click: workshopClick, hover: workshopHover },
  blacksmith: { draw: drawBlacksmith, click: blacksmithClick, hover: blacksmithHover },
};

initMarket();
progressEvents.levelUp = (level) => {
  toast(`Level up! You are now level ${level}. New perk point to spend in Blacksmith.`, "#9fe3ff", 3.5);
  sfx.levelUp();
};

function switchTab(next: Tab): void {
  if (app.tab === "forge" && next !== "forge") forgeLeave();
  app.tab = next;
  app.notice = "";
  bag.selectedId = null;
  sfx.click();
}

// ---- Input ----

window.addEventListener("keydown", (e) => {
  unlockAudio();
  if (e.code === "KeyH") {
    app.helpOpen = !app.helpOpen;
    return;
  }
  if (app.helpOpen) {
    // Any action key closes help instead of acting on the game.
    if (["Escape", "Space", "Enter"].includes(e.code)) {
      e.preventDefault();
      app.helpOpen = false;
    }
    return;
  }
  if (e.code === "KeyI") return switchTab(app.tab === "inventory" ? "forge" : "inventory");
  if (e.code === "KeyM") {
    save.muted = !save.muted;
    persist();
    toast(save.muted ? "Sound off" : "Sound on", "#ffe080", 1.2);
    return;
  }
  if (app.tab === "forge") forgeKeyDown(e);
});
window.addEventListener("keyup", (e) => forgeKeyUp(e));
window.addEventListener("blur", () => forgeLeave());

// Pointer position in canvas pixels (the canvas may be scaled by CSS).
function toScreen(e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * SCREEN_W, y: ((e.clientY - rect.top) / rect.height) * SCREEN_H };
}

function toLayout(s: Point): Point {
  return { x: (s.x - OFFSET_X) / SCALE, y: (s.y - OFFSET_Y) / SCALE };
}

canvas.addEventListener("pointerdown", (e) => {
  unlockAudio();
  const s = toScreen(e);
  const hit = sidebarHit(s);
  if (hit === "help") {
    app.helpOpen = !app.helpOpen;
    return;
  }
  if (app.helpOpen) {
    app.helpOpen = false;
    if (!hit) return;
  }
  if (hit) return switchTab(hit);
  if (s.x < SIDEBAR_W) return;
  const p = toLayout(s);
  if (app.tab === "forge") forgeClick(p);
  else SCREENS[app.tab].click(p);
});

window.addEventListener("pointerup", () => forgePointerUp());

canvas.addEventListener("pointermove", (e) => {
  input.pointerScreen = toScreen(e);
  input.pointer = toLayout(input.pointerScreen);
  const inContent = input.pointerScreen.x >= SIDEBAR_W;
  const overScreen = !app.helpOpen && inContent && (app.tab === "forge" ? forgeHover(input.pointer) : SCREENS[app.tab].hover(input.pointer));
  canvas.style.cursor = sidebarHit(input.pointerScreen) !== null || overScreen ? "pointer" : "";
  // Mouse steering: the marker follows the pointer's position along the bar.
  if (app.tab === "forge" && inContent) forgePointerMove(input.pointer);
  else forgePointerLeave();
});
canvas.addEventListener("pointerleave", () => {
  forgePointerLeave();
  input.pointer = input.pointerScreen = { x: -1, y: -1 };
});

// ---- Update ----

function update(dt: number): void {
  app.toastTimer = Math.max(0, app.toastTimer - dt);
  app.shakeTime = Math.max(0, app.shakeTime - dt);
  if (app.shakeTime === 0) app.shakeMag = 0;
  app.flash = Math.max(0, app.flash - dt * 2);
  if (app.helpOpen) return; // everything pauses while help is open
  // The forge only runs while you're at it; a dungeon fight carries on in any menu.
  if (app.tab === "forge") forgeUpdate(dt);
  if (app.tab === "mine") mineUpdate(dt);
  if (battle) dungeonUpdate(dt);
}

// ---- Drawing ----

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

// Drawn in screen pixels, in the bottom-right corner.
function drawVersion(): void {
  ctx.font = "18px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(245,230,200,0.5)";
  ctx.fillText(`v${__APP_VERSION__}`, SCREEN_W - 14, SCREEN_H - 14);
}

function drawToast(): void {
  if (app.toastTimer <= 0) return;
  ctx.globalAlpha = Math.min(1, app.toastTimer);
  ctx.font = "bold 20px Georgia, serif";
  const w = ctx.measureText(app.toast).width + 40;
  const x = SIDEBAR_W + (SCREEN_W - SIDEBAR_W) / 2;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, SCREEN_H - 92, w, 44, 10);
  ctx.fillStyle = "rgba(20,13,11,0.92)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = app.toastColor;
  ctx.stroke();
  drawText(app.toast, x, SCREEN_H - 63, 20, app.toastColor);
  ctx.globalAlpha = 1;
}

function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground();
  // Screen shake moves the content area (not the sidebar) by a few random pixels.
  const sx = app.shakeTime > 0 ? (Math.random() - 0.5) * 2 * app.shakeMag : 0;
  const sy = app.shakeTime > 0 ? (Math.random() - 0.5) * 2 * app.shakeMag : 0;
  ctx.setTransform(SCALE, 0, 0, SCALE, OFFSET_X + sx, OFFSET_Y + sy);
  if (app.tab === "forge") drawForgeScreen();
  else SCREENS[app.tab].draw();
  if (app.helpOpen) drawHelp();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (app.flash > 0) {
    ctx.fillStyle = `rgba(255,240,200,${app.flash * 0.6})`;
    ctx.fillRect(SIDEBAR_W, 0, SCREEN_W - SIDEBAR_W, SCREEN_H);
  }
  // The sidebar goes on top of any dimming, so its buttons always stay usable.
  drawSidebar();
  drawToast();
  drawVersion();
}

// ---- Sidebar (screen pixels) ----

const TAB_RECTS: Rect[] = TABS.map((_, i) => ({ x: 14, y: 96 + i * 54, w: SIDEBAR_W - 28, h: 44 }));
const HELP_RECT: Rect = { x: 14, y: SCREEN_H - 62, w: SIDEBAR_W - 28, h: 44 };
const logo = new Image();
logo.src = `${import.meta.env.BASE_URL}favicon.svg`;

function sidebarHit(s: Point): Tab | "help" | null {
  if (inRect(s, HELP_RECT)) return "help";
  const i = TAB_RECTS.findIndex((r) => inRect(s, r));
  return i >= 0 ? TABS[i].id : null;
}

function drawSidebarButton(r: Rect, label: string, active: boolean, badge = false): void {
  const hover = inRect(input.pointerScreen, r);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = active ? "#e0a030" : hover ? "#3a2a22" : "#2b1d18";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? "#e0a030" : "#5a4030";
  ctx.stroke();
  drawText(label, r.x + r.w / 2, r.y + r.h / 2 + 6, 18, active ? "#2b1d18" : "#f5e6c8");
  if (badge) {
    ctx.beginPath();
    ctx.arc(r.x + r.w - 6, r.y + 6, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#9fd86a";
    ctx.fill();
  }
}

function drawSidebar(): void {
  ctx.fillStyle = "#1a1210";
  ctx.fillRect(0, 0, SIDEBAR_W, SCREEN_H);
  ctx.fillStyle = "#3a2a22";
  ctx.fillRect(SIDEBAR_W - 2, 0, 2, SCREEN_H);

  if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, SIDEBAR_W / 2 - 32, 14, 64, 64);
  TABS.forEach((t, i) => {
    // A dot on menus that need attention: unspent perk points, or a dungeon fight in progress elsewhere.
    const badge = (t.id === "blacksmith" && perkPoints() > 0) || (t.id === "dungeon" && battle !== null && app.tab !== "dungeon");
    drawSidebarButton(TAB_RECTS[i], t.label, app.tab === t.id, badge);
  });

  // Gold and level live in the sidebar: they matter on every screen
  const gy = 96 + TABS.length * 54 + 26;
  ctx.beginPath();
  ctx.arc(30, gy - 7, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  drawText(`${save.gold}g`, 48, gy, 20, "#ffd700", "left");
  const { level, into, needed } = levelInfo();
  drawText(`Level ${level}`, 20, gy + 30, 16, "#9fe3ff", "left");
  drawMeter({ x: 20, y: gy + 38, w: SIDEBAR_W - 40, h: 7 }, into / needed, "#9fe3ff");
  drawText(`${into}/${needed} XP`, SIDEBAR_W - 20, gy + 30, 11, "#8a7a68", "right");

  drawSidebarButton(HELP_RECT, "? Help", app.helpOpen);
}

// ---- Help ----

function drawHelp(): void {
  dimScreen(0.75);
  const px = 30;
  const py = 14;
  const pw = 740;
  const ph = 472;
  ctx.fillStyle = "#2b1d18";
  ctx.fillRect(px, py, pw, ph);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e0a030";
  ctx.strokeRect(px, py, pw, ph);
  drawText("Help", W / 2, py + 36, 28);

  const left = px + 24;
  let y = py + 66;
  const heading = (t: string) => {
    drawText(t, left, y, 17, "#e0a030", "left");
    y += 21;
  };
  const line = (t: string, color = "#f5e6c8") => {
    drawText(t, left, y, 13, color, "left");
    y += 18;
  };
  heading("Forging");
  line("Pick an item (top bar or keys 1–9, 0) and a metal. Each piece uses ore (jewelry also a gem).");
  line("Steer the marker (mouse, A/D or ←/→); strike with SPACE or a click. Only golden-zone hits count.");
  line("Metal cools: S or ↓ reheats it. Hotter hits mean better quality. Each swing costs 1 energy.");
  line("Weapons and armor are then quenched: press SPACE when the heat is in the green window.");
  line("Last, hold SPACE (or the mouse) to sharpen or polish, and let go in the green zone.");
  y += 6;
  heading("Your smithy");
  line("Mine: dig your own ore (40 swings a day; deeper is rarer) and smelt iron into steel.");
  line("Inventory: equip gear (10 slots) and repair worn items. Trade Market: buy ore and gems, sell.");
  line("Prices change every day (after each forging round). Orders: customers pay extra for items.");
  line("Dungeon: fight with your gear for ore, gems, gold, XP and blueprints. Gear wears down.");
  line("Workshop: forge upgrades for gold. Blacksmith: perks from level-ups, save backups, sound.");
  y += 6;
  heading("Item tiers and traits");
  line("Any finished item can be ★ Legendary: 5× value, 1.5× stats and a special trait.", LEGENDARY_COLOR);
  line("Quality comes from hot hits; a perfect quench and fine edge add up to +25% stats and value.");
  y += 6;
  heading("Keys");
  line("H: help    I: inventory    M: sound on/off    1–9, 0: choose item    S / ↓: reheat");
  drawText("Click anywhere or press H to close", W / 2, py + ph - 14, 14, "#ffb347");
}

// ---- Game loop ----

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
