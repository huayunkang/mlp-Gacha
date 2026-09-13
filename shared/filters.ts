export interface PonyFilter {
  id: number;
  name: string;
  description: string;
  system: boolean;
  public: boolean;
  hidden_tag_ids: number[];
  spoilered_tag_ids: number[];
  hidden_complex: string | null;
  spoilered_complex: string | null;
}
export interface FilterCatalog {
  filters: PonyFilter[];
  defaultId: number;
  fetchedAt: number;
  source: "live" | "cache" | "stale" | "fallback";
}
export const safeFilter: PonyFilter = {
  id: 0,
  name: "Pony Roulette Safe",
  description: "本站安全底线；上游过滤器暂不可用时的回退模式。",
  system: false,
  public: false,
  hidden_tag_ids: [],
  spoilered_tag_ids: [],
  hidden_complex: null,
  spoilered_complex: null,
};
