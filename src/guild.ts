// The Adventurer's Guild: register for a license, take quests from the daily board, earn gold, XP
// and guild points (GP), and rise from F-rank to S-rank by passing promotion exams.
// Quest progress is tracked through game events (monsters defeated, ore mined, items forged).

import { DUNGEONS } from "./dungeons";
import { onGameEvent, type GameEvent } from "./events";
import { forgeItemFor } from "./forgeItems";
import { addGold, computeValue, materialCount, removeFromBag, spendMaterial, spendGold, type Item, type ItemType } from "./items";
import { METALS, materialLabel, type MaterialId, type MetalId } from "./metals";
import { addXp } from "./progression";
import { persist, save } from "./save";

export const RANKS = ["F", "E", "D", "C", "B", "A", "S"] as const;
export const RANK_COLORS = ["#9a9ea6", "#7fc97f", "#5fa8ff", "#b48cff", "#ff9f1c", "#ff5f5f", "#ffd700"];
export const REGISTRATION_FEE = 20;
export const BOARD_SIZE = 4;
export const REFRESH_COST = 15;

// Rank perks: how many quests you can have at once and the bonus on quest rewards.
export const QUEST_SLOTS = [2, 2, 3, 3, 4, 4, 5];
export const REWARD_BONUS = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4];
// Guild points needed before the exam for the next rank (index = current rank).
export const EXAM_POINTS = [30, 80, 180, 350, 600, 1000];

// Base rewards for a quest of each rank.
const BASE_GOLD = [30, 50, 80, 130, 200, 320, 500];
const BASE_GP = [10, 15, 22, 32, 45, 65, 90];

export type QuestKind = "hunt" | "clear" | "mine" | "supply" | "forge" | "arms" | "legendary";

export interface Quest {
  id: number;
  rank: number; // 0 = F ... 6 = S
  kind: QuestKind;
  title: string;
  objective: string;
  target: number;
  progress: number;
  exam?: boolean; // a promotion exam: passing it raises your rank
  dungeon?: string;
  monster?: string;
  material?: MaterialId;
  metal?: MetalId;
  itemType?: ItemType;
  minValue?: number;
  legendaryOnly?: boolean; // deliver any legendary weapon or armor
  reward: { gold: number; gp: number; xp: number };
}

export interface GuildState {
  registered: boolean;
  name: string;
  rank: number;
  points: number;
  completed: number;
  board: Quest[];
  boardDay: number; // the day the board was posted
  active: Quest[];
}

const g = () => save.guild;
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
export const rankName = (r: number) => `${RANKS[r]}-rank`;
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const pairs: ItemType[] = ["pants", "shoes"]; // "a pair of Steel Pants"

// ---- Registration ----

export function register(name: string): string | null {
  if (g().registered) return null;
  if (!spendGold(REGISTRATION_FEE)) return `Registration costs ${REGISTRATION_FEE}g.`;
  const guild = g();
  guild.registered = true;
  guild.name = name.trim().slice(0, 18) || "Blacksmith";
  postBoard();
  persist();
  return null;
}

// ---- Quest generation ----

// Where adventurers of each rank are sent, and what they're asked to bring.
const DUNGEON_FOR_RANK = ["cellar", "cellar", "mines", "crypt", "crypt", "lair", "lair"];
const ORE_FOR_RANK: MaterialId[] = ["copper", "iron", "iron", "silver", "gold", "gold", "mithril"];
const ORE_AMOUNT: Partial<Record<MaterialId, number>> = { copper: 8, iron: 6, silver: 4, gold: 3, mithril: 1, steel: 4 };
const METAL_FOR_RANK: MetalId[] = ["copper", "iron", "iron", "steel", "steel", "silver", "mithril"];
const ARMS_FOR_RANK: ItemType[][] = [
  ["dagger", "sword"], ["sword", "axe", "shoes"], ["spear", "helmet", "axe"], ["shield", "pants", "helmet"],
  ["greatsword", "chestplate", "shield"], ["greatsword", "chestplate", "pants"], ["greatsword", "chestplate"],
];

