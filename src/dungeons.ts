// Dungeons: the blacksmith fights room by room using the stats of the equipped gear (auto-battle),
// collecting ore, gems, gold, XP and sometimes a blueprint. Gear wears down along the way.

import { FORGE_ITEMS } from "./forgeItems";
import { addGold, addMaterial, gearStats, wearEquipment, type ItemType, type TraitId } from "./items";
import type { MaterialId } from "./metals";
import { addXp, attackMult, isItemUnlocked, level } from "./progression";
import { persist, save } from "./save";

export interface Monster {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  color: string;
  boss?: boolean;
}

interface LootRoll {
  id: MaterialId;
  min: number;
  max: number;
  chance: number;
}

export interface Dungeon {
  id: string;
  name: string;
  desc: string;
  level: number;
  cost: number; // gold for torches and supplies
  monsters: Monster[]; // regular rooms pick from these
  boss: Monster;
  loot: LootRoll[]; // rolled after each regular room
  bossLoot: LootRoll[];
  gold: [number, number]; // per room
  xp: number; // per room (the boss gives 4x)
  blueprintChance: number; // boss: chance to find plans for an item you haven't unlocked yet
}

export const ROOMS = 4; // regular rooms before the boss

export const DUNGEONS: Dungeon[] = [
  {
    id: "cellar", name: "Rat Cellar", desc: "Rats under the tavern. A first test for your blades.", level: 1, cost: 0,
    monsters: [{ name: "Rat", hp: 18, attack: 4, defense: 0, color: "#8a7a6a" }],
    boss: { name: "Giant Rat", hp: 60, attack: 8, defense: 1, color: "#6a5a4a", boss: true },
    loot: [{ id: "copper", min: 1, max: 3, chance: 0.8 }, { id: "iron", min: 1, max: 2, chance: 0.5 }],
    bossLoot: [{ id: "iron", min: 3, max: 5, chance: 1 }, { id: "ruby", min: 1, max: 1, chance: 0.1 }],
    gold: [3, 10], xp: 10, blueprintChance: 0.25,
  },
  {
    id: "mines", name: "Goblin Mines", desc: "Goblins guard rich iron and steel seams.", level: 3, cost: 30,
    monsters: [
      { name: "Goblin", hp: 30, attack: 8, defense: 2, color: "#5f8a3a" },
      { name: "Goblin Archer", hp: 24, attack: 10, defense: 1, color: "#6f9a4a" },
    ],
    boss: { name: "Goblin Chief", hp: 100, attack: 12, defense: 3, color: "#4a7a2a", boss: true },
    loot: [{ id: "iron", min: 1, max: 3, chance: 0.8 }, { id: "steel", min: 1, max: 2, chance: 0.5 }],
    bossLoot: [{ id: "steel", min: 3, max: 6, chance: 1 }, { id: "ruby", min: 1, max: 1, chance: 0.3 }, { id: "sapphire", min: 1, max: 1, chance: 0.15 }],
    gold: [8, 25], xp: 25, blueprintChance: 0.35,
  },
  {
    id: "crypt", name: "Crypt of Bones", desc: "Restless dead hoard silver and sapphires.", level: 5, cost: 80,
    monsters: [
      { name: "Skeleton", hp: 40, attack: 13, defense: 4, color: "#d8d2c0" },
      { name: "Ghoul", hp: 50, attack: 11, defense: 3, color: "#7a8a7a" },
    ],
    boss: { name: "Lich", hp: 120, attack: 18, defense: 6, color: "#6a4a9a", boss: true },
    loot: [{ id: "steel", min: 1, max: 3, chance: 0.7 }, { id: "silver", min: 1, max: 2, chance: 0.6 }],
    bossLoot: [{ id: "silver", min: 3, max: 5, chance: 1 }, { id: "sapphire", min: 1, max: 1, chance: 0.4 }, { id: "emerald", min: 1, max: 1, chance: 0.2 }],
    gold: [20, 50], xp: 50, blueprintChance: 0.4,
  },
  {
    id: "lair", name: "Dragon's Lair", desc: "Drakes guard a hoard of gold and mithril.", level: 8, cost: 200,
    monsters: [
      { name: "Drake", hp: 70, attack: 22, defense: 8, color: "#a8432a" },
      { name: "Fire Imp", hp: 45, attack: 25, defense: 5, color: "#e0702a" },
    ],
    boss: { name: "Ancient Dragon", hp: 180, attack: 26, defense: 10, color: "#8a1a1a", boss: true },
    loot: [{ id: "silver", min: 1, max: 3, chance: 0.6 }, { id: "gold", min: 1, max: 2, chance: 0.5 }, { id: "mithril", min: 1, max: 1, chance: 0.25 }],
    bossLoot: [{ id: "gold", min: 3, max: 6, chance: 1 }, { id: "mithril", min: 2, max: 4, chance: 1 }, { id: "emerald", min: 1, max: 1, chance: 0.5 }, { id: "ruby", min: 1, max: 1, chance: 0.5 }],
    gold: [50, 120], xp: 90, blueprintChance: 0.5,
  },
];

