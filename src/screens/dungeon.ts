// Dungeon: pick a dungeon, watch the auto-battle room by room, and bring the loot home.

import { sfx } from "../audio";
import {
  DUNGEONS, ROOMS, battle, enterDungeon, leaveDungeon, playerAttack, playerDefense, playerMaxHp, retreat, updateBattle,
  type BattleEvent, type Monster,
} from "../dungeons";
import { forgeItemFor } from "../forgeItems";
import { drawMaterialIcon } from "../icons";
import { MAX_DURABILITY, TRAITS, equippedItems, gearStats, isBroken, usesDurability } from "../items";
import { materialLabel, type MaterialId } from "../metals";
import { level } from "../progression";
import { save } from "../save";
import { W, app, ctx, drawButton, drawMeter, drawPanel, drawText, drawTitle, inRect, shake, type Point, type Rect } from "../ui";

const STATS_PANEL: Rect = { x: 40, y: 95, w: 240, h: 385 };
const cardRect = (i: number): Rect => ({ x: 300, y: 95 + i * 97, w: 460, h: 88 });
const enterRect = (i: number): Rect => ({ x: cardRect(i).x + cardRect(i).w - 110, y: cardRect(i).y + 26, w: 96, h: 36 });
const BATTLE_BTN: Rect = { x: 620, y: 440, w: 140, h: 38 };

type Hit = { kind: "enter"; index: number } | { kind: "battleButton" };

function hit(p: Point): Hit | null {
  if (battle) return inRect(p, BATTLE_BTN) ? { kind: "battleButton" } : null;
  for (let i = 0; i < DUNGEONS.length; i++) if (inRect(p, enterRect(i))) return { kind: "enter", index: i };
  return null;
}

export function dungeonHover(p: Point): boolean {
  return hit(p) !== null;
}

export function dungeonClick(p: Point): void {
  const h = hit(p);
  if (!h) return;
  if (h.kind === "enter") {
    const error = enterDungeon(DUNGEONS[h.index]);
    app.notice = error ?? "";
    if (error) sfx.error();
    else sfx.click();
  } else if (battle && (battle.phase === "fight" || battle.phase === "between")) {
    retreat();
  } else {
    leaveDungeon();
    app.notice = "";
  }
}

function onBattleEvent(e: BattleEvent): void {
  if (e === "playerHit") sfx.slash();
  else if (e === "playerCrit") {
    sfx.slash();
    shake(4, 0.12);
  } else if (e === "monsterHit") {
    sfx.hurt();
    shake(3, 0.1);
  } else if (e === "monsterDown") sfx.monsterDown();
  else if (e === "victory") sfx.victory();
  else if (e === "defeat") sfx.defeat();
}

export function dungeonUpdate(dt: number): void {
  updateBattle(dt, onBattleEvent);
}

// ---- Drawing ----

function drawStatsPanel(): void {
  drawPanel(STATS_PANEL);
  const x = STATS_PANEL.x + 18;
  drawText("Your blacksmith", STATS_PANEL.x + STATS_PANEL.w / 2, STATS_PANEL.y + 28, 18, "#e0a030");
  drawText(`Level ${level()}`, x, 150, 15, "#f5e6c8", "left");
  drawText(`HP ${playerMaxHp()}`, x, 176, 15, "#9fd86a", "left");
  drawText(`Attack ${playerAttack()}`, x, 200, 15, "#ff8a6a", "left");
  drawText(`Defense ${playerDefense()}`, x, 224, 15, "#9fe3ff", "left");
  const traits = gearStats().traits;
  drawText(traits.length ? `Traits: ${traits.map((t) => TRAITS[t].label).join(", ")}` : "No legendary traits", x, 250, 12, traits.length ? "#ff9f1c" : "#8a7a68", "left");

  drawText("Gear condition", x, 282, 14, "#e0a030", "left");
  const worn = equippedItems().filter((i) => usesDurability(i.type));
  if (!worn.length) drawText("Nothing equipped: fists only!", x, 304, 12, "#ff8a6a", "left");
  worn.slice(0, 6).forEach((item, i) => {
    const y = 300 + i * 26;
    drawText(forgeItemFor(item.type).label, x, y + 4, 11, isBroken(item) ? "#ff6040" : "#b8a888", "left");
    const f = item.durability / MAX_DURABILITY;
    drawMeter({ x: x + 90, y: y - 5, w: 110, h: 8 }, f, f > 0.5 ? "#9fd86a" : f > 0.2 ? "#ffb347" : "#ff6040");
  });
  drawText("Repair worn gear from the Inventory.", STATS_PANEL.x + STATS_PANEL.w / 2, 468, 11, "#8a7a68");
}

function drawDungeonList(): void {
  DUNGEONS.forEach((d, i) => {
    const r = cardRect(i);
    const locked = level() < d.level;
    drawPanel(r);
    drawText(d.name, r.x + 16, r.y + 26, 18, locked ? "#8a7a68" : "#e0a030", "left");
    drawText(d.desc, r.x + 16, r.y + 48, 12, "#b8a888", "left");
    const boss = `Boss: ${d.boss.name} · ${ROOMS} rooms + boss`;
    drawText(boss, r.x + 16, r.y + 68, 11, "#8a7a68", "left");
    drawText(locked ? `Level ${d.level}` : d.cost ? `${d.cost}g` : "Free", r.x + r.w - 62, r.y + 18, 12, locked ? "#ff8a6a" : "#ffd700");
    drawButton(enterRect(i), locked ? "Locked" : "Enter", !locked && save.gold >= d.cost, 15);
  });
}