function makeQuest(rank: number, kind: QuestKind): Quest {
  const gold = Math.round(BASE_GOLD[rank] * (0.85 + Math.random() * 0.3));
  const base = { id: save.nextId++, rank, kind, progress: 0, reward: { gold, gp: BASE_GP[rank], xp: Math.round(gold * 0.4) } };
  const dungeon = DUNGEONS.find((d) => d.id === DUNGEON_FOR_RANK[rank])!;
  switch (kind) {
    case "hunt": {
      const monster = pick(dungeon.monsters).name;
      const target = Math.min(8, 3 + rank);
      return { ...base, title: `Hunt: ${monster}s`, objective: `Defeat ${target} ${monster}s in the ${dungeon.name}.`, target, dungeon: dungeon.id, monster };
    }
    case "clear":
      return { ...base, title: `Subjugation: ${dungeon.boss.name}`, objective: `Clear the ${dungeon.name} and defeat the ${dungeon.boss.name}.`, target: 1, dungeon: dungeon.id,
        reward: { ...base.reward, gold: Math.round(gold * 1.3), gp: Math.round(BASE_GP[rank] * 1.3) } };
    case "mine": {
      const material = ORE_FOR_RANK[rank];
      const target = ORE_AMOUNT[material] ?? 3;
      return { ...base, title: `Prospecting: ${materialLabel(material)}`, objective: `Mine ${target} ${materialLabel(material).toLowerCase()} yourself in the Mine.`, target, material };
    }
    case "supply": {
      const material: MaterialId = pick([ORE_FOR_RANK[rank], rank >= 2 ? "steel" : "iron"]);
      const target = ORE_AMOUNT[material] ?? 3;
      return { ...base, title: `Supplies: ${materialLabel(material)}`, objective: `Hand in ${target} ${materialLabel(material).toLowerCase()} to the guild.`, target, material,
        reward: { ...base.reward, gold: Math.round(gold * 0.8) } };
    }
    case "forge": {
      const metal = METAL_FOR_RANK[rank];
      const target = 2 + Math.floor(rank / 2);
      return { ...base, title: `Smithing: ${METALS[metal].label}`, objective: `Forge ${target} items from ${METALS[metal].label.toLowerCase()}.`, target, metal };
    }
    case "arms": {
      const itemType = pick(ARMS_FOR_RANK[rank]);
      const metal = METAL_FOR_RANK[Math.max(1, rank)];
      const minValue = Math.round(computeValue(itemType, metal, undefined, 1, 0, 0, false) * 0.4);
      const label = forgeItemFor(itemType).label;
      const name = `${METALS[metal].label} ${label}`;
      return { ...base, title: `Arms: ${label}`, objective: `Deliver ${pairs.includes(itemType) ? "a pair of" : article(name)} ${name} worth at least ${minValue}g.`, target: 1,
        itemType, metal, minValue, reward: { ...base.reward, gold: Math.round(gold * 1.2) + minValue } };
    }
    case "legendary":
      return { ...base, title: "Masterwork", objective: "Forge any legendary item.", target: 1,
        reward: { ...base.reward, gold: Math.round(gold * 1.5), gp: Math.round(BASE_GP[rank] * 1.5) } };
  }
}

function kindsForRank(rank: number): QuestKind[] {
  const kinds: QuestKind[] = ["hunt", "mine", "supply", "forge", "arms"];
  if (rank >= 1) kinds.push("clear");
  if (rank >= 4) kinds.push("legendary");
  return kinds;
}

// The board: quests of your rank, plus one of the next rank to aim for, all of different kinds.
function postBoard(): void {
  const guild = g();
  const rank = guild.rank;
  const kinds = [...kindsForRank(Math.min(RANKS.length - 1, rank + 1))].sort(() => Math.random() - 0.5);
  guild.board = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const r = i === BOARD_SIZE - 1 && rank < RANKS.length - 1 ? rank + 1 : rank;
    const kind = kinds.find((k) => kindsForRank(r).includes(k)) ?? pick(kindsForRank(r));
    kinds.splice(kinds.indexOf(kind), 1);
    guild.board.push(makeQuest(r, kind));
  }
  guild.boardDay = save.day;
}

// When the game opens on a new day, the board shows that day's quests.
export function initGuild(): void {
  if (g().registered && g().boardDay !== save.day) {
    postBoard();
    persist();
  }
}

export function refreshBoard(): boolean {
  if (!spendGold(REFRESH_COST)) return false;
  postBoard();
  persist();
  return true;
}

// ---- Exams ----

export function examAvailable(): boolean {
  const guild = g();
  return guild.registered && guild.rank < RANKS.length - 1 && guild.points >= EXAM_POINTS[guild.rank] && !guild.active.some((q) => q.exam);
}

