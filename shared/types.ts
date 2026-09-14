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
export type ProviderId = "derpibooru" | "trixiebooru" | "twibooru";
export type ContentLevel = "safe" | "teen" | "adult";
export type AdultMode = "all" | "questionable" | "explicit";
export type Rating =
  "safe" | "suggestive" | "questionable" | "explicit" | "unknown";
export type GraphicLevel = "clean" | "dark" | "graphic";
export type NormalizedGraphicLevel = GraphicLevel | "unknown";

export interface ContentSettings {
  contentLevel: ContentLevel;
  adultMode: AdultMode;
  graphicLevel: GraphicLevel;
}

export interface NormalizedImage {
  provider: ProviderId;
  providerId: number;
  canonicalId: string;
  derpibooruId?: number;
  width: number;
  height: number;
  format: string;
  score: number;
  wilsonScore?: number;
  upvotes?: number;
  downvotes?: number;
  favorites?: number;
  tags: string[];
  artists: string[];
  sourceUrl?: string;
  sourceUrls?: string[];
  pageUrl: string;
  rating: Rating;
  graphicLevel: NormalizedGraphicLevel;
  spoilered: boolean;
  featured: boolean;
  createdAt?: string;
  representations: {
    thumb?: string;
    small?: string;
    medium?: string;
    large?: string;
    full?: string;
  };
}

export interface Pony extends Omit<NormalizedImage, "representations"> {
  /** Provider-local numeric ID, retained for older UI and saved records. */
  id: number;
  image: string;
  preview: string;
  filterId?: number;
  contentLevel: ContentLevel;
  adultMode: AdultMode;
  selectedGraphicLevel: GraphicLevel;
}

export interface SavedPony extends Pony {
  savedAt: number;
  viewedAt?: number;
}