// ---- The blacksmith in a fight ----

export function playerMaxHp(): number {
  return 100 + 10 * (level() - 1) + gearStats().hp;
}

export function playerAttack(): number {
  return Math.round((2 + gearStats().attack) * attackMult()); // 2 = bare fists
}

export function playerDefense(): number {
  return gearStats().defense;
}

// ---- Battle ----

export type BattleEvent = "playerHit" | "playerCrit" | "monsterHit" | "monsterDown" | "victory" | "defeat";

export interface Battle {
  dungeon: Dungeon;
  room: number; // 0..ROOMS-1 regular rooms, ROOMS = boss
  monster: Monster;
  monsterHp: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  traits: TraitId[];
  phase: "fight" | "between" | "won" | "lost" | "retreated";
  timer: number;
  log: { text: string; color: string }[];
  loot: Partial<Record<MaterialId, number>>;
  gold: number;
  xp: number;
  blueprint?: ItemType;
  hitAnim: { who: "player" | "monster"; amount: number; crit: boolean; age: number } | null;
}

export let battle: Battle | null = null;

const EXCHANGE_TIME = 0.7; // seconds between blows
const BETWEEN_TIME = 1.2; // pause after clearing a room

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function monsterFor(d: Dungeon, room: number): Monster {
  return room >= ROOMS ? d.boss : d.monsters[Math.floor(Math.random() * d.monsters.length)];
}

function log(b: Battle, text: string, color = "#f5e6c8"): void {
  b.log.push({ text, color });
  if (b.log.length > 7) b.log.shift();
}

// Returns an error message, or null when the battle has started.
export function enterDungeon(d: Dungeon): string | null {
  if (level() < d.level) return `You need to be level ${d.level} to enter.`;
  if (save.gold < d.cost) return `You need ${d.cost}g for supplies.`;
  save.gold -= d.cost;
  persist();
  const maxHp = playerMaxHp();
  const monster = monsterFor(d, 0);
  battle = {
    dungeon: d, room: 0, monster, monsterHp: monster.hp, hp: maxHp, maxHp,
    attack: playerAttack(), defense: playerDefense(), traits: gearStats().traits,
    phase: "fight", timer: EXCHANGE_TIME, log: [], loot: {}, gold: 0, xp: 0, hitAnim: null,
  };
  log(battle, `You enter the ${d.name}. A ${monster.name} attacks!`, "#ffb347");
  return null;
}

function damage(attack: number, defense: number): number {
  return Math.max(1, Math.round(attack * (0.85 + Math.random() * 0.3) - defense * 0.5));
}

function rollLoot(b: Battle, rolls: LootRoll[]): void {
  for (const r of rolls) {
    if (Math.random() < r.chance) b.loot[r.id] = (b.loot[r.id] ?? 0) + randInt(r.min, r.max);
  }
}

function playerStrike(b: Battle, emit: (e: BattleEvent) => void): void {
  const has = (t: TraitId) => b.traits.filter((x) => x === t).length;
  const crit = Math.random() < 0.05 + 0.15 * has("keen");
  let dmg = damage(b.attack, b.monster.defense);
  if (crit) dmg = Math.round(dmg * 1.8);
  b.monsterHp -= dmg;
  b.hitAnim = { who: "monster", amount: dmg, crit, age: 0 };
  log(b, `You hit the ${b.monster.name} for ${dmg}${crit ? " (critical!)" : ""}.`, crit ? "#ffd700" : "#f5e6c8");
  emit(crit ? "playerCrit" : "playerHit");
  if (has("vampiric")) b.hp = Math.min(b.maxHp, b.hp + Math.ceil(dmg * 0.1 * has("vampiric")));
}

