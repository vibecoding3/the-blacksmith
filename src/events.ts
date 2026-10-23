// Game events: systems announce what happened (a monster fell, ore was mined, an item was forged)
// and others react, e.g. Adventurer's Guild quests tracking their progress.

import type { Item } from "./items";
import type { MaterialId } from "./metals";

export type GameEvent =
  | { type: "monsterDefeated"; dungeon: string; monster: string; boss: boolean }
  | { type: "dungeonCleared"; dungeon: string }
  | { type: "mined"; material: MaterialId; amount: number }
  | { type: "forged"; item: Omit<Item, "id"> }
  | { type: "newDay" };

const listeners: ((e: GameEvent) => void)[] = [];

export function onGameEvent(listener: (e: GameEvent) => void): void {
  listeners.push(listener);
}

export function emit(e: GameEvent): void {
  for (const listener of listeners) listener(e);
}
