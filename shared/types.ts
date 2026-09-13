export const characters = {
  all: "全部小马",
  twilight: "Twilight Sparkle",
  fluttershy: "Fluttershy",
  rainbow: "Rainbow Dash",
  pinkie: "Pinkie Pie",
  rarity: "Rarity",
  applejack: "Applejack",
  luna: "Princess Luna",
  celestia: "Princess Celestia",
  starlight: "Starlight Glimmer",
  sunset: "Sunset Shimmer",
  trixie: "Trixie",
  derpy: "Derpy",
  cadance: "Princess Cadance",
} as const;
export type Character = keyof typeof characters;
export type Mode = "random" | "top" | "featured" | "surprise";
export interface Pony {
  id: number;
  image: string;
  preview: string;
  width: number;
  height: number;
  tags: string[];
  artists: string[];
  score: number;
  spoilered?: boolean;
  filterId?: number;
  strictSafe?: boolean;
  wilsonScore?: number;
  favorites?: number;
  upvotes?: number;
  featured?: boolean;
  format?: string;
  createdAt?: string;
  sources?: string[];
  sourceUrl: string;
}
export interface SavedPony extends Pony {
  savedAt: number;
}
