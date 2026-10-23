// Adventurer's Guild: register for a license, take quests from the board, claim rewards,
// and take promotion exams to rise from F-rank to S-rank.

import { sfx } from "../audio";
import {
  EXAM_POINTS, RANKS, RANK_COLORS, REFRESH_COST, REGISTRATION_FEE, REWARD_BONUS, abandon, accept, canAccept, complete,
  examAvailable, isDone, progressOf, questSlots, rankName, refreshBoard, register, takeExam, type Quest,
} from "../guild";
import { save } from "../save";
import { W, app, ctx, drawButton, drawMeter, drawPanel, drawText, drawTitle, inRect, toast, wrapText, type Point, type Rect } from "../ui";

const LICENSE: Rect = { x: 40, y: 95, w: 240, h: 385 };
const REGISTER_BTN: Rect = { x: W / 2 - 130, y: 416, w: 260, h: 44 };
const EXAM_BTN: Rect = { x: 60, y: 430, w: 200, h: 34 };
const REFRESH_BTN: Rect = { x: 640, y: 74, w: 120, h: 24 };
const cardRect = (i: number): Rect => ({ x: 300 + (i % 2) * 234, y: 104 + Math.floor(i / 2) * 94, w: 226, h: 88 });
const acceptRect = (i: number): Rect => ({ x: cardRect(i).x + cardRect(i).w - 70, y: cardRect(i).y + 60, w: 60, h: 22 });
const ACTIVE_Y = 314;
const rowRect = (i: number): Rect => ({ x: 300, y: ACTIVE_Y + i * 28, w: 460, h: 25 });
const claimRect = (i: number): Rect => ({ x: rowRect(i).x + rowRect(i).w - 92, y: rowRect(i).y + 3, w: 58, h: 19 });
const abandonRect = (i: number): Rect => ({ x: rowRect(i).x + rowRect(i).w - 28, y: rowRect(i).y + 3, w: 22, h: 19 });
const MAX_ROWS = 6;

type Hit =
  | { kind: "register" } | { kind: "exam" } | { kind: "refresh" }
  | { kind: "accept"; id: number } | { kind: "claim"; id: number } | { kind: "abandon"; id: number };

function hit(p: Point): Hit | null {
  const guild = save.guild;
  if (!guild.registered) return inRect(p, REGISTER_BTN) && save.gold >= REGISTRATION_FEE ? { kind: "register" } : null;
  if (inRect(p, EXAM_BTN) && examAvailable()) return { kind: "exam" };
  if (inRect(p, REFRESH_BTN) && save.gold >= REFRESH_COST) return { kind: "refresh" };
  for (let i = 0; i < guild.board.length; i++) if (inRect(p, acceptRect(i)) && canAccept(guild.board[i])) return { kind: "accept", id: guild.board[i].id };
  for (let i = 0; i < Math.min(MAX_ROWS, guild.active.length); i++) {
    const q = guild.active[i];
    if (inRect(p, claimRect(i)) && isDone(q)) return { kind: "claim", id: q.id };
    if (inRect(p, abandonRect(i))) return { kind: "abandon", id: q.id };
  }
  return null;
}

export function guildHover(p: Point): boolean {
  return hit(p) !== null;
}

export function guildClick(p: Point): void {
  const h = hit(p);
  if (!h) return;
  app.notice = "";
  if (h.kind === "register") {
    const name = window.prompt("Your name, as it will appear on your guild license:", "Blacksmith");
    if (name === null) return;
    const error = register(name);
    if (error) {
      app.notice = error;
      sfx.error();
    } else {
      toast(`Welcome to the guild, ${save.guild.name}! Your F-rank license is ready.`, "#9fd86a", 3);
      sfx.levelUp();
    }
  } else if (h.kind === "exam") {
    takeExam();
    app.notice = "Promotion exam accepted: it's in your quest list.";
    sfx.click();
  } else if (h.kind === "refresh") {
    refreshBoard();
    app.notice = "New quests were posted on the board.";
    sfx.coin();
  } else if (h.kind === "accept") {
    accept(h.id);
    sfx.click();
  } else if (h.kind === "abandon") {
    abandon(h.id);
    sfx.click();
  } else {
    const before = save.guild.rank;
    const message = complete(h.id);
    if (message) {
      if (save.guild.rank > before) {
        toast(message, RANK_COLORS[save.guild.rank], 4);
        sfx.levelUp();
      } else {
        app.notice = message;
        sfx.coin();
      }
    }
  }
}

