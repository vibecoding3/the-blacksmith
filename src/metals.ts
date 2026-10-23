// Metals (bought or found as ore) and gems. Forging temperatures follow real metalworking
// where it exists: steel and wrought iron are forged yellow-hot, while silver and gold melt at
// 962 °C and 1064 °C, so they are worked much cooler. Mithril is a fantasy metal.

export type MetalId = "copper" | "iron" | "steel" | "silver" | "gold" | "mithril";
export type GemId = "ruby" | "sapphire" | "emerald";
export type MaterialId = MetalId | GemId;

export interface Metal {
  id: MetalId;
  label: string;
  color: string; // colour of finished items
  forgeTemp: number; // °C the forge brings it to
  coldTemp: number; // too stiff to work below this
  quench: [number, number]; // ideal quench window, °C
  coolMult: number; // how fast it loses heat (copper and silver conduct heat away quickly)
  valueMult: number;
  statMult: number; // strength as a weapon or armor
  jewelryMult?: number; // set only for metals fine enough for jewelry
  price: number; // gold per ore at the market
  level: number; // blacksmith level needed to work it
}

export const METALS: Record<MetalId, Metal> = {
  copper: {
    id: "copper", label: "Copper", color: "#d08a4e", forgeTemp: 900, coldTemp: 650, quench: [550, 650],
    coolMult: 1.4, valueMult: 0.4, statMult: 0.5, price: 3, level: 1,
  },
  iron: {
    id: "iron", label: "Iron", color: "#9a9ea6", forgeTemp: 1250, coldTemp: 850, quench: [800, 900],
    coolMult: 1, valueMult: 0.7, statMult: 0.8, price: 5, level: 1,
  },
  steel: {
    id: "steel", label: "Steel", color: "#c8c8d0", forgeTemp: 1200, coldTemp: 800, quench: [760, 860],
    coolMult: 1, valueMult: 1, statMult: 1, price: 10, level: 2,
  },
  silver: {
    id: "silver", label: "Silver", color: "#eef0f4", forgeTemp: 700, coldTemp: 450, quench: [550, 650],
    coolMult: 1.3, valueMult: 2, statMult: 0.7, jewelryMult: 1, price: 25, level: 4,
  },
  gold: {
    id: "gold", label: "Gold", color: "#ffd24a", forgeTemp: 750, coldTemp: 500, quench: [600, 700],
    coolMult: 1.1, valueMult: 4.5, statMult: 0.6, jewelryMult: 1.5, price: 60, level: 6,
  },
  mithril: {
    id: "mithril", label: "Mithril", color: "#9fe3ff", forgeTemp: 1500, coldTemp: 1100, quench: [1000, 1100],
    coolMult: 0.8, valueMult: 10, statMult: 2, jewelryMult: 2.5, price: 150, level: 9,
  },
};
export const METAL_IDS = Object.keys(METALS) as MetalId[];

export interface Gem {
  id: GemId;
  label: string;
  color: string;
  stat: "attack" | "defense" | "hp";
  amount: number; // stat bonus on jewelry (before metal and quality)
  value: number; // gold added to the jewelry's value
  price: number; // gold at the market
}

export const GEMS: Record<GemId, Gem> = {
  ruby: { id: "ruby", label: "Ruby", color: "#e0115f", stat: "attack", amount: 4, value: 80, price: 120 },
  sapphire: { id: "sapphire", label: "Sapphire", color: "#2f6bff", stat: "defense", amount: 3, value: 80, price: 120 },
  emerald: { id: "emerald", label: "Emerald", color: "#3fcf7f", stat: "hp", amount: 20, value: 100, price: 150 },
};
export const GEM_IDS = Object.keys(GEMS) as GemId[];

export function materialLabel(id: MaterialId): string {
  return id in METALS ? `${METALS[id as MetalId].label} ore` : GEMS[id as GemId].label;
}

export function materialColor(id: MaterialId): string {
  return id in METALS ? METALS[id as MetalId].color : GEMS[id as GemId].color;
}