function drawFighter(x: number, y: number, color: string, scale: number, flip: boolean, hurt: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  ctx.fillStyle = hurt ? "#ff6040" : color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 40, 0, 0, Math.PI * 2); // body
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -42, 20, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.fillStyle = "#1a1210";
  ctx.beginPath();
  ctx.arc(18, -46, 3.5, 0, Math.PI * 2); // eye
  ctx.fill();
  ctx.restore();
}

function drawPlayerFigure(x: number, y: number, hurt: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = hurt ? "#ff6040" : "#8a7060";
  ctx.beginPath();
  ctx.roundRect(-18, -30, 36, 60, 8); // body
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -46, 15, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.fillStyle = "#c8c8d0"; // sword raised
  ctx.save();
  ctx.translate(22, -10);
  ctx.rotate(-0.8);
  ctx.fillRect(0, -3, 50, 6);
  ctx.restore();
  ctx.restore();
}

function drawHpBar(x: number, y: number, w: number, hp: number, max: number, label: string): void {
  drawText(label, x, y - 8, 14, "#f5e6c8", "left");
  drawText(`${Math.max(0, Math.ceil(hp))}/${max}`, x + w, y - 8, 12, "#b8a888", "right");
  const f = Math.max(0, hp) / max;
  drawMeter({ x, y, w, h: 10 }, f, f > 0.5 ? "#9fd86a" : f > 0.25 ? "#ffb347" : "#ff6040");
}

function drawBattle(): void {
  const b = battle!;
  drawText(b.dungeon.name, W / 2, 34, 22, "#e0a030");
  // Room progress: four rooms then the boss
  for (let i = 0; i <= ROOMS; i++) {
    const x = W / 2 - (ROOMS * 34) / 2 + i * 34;
    ctx.beginPath();
    ctx.arc(x, 52, i === ROOMS ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = i < b.room || (i === b.room && b.phase === "won") ? "#9fd86a" : i === b.room ? "#e0a030" : "#3a2a22";
    ctx.fill();
  }

  // Arena
  drawPanel({ x: 40, y: 70, w: 720, h: 230 });
  const hurtPlayer = b.hitAnim?.who === "player" && b.hitAnim.age < 0.15;
  const hurtMonster = b.hitAnim?.who === "monster" && b.hitAnim.age < 0.15;
  const lunge = b.hitAnim && b.hitAnim.age < 0.12 ? 18 : 0;
  drawPlayerFigure(230 + (b.hitAnim?.who === "monster" ? lunge : 0), 225, hurtPlayer);
  const m: Monster = b.monster;
  const alive = b.monsterHp > 0 || b.phase === "fight";
  if (alive || b.phase === "between") {
    ctx.globalAlpha = b.monsterHp > 0 ? 1 : 0.3;
    drawFighter(560 - (b.hitAnim?.who === "player" ? lunge : 0), 220, m.color, m.boss ? 1.25 : 0.9, true, hurtMonster);
    ctx.globalAlpha = 1;
  }
  drawHpBar(130, 104, 200, b.hp, b.maxHp, "You");
  drawHpBar(470, 104, 200, b.monsterHp, m.hp, m.boss ? `${m.name} (boss)` : m.name);
  // Floating damage number
  if (b.hitAnim && b.hitAnim.age < 0.8) {
    const x = b.hitAnim.who === "monster" ? 560 : 230;
    const y = 150 - b.hitAnim.age * 40;
    ctx.globalAlpha = 1 - b.hitAnim.age / 0.8;
    drawText(`-${b.hitAnim.amount}${b.hitAnim.crit ? "!" : ""}`, x, y, b.hitAnim.crit ? 26 : 20, b.hitAnim.who === "monster" ? "#ffd700" : "#ff6040");
    ctx.globalAlpha = 1;
  }

  // Log
  drawPanel({ x: 40, y: 310, w: 420, h: 170 });
  b.log.forEach((l, i) => drawText(l.text, 56, 334 + i * 21, 12, l.color, "left"));

  // Loot so far
  drawPanel({ x: 470, y: 310, w: 290, h: 120 });
  drawText("Loot", 486, 332, 15, "#e0a030", "left");
  drawText(`${b.gold}g · ${b.xp} XP`, 744, 332, 13, "#ffd700", "right");
  const loot = Object.entries(b.loot) as [MaterialId, number][];
  loot.slice(0, 6).forEach(([id, n], i) => {
    const x = 486 + (i % 2) * 135;
    const y = 346 + Math.floor(i / 2) * 26;
    drawMaterialIcon(ctx, id, x, y, 18);
    drawText(`${n} ${materialLabel(id)}`, x + 24, y + 14, 12, "#f5e6c8", "left");
  });
  if (b.blueprint) drawText(`Blueprint: ${forgeItemFor(b.blueprint).label}!`, 486, 424, 12, "#ff9f1c", "left");

  const fighting = b.phase === "fight" || b.phase === "between";
  if (!fighting) {
    const title = b.phase === "won" ? "Victory!" : b.phase === "lost" ? "Defeated" : "You retreated";
    drawText(title, 545, 462, 18, b.phase === "won" ? "#ffd700" : "#ff8a6a", "right");
  }
  drawButton(BATTLE_BTN, fighting ? "Retreat" : "Collect & leave", true, 15);
}

export function drawDungeon(): void {
  if (battle) {
    drawBattle();
    return;
  }
  drawTitle("Dungeon");
  drawText("Fight with the gear you forge. Loot, gold and XP are kept even if you retreat or fall.", W - 20, 80, 12, "#b8a888", "right");
  drawStatsPanel();
  drawDungeonList();
  if (app.notice) drawText(app.notice, 530, 492, 13, "#ff8a6a");
}