function makeExam(rank: number): Quest {
  const next = rankName(rank + 1);
  const gold = [50, 100, 200, 400, 800, 1500][rank];
  const base = { id: save.nextId++, rank, progress: 0, exam: true, reward: { gold, gp: 0, xp: Math.round(gold * 0.5) } };
  const clear = (id: string): Quest => {
    const d = DUNGEONS.find((x) => x.id === id)!;
    return { ...base, kind: "clear", title: `Exam for ${next}`, objective: `Clear the ${d.name} (defeat the ${d.boss.name}).`, target: 1, dungeon: id };
  };
  switch (rank) {
    case 0: return clear("cellar");
    case 1: return { ...base, kind: "arms", title: `Exam for ${next}`, objective: "Present a Steel Sword worth at least 60g.", target: 1, itemType: "sword", metal: "steel", minValue: 60 };
    case 2: return clear("mines");
    case 3: return clear("crypt");
    case 4: return { ...base, kind: "arms", title: `Exam for ${next}`, objective: "Present a legendary weapon or armor piece.", target: 1, legendaryOnly: true };
    default: return clear("lair");
  }
}

export function takeExam(): boolean {
  if (!examAvailable()) return false;
  g().active.push(makeExam(g().rank));
  persist();
  return true;
}

// ---- Accepting, tracking and finishing quests ----

export const questSlots = () => QUEST_SLOTS[g().rank];
const regularActive = () => g().active.filter((q) => !q.exam).length;

export function canAccept(q: Quest): boolean {
  return q.rank <= g().rank && regularActive() < questSlots();
}

export function accept(id: number): boolean {
  const guild = g();
  const q = guild.board.find((x) => x.id === id);
  if (!q || !canAccept(q)) return false;
  guild.board = guild.board.filter((x) => x.id !== id);
  guild.active.push(q);
  persist();
  return true;
}

export function abandon(id: number): void {
  g().active = g().active.filter((q) => q.id !== id);
  persist();
}

// The bag item a delivery quest would take (the cheapest one that qualifies).
export function deliveryItem(q: Quest): Item | undefined {
  return save.items
    .filter((i) => {
      if (q.legendaryOnly) return i.tier === "legendary" && ["weapon", "armor"].includes(forgeItemFor(i.type).kind);
      return i.type === q.itemType && i.metal === q.metal && i.value >= (q.minValue ?? 0);
    })
    .sort((a, b) => a.value - b.value)[0];
}

// How far along a quest is; hand-in quests count what you have right now.
export function progressOf(q: Quest): number {
  if (q.kind === "supply") return Math.min(q.target, materialCount(q.material!));
  if (q.kind === "arms") return deliveryItem(q) ? 1 : 0;
  return Math.min(q.target, q.progress);
}

export function isDone(q: Quest): boolean {
  return progressOf(q) >= q.target;
}

// Claims a finished quest: hands in goods, pays out, and promotes after an exam.
// Returns a message for the player, or null if the quest isn't finished.
export function complete(id: number): string | null {
  const guild = g();
  const q = guild.active.find((x) => x.id === id);
  if (!q || !isDone(q)) return null;
  if (q.kind === "supply") spendMaterial(q.material!, q.target);
  if (q.kind === "arms") removeFromBag(deliveryItem(q)!.id);
  const bonus = 1 + REWARD_BONUS[guild.rank];
  const gold = Math.round(q.reward.gold * bonus);
  const gp = Math.round(q.reward.gp * bonus);
  addGold(gold);
  addXp(q.reward.xp);
  guild.points += gp;
  guild.completed++;
  guild.active = guild.active.filter((x) => x.id !== id);
  let message = `Quest complete! +${gold}g, +${gp} GP, +${q.reward.xp} XP.`;
  if (q.exam) {
    guild.rank = Math.min(RANKS.length - 1, guild.rank + 1);
    message = `Exam passed! You are now ${rankName(guild.rank)}. +${gold}g, +${q.reward.xp} XP.`;
  }
  persist();
  return message;
}

function track(e: GameEvent): void {
  const guild = g();
  if (e.type === "newDay") {
    if (guild.registered) postBoard();
    persist();
    return;
  }
  if (!guild.registered) return;
  for (const q of guild.active) {
    if (e.type === "monsterDefeated" && q.kind === "hunt" && q.dungeon === e.dungeon && q.monster === e.monster) q.progress++;
    if (e.type === "dungeonCleared" && q.kind === "clear" && q.dungeon === e.dungeon) q.progress = 1;
    if (e.type === "mined" && q.kind === "mine" && q.material === e.material) q.progress += e.amount;
    if (e.type === "forged" && q.kind === "forge" && q.metal === e.item.metal) q.progress++;
    if (e.type === "forged" && q.kind === "legendary" && e.item.tier === "legendary") q.progress++;
  }
  persist();
}
onGameEvent(track);