// ---- Drawing ----

function rankBadge(x: number, y: number, r: number, rank: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = RANK_COLORS[rank];
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r / 10);
  ctx.strokeStyle = "#2b1d18";
  ctx.stroke();
  drawText(RANKS[rank], x, y + r * 0.42, r * 1.2, "#2b1d18");
}

// The guild's crest: crossed swords over a shield.
function crest(x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 60, size / 60);
  ctx.fillStyle = "#7a2a2a";
  ctx.beginPath();
  ctx.moveTo(-22, -26); ctx.lineTo(22, -26); ctx.lineTo(22, 4); ctx.quadraticCurveTo(22, 22, 0, 30); ctx.quadraticCurveTo(-22, 22, -22, 4);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e0a030";
  ctx.stroke();
  for (const dir of [1, -1]) {
    ctx.save();
    ctx.rotate(dir * 0.75);
    ctx.fillStyle = "#e8e8f0";
    ctx.fillRect(-2.5, -30, 5, 44);
    ctx.fillStyle = "#e0a030";
    ctx.fillRect(-8, 12, 16, 4);
    ctx.restore();
  }
  ctx.restore();
}

function drawHall(): void {
  const cx = W / 2;
  // Building front with a peaked roof and the guild banner
  ctx.fillStyle = "#5a4030";
  ctx.fillRect(cx - 170, 170, 340, 170);
  ctx.fillStyle = "#3a2a22";
  ctx.beginPath();
  ctx.moveTo(cx - 190, 172); ctx.lineTo(cx, 100); ctx.lineTo(cx + 190, 172);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2b1d18"; // door
  ctx.beginPath();
  ctx.roundRect(cx - 30, 270, 60, 70, [30, 30, 0, 0]);
  ctx.fill();
  for (const wx of [cx - 130, cx + 80]) {
    ctx.fillStyle = "#ffcf6a"; // lit windows
    ctx.fillRect(wx, 220, 50, 40);
    ctx.fillStyle = "#3a2a22";
    ctx.fillRect(wx + 23, 220, 4, 40);
  }
  crest(cx, 205, 56);
}

function drawRegistration(): void {
  drawHall();
  const lines = [
    "The guild is where adventurers register, take on quests and rise through the ranks.",
    "Get your license, accept quests from the board, earn gold, XP and guild points (GP),",
    "and pass promotion exams to climb from F-rank all the way to S-rank.",
  ];
  lines.forEach((l, i) => drawText(l, W / 2, 364 + i * 18, 13, "#f5e6c8"));
  drawButton(REGISTER_BTN, `Register for a license (${REGISTRATION_FEE}g)`, save.gold >= REGISTRATION_FEE, 16);
  if (save.gold < REGISTRATION_FEE) drawText("Sell some items at the Trade Market to afford the fee.", W / 2, 480, 12, "#ff8a6a");
}

function drawLicense(): void {
  const guild = save.guild;
  drawPanel(LICENSE);
  const cx = LICENSE.x + LICENSE.w / 2;
  drawText("ADVENTURER LICENSE", cx, 118, 12, "#e0a030");
  crest(LICENSE.x + 34, 150, 30);
  drawText(guild.name, LICENSE.x + 60, 156, 17, "#f5e6c8", "left");
  rankBadge(cx, 210, 34, guild.rank);
  drawText(`${rankName(guild.rank)} adventurer`, cx, 268, 16, RANK_COLORS[guild.rank]);

  const x = LICENSE.x + 18;
  const next = EXAM_POINTS[guild.rank];
  if (next !== undefined) {
    drawText(`GP ${guild.points} / ${next} for the ${RANKS[guild.rank + 1]}-rank exam`, x, 296, 12, "#f5e6c8", "left");
    drawMeter({ x, y: 303, w: LICENSE.w - 36, h: 8 }, guild.points / next, RANK_COLORS[guild.rank + 1]);
  } else {
    drawText(`GP ${guild.points} · the highest rank!`, x, 296, 12, "#ffd700", "left");
  }
  drawText(`Quests completed: ${guild.completed}`, x, 334, 12, "#b8a888", "left");
  drawText(`Quest slots: ${questSlots()}`, x, 352, 12, "#b8a888", "left");
  drawText(`Reward bonus: +${Math.round(REWARD_BONUS[guild.rank] * 100)}%`, x, 370, 12, "#b8a888", "left");

  if (guild.rank >= RANKS.length - 1) {
    drawText("S-rank: a legend of the guild.", cx, 410, 13, "#ffd700");
  } else if (guild.active.some((q) => q.exam)) {
    drawText("Promotion exam in progress.", cx, 410, 13, "#9fe3ff");
    drawText("Check your quest list.", cx, 426, 11, "#8a7a68");
  } else if (examAvailable()) {
    drawText(`Ready for the ${RANKS[guild.rank + 1]}-rank exam!`, cx, 418, 13, "#9fd86a");
    drawButton(EXAM_BTN, "Take the exam", true, 14);
  } else {
    drawText(`Earn ${next - guild.points} more GP to unlock`, cx, 410, 12, "#8a7a68");
    drawText(`the ${RANKS[guild.rank + 1]}-rank promotion exam.`, cx, 426, 12, "#8a7a68");
  }
}

