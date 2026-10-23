// Shared canvas, layout and drawing helpers used by every screen.

export const canvas = document.getElementById("game") as HTMLCanvasElement;
export const ctx = canvas.getContext("2d")!;

// The canvas renders at a fixed 1280x720: a menu sidebar on the left (in screen
// pixels) and the content area to its right. Content is laid out in 800x500
// layout units, scaled to fit the content area and centred in it.
export const SCREEN_W = 1280;
export const SCREEN_H = 720;
export const SIDEBAR_W = 170;
export const W = 800;
export const H = 500;
export const SCALE = Math.min((SCREEN_W - SIDEBAR_W) / W, SCREEN_H / H);
export const OFFSET_X = SIDEBAR_W + (SCREEN_W - SIDEBAR_W - W * SCALE) / 2;
export const OFFSET_Y = (SCREEN_H - H * SCALE) / 2;
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export const inRect = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// Sidebar menus, in display order.
export type Tab = "forge" | "mine" | "inventory" | "market" | "orders" | "guild" | "dungeon" | "workshop" | "blacksmith";

// Shared app state.
export const app = {
  tab: "forge" as Tab,
  helpOpen: false,
  notice: "", // short feedback line on menu screens (e.g. "Bag is full")
  toast: "", // message shown over any screen (e.g. "Level up!")
  toastColor: "#ffe080",
  toastTimer: 0,
  shakeTime: 0,
  shakeMag: 0,
  flash: 0, // white screen flash, 1 = full, fades to 0
};

// Pointer position in layout units and in screen pixels, for hover effects.
export const input = { pointer: { x: -1, y: -1 } as Point, pointerScreen: { x: -1, y: -1 } as Point };

export function toast(text: string, color = "#ffe080", duration = 2.5): void {
  app.toast = text;
  app.toastColor = color;
  app.toastTimer = duration;
}

export function shake(magnitude: number, duration = 0.15): void {
  app.shakeMag = Math.max(app.shakeMag, magnitude);
  app.shakeTime = Math.max(app.shakeTime, duration);
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function drawText(text: string, x: number, y: number, size: number, color = "#f5e6c8", align: CanvasTextAlign = "center"): void {
  ctx.font = `bold ${size}px Georgia, serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function textWidth(text: string, size: number): number {
  ctx.font = `bold ${size}px Georgia, serif`;
  return ctx.measureText(text).width;
}

// Splits text into lines no wider than maxWidth at the given font size.
export function wrapText(text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawTitle(text: string): void {
  drawText(text, 40, 60, 34, "#f5e6c8", "left");
}

export function drawPanel(r: Rect): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = "rgba(26,18,16,0.85)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#5a4030";
  ctx.stroke();
}

export function drawButton(r: Rect, label: string, enabled = true, size = 16): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = !enabled ? "#3a2a22" : inRect(input.pointer, r) ? "#ffb347" : "#e0a030";
  ctx.fill();
  drawText(label, r.x + r.w / 2, r.y + r.h / 2 + size * 0.37, size, enabled ? "#2b1d18" : "#8a7a68");
}

// A horizontal progress bar (0..1).
export function drawMeter(r: Rect, fraction: number, color: string, back = "#2a1c18"): void {
  ctx.fillStyle = back;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fill();
  const f = Math.max(0, Math.min(1, fraction));
  if (f > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, Math.max(r.h, r.w * f), r.h, r.h / 2);
    ctx.fill();
  }
}

// Dims the whole screen (call while the layout transform is active).
export function dimScreen(alpha: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.restore();
}