function monsterCleared(b: Battle, emit: (e: BattleEvent) => void): void {
  const d = b.dungeon;
  const boss = b.room >= ROOMS;
  emit("monsterDown");
  log(b, `The ${b.monster.name} is defeated!`, "#9fd86a");
  b.xp += d.xp * (boss ? 4 : 1);
  b.gold += randInt(d.gold[0], d.gold[1]) * (boss ? 3 : 1);
  rollLoot(b, boss ? d.bossLoot : d.loot);
  if (boss) {
    if (Math.random() < d.blueprintChance) {
      const locked = FORGE_ITEMS.filter((f) => !isItemUnlocked(f));
      if (locked.length) b.blueprint = locked[Math.floor(Math.random() * locked.length)].type;
    }
    b.phase = "won";
    emit("victory");
    log(b, `You cleared the ${d.name}!`, "#ffd700");
  } else {
    b.phase = "between";
    b.timer = BETWEEN_TIME;
  }
}

// Advances the battle; `emit` lets the screen play sounds and effects.
export function updateBattle(dt: number, emit: (e: BattleEvent) => void): void {
  const b = battle;
  if (!b) return;
  if (b.hitAnim) b.hitAnim.age += dt;
  if (b.phase !== "fight" && b.phase !== "between") return;
  b.timer -= dt;
  if (b.timer > 0) return;

  if (b.phase === "between") {
    // Catch your breath (heal 15%) and move on to the next room.
    b.room++;
    b.hp = Math.min(b.maxHp, b.hp + Math.round(b.maxHp * 0.15));
    b.monster = monsterFor(b.dungeon, b.room);
    b.monsterHp = b.monster.hp;
    b.phase = "fight";
    b.timer = EXCHANGE_TIME;
    log(b, b.monster.boss ? `The ${b.monster.name} awakens!` : `A ${b.monster.name} appears.`, b.monster.boss ? "#ff6040" : "#ffb347");
    return;
  }

  b.timer = EXCHANGE_TIME;
  playerStrike(b, emit);
  if (b.monsterHp > 0 && b.traits.includes("swift") && Math.random() < 0.2) {
    log(b, "Swift! You strike again.", "#9fe3ff");
    playerStrike(b, emit);
  }
  if (b.monsterHp <= 0) {
    monsterCleared(b, emit);
    return;
  }

  const dmg = damage(b.monster.attack, b.defense);
  b.hp -= dmg;
  b.hitAnim = { who: "player", amount: dmg, crit: false, age: 0 };
  log(b, `The ${b.monster.name} hits you for ${dmg}.`, "#ff8a6a");
  emit("monsterHit");
  const thorns = b.traits.filter((t) => t === "thorns").length;
  if (thorns) {
    const back = Math.ceil(dmg * 0.2 * thorns);
    b.monsterHp -= back;
    log(b, `Thorns deal ${back} back.`, "#9fd86a");
    if (b.monsterHp <= 0) {
      monsterCleared(b, emit);
      return;
    }
  }
  if (b.hp <= 0) {
    b.hp = 0;
    b.phase = "lost";
    emit("defeat");
    log(b, "You are defeated and drag yourself home.", "#ff6040");
  }
}

export function retreat(): void {
  if (battle && (battle.phase === "fight" || battle.phase === "between")) {
    battle.phase = "retreated";
    log(battle, "You retreat with what you found.", "#ffb347");
  }
}

// Collects the rewards (kept even after a defeat or retreat), wears down gear, and closes the battle.
export function leaveDungeon(): void {
  const b = battle;
  if (!b) return;
  for (const [id, n] of Object.entries(b.loot)) addMaterial(id as MaterialId, n!);
  addGold(b.gold);
  const blessed = b.traits.filter((t) => t === "blessed").length;
  addXp(Math.round(b.xp * (1 + 0.25 * blessed)));
  if (b.blueprint && !save.blueprints.includes(b.blueprint)) save.blueprints.push(b.blueprint);
  wearEquipment(4 * (b.room + 1)); // 4 durability per room entered
  persist();
  battle = null;
}