function drawBoard(): void {
  const guild = save.guild;
  drawText(`Quest board · day ${save.day}`, 300, 90, 15, "#e0a030", "left");
  drawButton(REFRESH_BTN, `New quests (${REFRESH_COST}g)`, save.gold >= REFRESH_COST, 11);
  if (!guild.board.length) drawText("The board is empty. New quests are posted each day.", 530, 190, 13, "#8a7a68");
  guild.board.forEach((q, i) => {
    const r = cardRect(i);
    drawPanel(r);
    rankBadge(r.x + 17, r.y + 18, 11, q.rank);
    drawText(q.title, r.x + 34, r.y + 23, 13, "#f5e6c8", "left");
    wrapText(q.objective, r.w - 24, 11).slice(0, 2).forEach((line, k) => drawText(line, r.x + 12, r.y + 42 + k * 14, 11, "#b8a888", "left"));
    drawText(`${q.reward.gold}g · ${q.reward.gp} GP · ${q.reward.xp} XP`, r.x + 12, r.y + 76, 11, "#ffd700", "left");
    const locked = q.rank > guild.rank;
    const full = !locked && !canAccept(q);
    drawButton(acceptRect(i), locked ? `${RANKS[q.rank]}-rank` : full ? "Full" : "Accept", canAccept(q), 11);
  });
}

function drawActive(): void {
  const guild = save.guild;
  const regular = guild.active.filter((q) => !q.exam).length;
  drawText(`Your quests (${regular}/${questSlots()})`, 300, ACTIVE_Y - 8, 15, "#e0a030", "left");
  if (!guild.active.length) drawText("No quests yet: accept one from the board above.", 530, ACTIVE_Y + 30, 13, "#8a7a68");
  guild.active.slice(0, MAX_ROWS).forEach((q: Quest, i) => {
    const r = rowRect(i);
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 5);
    ctx.fillStyle = q.exam ? "rgba(90,60,20,0.85)" : "rgba(26,18,16,0.85)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = q.exam ? "#e0a030" : "#5a4030";
    ctx.stroke();
    rankBadge(r.x + 13, r.y + r.h / 2, 8, q.rank);
    drawText(q.title, r.x + 26, r.y + 11, 11, q.exam ? "#ffe080" : "#f5e6c8", "left");
    drawText(q.objective, r.x + 26, r.y + 22, 9, "#8a7a68", "left");
    const progress = progressOf(q);
    drawMeter({ x: r.x + 286, y: r.y + 9, w: 50, h: 7 }, progress / q.target, isDone(q) ? "#9fd86a" : "#9fe3ff");
    drawText(`${progress}/${q.target}`, r.x + 342, r.y + 16, 10, "#f5e6c8", "left");
    const handIn = q.kind === "supply" || q.kind === "arms";
    drawButton(claimRect(i), handIn ? "Hand in" : "Claim", isDone(q), 10);
    drawButton(abandonRect(i), "✕", true, 10);
  });
  if (guild.active.length > MAX_ROWS) drawText(`+${guild.active.length - MAX_ROWS} more`, 760, ACTIVE_Y - 8, 11, "#8a7a68", "right");
}

export function drawGuild(): void {
  drawTitle("Adventurer's Guild");
  if (!save.guild.registered) {
    drawRegistration();
  } else {
    drawLicense();
    drawBoard();
    drawActive();
  }
  if (app.notice) drawText(app.notice, 530, 494, 12, "#9fd86a");
}
