import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Dices,
  ExternalLink,
  Heart,
  History,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  characters,
  type AdultMode,
  type Character,
  type ContentLevel,
  type ContentSettings,
  type GraphicLevel,
  type Mode,
  type Pony,
  type ProviderId,
  type SavedPony,
} from "../shared/types";
import { randomPony, loadImage } from "./api";
import { readList, saveList, addHistory } from "./storage";
import { FilterSelector } from "./FilterSelector";
import { safeFilter, type FilterCatalog } from "../shared/filters";
import { Gacha, sound, type Stage } from "./Gacha";
import { rarity, rarities, rarityLabel } from "../shared/rarity";
import {
  blankJournal,
  discover,
  achievements,
  readJournal,
  writeJournal,
  preference,
  storePreference,
} from "./discoveries";
import { rollTags, tagCategory } from "../shared/search-tags";
import { Particles } from "./Particles";
const modes: { key: Mode; name: string; icon: typeof Dices }[] = [
  { key: "random", name: "随心遇见", icon: Dices },
  { key: "top", name: "高分佳作", icon: Sparkles },
  { key: "featured", name: "精选画廊", icon: Star },
  { key: "surprise", name: "Surprise Me", icon: Dices },
];
const providerLabels: Record<ProviderId, string> = {
  derpibooru: "Derpibooru",
  trixiebooru: "Trixiebooru",
  twibooru: "Twibooru",
};
const contentLabels: Record<ContentLevel, string> = {
  safe: "🛡 Safe",
  teen: "🌙 13+",
  adult: "🔞 18+",
};
const graphicLabels: Record<GraphicLevel, string> = {
  clean: "✨ Clean",
  dark: "🌑 Dark",
  graphic: "🩸 Graphic",
};
const isAdult = (p: Pick<Pony, "rating">) =>
  p.rating === "questionable" || p.rating === "explicit";
const contentBucket = (p: Pick<Pony, "rating">): ContentLevel =>
  p.rating === "suggestive" ? "teen" : isAdult(p) ? "adult" : "safe";
const graphicRank: Record<string, number> = {
  clean: 0,
  dark: 1,
  graphic: 2,
  unknown: 3,
};
function ponyStub(
  provider: ProviderId,
  id: number,
  rating: Pony["rating"] = "safe",
  graphicLevel: Pony["graphicLevel"] = "clean",
): SavedPony {
  return {
    id,
    provider,
    providerId: id,
    canonicalId: `${provider}:${id}`,
    width: 0,
    height: 0,
    format: "",
    score: 0,
    tags: [],
    artists: [],
    pageUrl: "",
    rating,
    graphicLevel,
    spoilered: true,
    featured: false,
    image: "",
    preview: "",
    contentLevel: rating === "safe" ? "safe" : "adult",
    adultMode: "all",
    selectedGraphicLevel:
      graphicLevel === "dark" || graphicLevel === "graphic"
        ? graphicLevel
        : "clean",
    savedAt: 0,
  };
}
function savedContentSettings(p: Pony): ContentSettings {
  return {
    contentLevel: contentBucket(p),
    adultMode:
      p.rating === "explicit"
        ? "explicit"
        : p.rating === "questionable"
          ? "questionable"
          : "all",
    graphicLevel:
      p.graphicLevel === "dark" || p.graphicLevel === "graphic"
        ? p.graphicLevel
        : "clean",
  };
}
export default function App() {
  const [character, setCharacter] = useState<Character>("all"),
    [mode, setMode] = useState<Mode>("random"),
    [pony, setPony] = useState<Pony | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [favorites, setFavorites] = useState(() => readList("pony-favorites")),
    [panel, setPanel] = useState<
      | "favorites"
      | "history"
      | "settings"
      | "filters"
      | "characters"
      | "collection"
      | "stats"
      | "details"
      | "tutorial"
      | null
    >(null),
    [more, setMore] = useState(false),
    [motion] = useState(true),
    [notice, setNotice] = useState("");
  const [catalog, setCatalog] = useState<FilterCatalog>({
    filters: [safeFilter],
    defaultId: 0,
    fetchedAt: 0,
    source: "fallback",
  });
  const [filter, setFilter] = useState(0);
  const [filtersReady, setFiltersReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [animation, setAnimation] = useState<"full" | "fast" | "off">(() =>
    preference("pony_animation", "full"),
  );
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [audio, setAudio] = useState(() => preference("pony_sound", false));
  const [background, setBackground] = useState(() =>
    preference("pony_background", true),
  );
  const [showInfo, setShowInfo] = useState(() => preference("pony_info", true));
  const [autoSpoilers, setAutoSpoilers] = useState(() =>
    preference("pony_auto_spoilers", false),
  );
  const [contentLevel, setContentLevel] = useState<ContentLevel>(() =>
    preference("pony_content_level", "safe"),
  );
  const [adultMode, setAdultMode] = useState<AdultMode>(() =>
    preference("pony_adult_mode", "all"),
  );
  const [graphicLevel, setGraphicLevel] = useState<GraphicLevel>(() =>
    preference("pony_graphic_level", "clean"),
  );
  const [adultConfirmed, setAdultConfirmed] = useState(() =>
    preference("pony_adult_confirmed", false),
  );
  const [adultConfirm, setAdultConfirm] = useState(false);
  const [blurAdultThumbs, setBlurAdultThumbs] = useState(() =>
    preference("pony_blur_adult_thumbnails", true),
  );
  const [stage, setStage] = useState<Stage>("idle");
  const [tier, setTier] = useState<ReturnType<typeof rarity>>("Common");
  const [journal, setJournal] = useState(blankJournal);
  const [journalReady, setJournalReady] = useState(false);
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("All");
  const [collectionContent, setCollectionContent] = useState<
    "all" | ContentLevel
  >("all");
  const [collectionGraphic, setCollectionGraphic] = useState<
    "all" | GraphicLevel
  >("all");
  const [service, setService] = useState("");
  const [rollTag, setRollTag] = useState("");
  const [quality, setQuality] = useState<
    "auto" | "saver" | "high" | "original"
  >(() => preference("pony_quality", "auto"));
  const restored = useRef(false);
  const activeContent: ContentSettings = {
    contentLevel,
    adultMode,
    graphicLevel,
  };
  const imageSource = useCallback(
    (
      p: Pony,
      representation: "main" | "preview" = "main",
      override?: ContentSettings,
    ) => {
      const connection = (
        navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
        }
      ).connection;
      const saver =
        quality === "saver" ||
        (quality === "auto" &&
          (connection?.saveData ||
            connection?.effectiveType === "2g" ||
            innerWidth < 650));
      const params = new URLSearchParams({
        filter: String(filter),
        content: (override ?? activeContent).contentLevel,
        adultMode: (override ?? activeContent).adultMode,
        graphic: (override ?? activeContent).graphicLevel,
      });
      if (representation === "preview") params.set("size", "preview");
      else if (quality === "original") params.set("size", "original");
      else if (saver) params.set("size", "saver");
      return `/api/image/${p.provider ?? "derpibooru"}/${p.providerId ?? p.id}?${params}`;
    },
    [quality, filter, contentLevel, adultMode, graphicLevel],
  );
  const skip = useRef(false),
    stageResolve = useRef<(() => void) | null>(null);
  const [animationSkipped, setAnimationSkipped] = useState(false);
  const skipAnimation = useCallback(() => {
    skip.current = true;
    setAnimationSkipped(true);
    stageResolve.current?.();
  }, []);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    void readJournal()
      .then((j) => {
        if (!j.items.length) {
          for (const p of [
            ...readList("pony-history"),
            ...readList("pony-favorites"),
          ])
            if (!j.items.some((i) => i.canonicalId === p.canonicalId))
              j.items.push({
                ...p,
                count: 0,
                firstSeen: p.savedAt,
                lastSeen: p.savedAt,
              });
        }
        setJournal(j);
      })
      .catch(() => setNotice("图鉴存储不可用；本次发现仅在当前页面保留。"))
      .finally(() => setJournalReady(true));
    if (!preference("pony_tutorial", false)) setPanel("tutorial");
  }, []);
  useEffect(() => {
    if (!journalReady) return;
    const earned = achievements(journal, favorites);
    const added = earned.filter((a) => !journal.achievements.includes(a));
    if (added.length) {
      setNotice(`🏆 Achievement Unlocked · ${added.join(" · ")}`);
      setJournal((j) => ({
        ...j,
        achievements: [...j.achievements, ...added],
      }));
      return;
    }
    void writeJournal(journal).catch(() =>
      setNotice("图鉴保存失败，请检查浏览器可用空间。"),
    );
  }, [journal, journalReady, favorites]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/filters", {
      signal: AbortSignal.any([c.signal, AbortSignal.timeout(12000)]),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Filters unavailable");
        return r.json();
      })
      .then((v: FilterCatalog) => {
        if (!Array.isArray(v.filters) || !Number.isInteger(v.defaultId))
          throw new Error("Invalid filter catalog");
        setCatalog(v);
        let saved = 0;
        try {
          saved = Number(localStorage.getItem("pony_filter_id"));
        } catch {}
        setFilter(v.filters.some((f) => f.id === saved) ? saved : v.defaultId);
      })
      .catch(() => {})
      .finally(() => {
        if (!c.signal.aborted) setFiltersReady(true);
      });
    return () => c.abort();
  }, []);
  const chooseFilter = (id: number) => {
    setFilter(id);
    setPony(null);
    setPanel(null);
    try {
      localStorage.setItem("pony_filter_id", String(id));
    } catch {
      setNotice("过滤器设置无法保存");
    }
  };
  const currentFilter =
    catalog.filters.find((f) => f.id === filter) ?? safeFilter;
  const chooseContentLevel = (level: ContentLevel) => {
    if (level === "adult" && !adultConfirmed) {
      setAdultConfirm(true);
      return;
    }
    setContentLevel(level);
    storePreference("pony_content_level", level);
  };
  const chooseGraphicLevel = (level: GraphicLevel) => {
    setGraphicLevel(level);
    storePreference("pony_graphic_level", level);
  };
  const active = useRef<AbortController | null>(null),
    prefetch = useRef<{
      key: string;
      promise: Promise<Pony>;
      controller: AbortController;
    } | null>(null),
    locked = useRef(false),
    currentId = useRef<string | undefined>(undefined),
    pendingAdult = useRef<SavedPony | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const remember = useCallback((p: Pony) => {
    currentId.current = p.canonicalId;
    setPony(p);
    setMore(false);
    setRevealed(false);
    if (!addHistory(p)) setNotice("浏览器存储空间不足，历史记录未保存。");
  }, []);
  const next = useCallback(async () => {
    if (locked.current || !filtersReady || !journalReady) return;
    if (!navigator.onLine) {
      setError("You're offline · 重新连接网络后继续发现小马。");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    skip.current = false;
    setAnimationSkipped(false);
    setTier("Common");
    setStage("spin");
    if (audio) sound("spin");
    const controller = new AbortController();
    active.current = controller;
    const started = Date.now();
    try {
      const key = `${character}:${mode}:${filter}:${contentLevel}:${adultMode}:${graphicLevel}:${rollTag}`;
      const pending = prefetch.current;
      if (pending)
        controller.signal.addEventListener(
          "abort",
          () => pending.controller.abort(),
          { once: true },
        );
      prefetch.current = null;
      const p = await (pending?.key === key
        ? pending.promise.catch(() =>
            randomPony(
              character,
              mode,
              controller.signal,
              currentId.current,
              filter,
              rollTag,
              activeContent,
            ),
          )
        : randomPony(
            character,
            mode,
            controller.signal,
            currentId.current,
            filter,
            rollTag,
            activeContent,
          ));
      const item = {
        ...p,
        image: imageSource(p),
        preview: imageSource(p, "preview"),
        spoilered: p.spoilered || (blurAdultThumbs && isAdult(p)),
      };
      await loadImage(item.image, controller.signal);
      const fast = reduced || animation === "fast";
      const pause = (ms: number) =>
        new Promise<void>((resolve) => {
          if (
            skip.current ||
            animation === "off" ||
            controller.signal.aborted
          ) {
            resolve();
            return;
          }
          const done = () => {
            clearTimeout(t);
            controller.signal.removeEventListener("abort", done);
            stageResolve.current = null;
            resolve();
          };
          const t = setTimeout(done, ms);
          stageResolve.current = done;
          controller.signal.addEventListener("abort", done, { once: true });
        });
      await pause(Math.max(0, (fast ? 120 : 700) - (Date.now() - started)));
      setTier(rarity(item));
      setStage("drop");
      if (audio && !skip.current) sound("drop");
      if (!reduced) navigator.vibrate?.(15);
      await pause(fast ? 100 : 450);
      setStage("reveal");
      if (audio && !skip.current) sound(rarity(item));
      await pause(fast ? 100 : rarities.indexOf(rarity(item)) >= 3 ? 850 : 400);
      if (controller.signal.aborted) return;
      remember(item);
      setRevealed(autoSpoilers && !(blurAdultThumbs && isAdult(item)));
      setJournal((j) => discover(j, item));
      if (rarity(item) === "Harmony" && !reduced)
        navigator.vibrate?.([20, 30, 20]);
      const shareUrl = new URL(location.href);
      shareUrl.searchParams.set("image", `${p.provider}:${p.providerId}`);
      if (isAdult(p)) shareUrl.searchParams.set("adult", "1");
      else shareUrl.searchParams.delete("adult");
      if (p.graphicLevel === "dark" || p.graphicLevel === "graphic")
        shareUrl.searchParams.set("graphic", p.graphicLevel);
      else shareUrl.searchParams.delete("graphic");
      history.replaceState(null, "", shareUrl);
      const pc = new AbortController();
      const promise = randomPony(
        character,
        mode,
        pc.signal,
        item.canonicalId,
        filter,
        rollTag,
        activeContent,
      );
      promise.catch(() => {});
      prefetch.current = { key, promise, controller: pc };
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "暂时没找到小马，再试一次 ✨",
        );
    } finally {
      if (active.current === controller) {
        setBusy(false);
        setStage("idle");
        locked.current = false;
      }
    }
  }, [
    character,
    mode,
    filter,
    remember,
    filtersReady,
    journalReady,
    animation,
    reduced,
    audio,
    autoSpoilers,
    imageSource,
    rollTag,
    contentLevel,
    adultMode,
    graphicLevel,
    blurAdultThumbs,
  ]);
  useEffect(() => {
    active.current?.abort();
    prefetch.current?.controller.abort();
    prefetch.current = null;
    locked.current = false;
    setBusy(false);
    setStage("idle");
    skipAnimation();
    setPony(null);
    return () => {
      active.current?.abort();
      prefetch.current?.controller.abort();
    };
  }, [character, mode, filter, contentLevel, adultMode, graphicLevel, rollTag]);
  const toggleFavorite = useCallback(() => {
    if (!pony) return;
    setFavorites((old) => {
      const list = old.some((p) => p.canonicalId === pony.canonicalId)
        ? old.filter((p) => p.canonicalId !== pony.canonicalId)
        : [{ ...pony, savedAt: Date.now() }, ...old].slice(0, 1000);
      if (!saveList("pony-favorites", list))
        setNotice("收藏未能保存：浏览器存储不可用或空间不足。");
      return list;
    });
  }, [pony]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        panel ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (e.code === "Space" || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (busy) skipAnimation();
        else void next();
      }
      if (e.key.toLowerCase() === "f") toggleFavorite();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, toggleFavorite, panel, busy, skipAnimation]);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  const reopen = async (p: SavedPony, override?: ContentSettings) => {
    let requested = override ?? activeContent;
    if (isAdult(p) && requested.contentLevel !== "adult") {
      if (!adultConfirmed && !override) {
        pendingAdult.current = p;
        setAdultConfirm(true);
        setPanel("filters");
        return;
      }
      requested = { ...requested, contentLevel: "adult" };
      setContentLevel("adult");
      storePreference("pony_content_level", "adult");
    }
    if (
      p.graphicLevel !== "unknown" &&
      graphicRank[p.graphicLevel] > graphicRank[requested.graphicLevel]
    ) {
      setPanel("filters");
      setNotice("这张图片超出当前图形内容等级，请先调整 Graphic Content。");
      return;
    }
    active.current?.abort();
    prefetch.current?.controller.abort();
    prefetch.current = null;
    skipAnimation();
    setStage("idle");
    locked.current = true;
    const c = new AbortController();
    active.current = c;
    setPanel(null);
    setBusy(true);
    setError("");
    try {
      let item: Pony = { ...p, spoilered: true };
      if (!navigator.onLine) {
        const known = [
          ...readList("pony-favorites"),
          ...readList("pony-history"),
          ...journal.items,
        ].find((item) => item.canonicalId === p.canonicalId);
        if (!known) throw new Error("Offline metadata unavailable");
        item = { ...known, spoilered: true };
      }
      if (navigator.onLine) {
        const params = new URLSearchParams({
          filter: String(filter),
          content: requested.contentLevel,
          adultMode: requested.adultMode,
          graphic: requested.graphicLevel,
        });
        const r = await fetch(
          `/api/metadata/${p.provider}/${p.providerId}?${params}`,
          {
            signal: AbortSignal.any([c.signal, AbortSignal.timeout(40000)]),
          },
        );
        if (!r.ok) throw new Error("Image unavailable");
        item = (await r.json()) as Pony;
      }
      item = {
        ...item,
        image: imageSource(item, "main", requested),
        preview: imageSource(item, "preview", requested),
        spoilered: item.spoilered || (blurAdultThumbs && isAdult(item)),
      };
      await loadImage(item.image, c.signal);
      if (!c.signal.aborted) {
        remember(item);
        setRevealed(autoSpoilers && !(blurAdultThumbs && isAdult(item)));
        const u = new URL(location.href);
        u.searchParams.set("image", `${item.provider}:${item.providerId}`);
        if (isAdult(item)) u.searchParams.set("adult", "1");
        else u.searchParams.delete("adult");
        if (item.graphicLevel === "dark" || item.graphicLevel === "graphic")
          u.searchParams.set("graphic", item.graphicLevel);
        else u.searchParams.delete("graphic");
        history.replaceState(null, "", u);
      }
    } catch {
      if (!c.signal.aborted) setError("这张图片暂时无法加载，请稍后重试。");
    } finally {
      if (active.current === c) {
        setBusy(false);
        locked.current = false;
      }
    }
  };
  const confirmAdultAccess = () => {
    const pending = pendingAdult.current;
    pendingAdult.current = null;
    const nextAdultMode = pending ? "all" : adultMode;
    setAdultConfirmed(true);
    setContentLevel("adult");
    setAdultMode(nextAdultMode);
    setAdultConfirm(false);
    storePreference("pony_adult_confirmed", true);
    storePreference("pony_content_level", "adult");
    storePreference("pony_adult_mode", nextAdultMode);
    if (pending)
      void reopen(pending, {
        contentLevel: "adult",
        adultMode: nextAdultMode,
        graphicLevel,
      });
  };
  useEffect(() => {
    if (!filtersReady || restored.current) return;
    restored.current = true;
    const params = new URLSearchParams(location.search);
    const value = params.get("image") ?? "";
    const match =
      /^(?:(derpibooru|trixiebooru|twibooru):)?([1-9]\d{0,9})$/.exec(value);
    if (!match) return;
    const item = ponyStub(
      (match[1] as ProviderId | undefined) ?? "derpibooru",
      Number(match[2]),
      params.get("adult") === "1" ? "questionable" : "safe",
      params.get("graphic") === "dark" || params.get("graphic") === "graphic"
        ? (params.get("graphic") as GraphicLevel)
        : "clean",
    );
    if (params.get("adult") === "1" && !adultConfirmed) {
      pendingAdult.current = item;
      setAdultConfirm(true);
      setPanel("filters");
      return;
    }
    void reopen(item);
  }, [filtersReady]);
  const saved =
    pony && favorites.some((p) => p.canonicalId === pony.canonicalId);
  const names = pony
    ? Object.entries(characters)
        .filter(([k, v]) => k !== "all" && pony.tags.includes(v.toLowerCase()))
        .map(([, v]) => v)
    : [];
  const list =
    panel === "favorites"
      ? favorites
      : panel === "collection"
        ? journal.items
            .filter((p) => rarityFilter === "All" || rarity(p) === rarityFilter)
            .filter(
              (p) =>
                collectionContent === "all" ||
                contentBucket(p) === collectionContent,
            )
            .filter(
              (p) =>
                collectionGraphic === "all" ||
                p.graphicLevel === collectionGraphic,
            )
            .map((p) => ({ ...p, savedAt: p.lastSeen }))
        : readList("pony-history");
  const share = async () => {
    if (!pony) return;
    const shared = new URL(location.origin);
    shared.searchParams.set("image", `${pony.provider}:${pony.providerId}`);
    if (isAdult(pony)) shared.searchParams.set("adult", "1");
    if (pony.graphicLevel === "dark" || pony.graphicLevel === "graphic")
      shared.searchParams.set("graphic", pony.graphicLevel);
    const url = shared.toString();
    const text = `Pony Roulette Discovery · ${rarityLabel(pony)} · ${names.join(", ") || "MLP"} · #${pony.id}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "Pony Roulette Discovery", text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setNotice("发现卡片与链接已复制");
      }
    } catch {
      setNotice("分享未完成，你可以复制地址栏链接。");
    }
  };
  return (
    <div
      className={`${motion && !reduced && animation !== "off" ? "app" : "app no-motion"} ${pony ? "has-result" : "first-roll"} ${busy ? "rolling" : ""} ${error ? "has-error" : ""}`}
    >
      <header>
        <a className="brand" href="/" aria-label="Pony Roulette 首页">
          <span className="brand-icon">
            <Sparkles size={23} />
          </span>
          <span>
            Pony<span className="brand-light">Roulette</span>
            <small>A LITTLE BIT OF WONDER</small>
          </span>
        </a>
        <nav>
          <button onClick={() => setPanel("filters")}>
            {contentLevel === "adult" || graphicLevel === "graphic" ? "⚠" : "🛡"}{" "}
            {contentLabels[contentLevel]} · {graphicLabels[graphicLevel]}
          </button>
          <button onClick={() => setPanel("collection")}>
            图鉴 <b>{journal.items.length}</b>
          </button>
          <button onClick={() => setPanel("stats")}>Profile</button>
          <button aria-label="最近看过" onClick={() => setPanel("history")}>
            <History size={17} />
            <span>最近看过</span>
          </button>
          <button aria-label="我的收藏" onClick={() => setPanel("favorites")}>
            <Heart size={17} />
            <span>我的收藏</span>
            <b>{favorites.length}</b>
          </button>
          <button
            className="icon-button"
            aria-label="设置"
            onClick={() => setPanel("settings")}
          >
            <Settings2 size={19} />
          </button>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span /> A SMALL DOSE OF PONY MAGIC
          </div>
          <h1>
            Every roll, <em>a new pony.</em>
            <Sparkles className="heading-star" size={25} />
          </h1>
          <p>转动一点魔法，收藏一次心动。</p>
        </section>
        <section className="discovery" aria-label="随机小马画廊">
          <div className="toolbar">
            <div className="mode-tabs" aria-label="随机模式">
              {modes.map(({ key, name, icon: Icon }) => (
                <button
                  key={key}
                  aria-pressed={mode === key}
                  className={mode === key ? "selected" : ""}
                  onClick={() => setMode(key)}
                >
                  <Icon size={16} />
                  {name}
                </button>
              ))}
            </div>
            <button
              className="character-select"
              onClick={() => setPanel("characters")}
            >
              {characters[character]} <ChevronDown size={14} />
            </button>
            <button
              className="character-select content-select"
              onClick={() => setPanel("filters")}
            >
              {contentLabels[contentLevel]} · {graphicLabels[graphicLevel]}{" "}
              <ChevronDown size={14} />
            </button>
            {rollTag && (
              <button onClick={() => setRollTag("")}>Tag: {rollTag} ×</button>
            )}
            <label className="character-select legacy-select" hidden>
              <span className="dot" />
              <select
                aria-label="选择角色"
                value={character}
                onChange={(e) => setCharacter(e.target.value as Character)}
              >
                {Object.entries(characters).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          <div className="gacha-layout">
            <Gacha
              stage={stage}
              tier={tier}
              fast={reduced || animation !== "full" || animationSkipped}
              onRoll={() => void next()}
              onSkip={skipAnimation}
            />
            <div className="result-area">
              <div
                className={`art-stage ${busy ? "is-loading" : ""} ${pony ? `tier-${rarity(pony)}` : ""}`}
                aria-busy={busy}
                onClick={() => {
                  if (busy) skipAnimation();
                }}
              >
                {pony && (
                  <>
                    {background && !(pony.spoilered && !revealed) && (
                      <div
                        className="ambient"
                        style={{
                          backgroundImage: `url("${imageSource(pony, "preview")}")`,
                        }}
                      />
                    )}
                    <img
                      className={`main-art ${pony.spoilered && !revealed ? "spoiler-art" : ""}`}
                      src={pony.image}
                      alt={`${names.join("、") || "MLP"} artwork · ${pony.artists.join(", ")}`}
                      onError={() => setError("图片加载失败，请再试一次 ✨")}
                      onClick={() => {
                        if (!busy && (!pony.spoilered || revealed))
                          setPanel("details");
                      }}
                    />
                  </>
                )}
                {pony?.spoilered && !revealed && !busy && (
                  <button
                    className="spoiler-cover"
                    onClick={() => setRevealed(true)}
                  >
                    {isAdult(pony) ? "🔞 Adult Content" : "⚠ Spoiler"} ·
                    点击显示
                  </button>
                )}
                {pony && !busy && (
                  <Particles
                    key={pony.canonicalId}
                    tier={rarity(pony)}
                    enabled={!reduced && animation === "full" && !skip.current}
                  />
                )}
                <div className="safe-badge">
                  <ShieldCheck size={13} /> {contentLevel.toUpperCase()} ·{" "}
                  {graphicLevel.toUpperCase()}
                </div>
                <span className="frame-star top">✧</span>
                <span className="frame-star bottom">✧</span>
                {(busy || error || !pony) && (
                  <div
                    className={`stage-message ${error ? "error" : ""}`}
                    role="status"
                  >
                    <span className="magic-orbit">
                      <Sparkles size={32} />
                    </span>
                    <h2>
                      {error
                        ? "这次胶囊好像卡住了……"
                        : busy
                          ? "一点魔法，即将抵达"
                          : "Your next discovery awaits"}
                    </h2>
                    <p>{error ? error : "让一点点美好，落在你的今天。"}</p>
                    {error && (
                      <>
                        <button className="retry" onClick={() => void next()}>
                          再试一次 <ArrowRight size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setMode("random");
                            setError("");
                          }}
                        >
                          切换 Random
                        </button>
                        <button
                          onClick={() => {
                            setCharacter("all");
                            setError("");
                          }}
                        >
                          取消角色筛选
                        </button>
                      </>
                    )}
                  </div>
                )}
                {pony && !busy && !error && (
                  <div className="image-number">
                    NO. {String(pony.id).padStart(7, "0")}
                  </div>
                )}
              </div>
              <div className="below-art">
                <div className="art-caption">
                  {pony && !busy && (
                    <>
                      <div className={`rarity-badge tier-${rarity(pony)}`}>
                        {rarityLabel(pony)}
                      </div>
                      <small className="new-discovery">
                        {(journal.items.find(
                          (item) => item.canonicalId === pony.canonicalId,
                        )?.count ?? 1) > 1
                          ? `DUPLICATE ×${journal.items.find((item) => item.canonicalId === pony.canonicalId)?.count}`
                          : "✨ NEW DISCOVERY"}
                        {journal.streak > 1
                          ? ` · ${journal.streak} NEW STREAK`
                          : ""}
                      </small>
                    </>
                  )}
                  <h2>
                    {names.join(" & ") ||
                      (pony
                        ? "A little unexpected magic"
                        : "下一份惊喜，正在路上")}
                  </h2>
                  <p>
                    {pony
                      ? pony.artists
                          .map((a) => a.replace("artist:", ""))
                          .join(" · ") || "画师未标注"
                      : "来自 MLP 创作者的奇妙世界"}
                    {pony && <span className="artist-label"> / ARTIST</span>}
                  </p>
                </div>
                <div className="actions">
                  <button
                    disabled={!pony || busy}
                    className={`favorite ${saved ? "is-saved" : ""}`}
                    onClick={toggleFavorite}
                  >
                    <Heart size={19} fill={saved ? "currentColor" : "none"} />
                    {saved ? "已收藏" : "收藏"}
                  </button>
                  <button
                    className="roll"
                    disabled={busy}
                    onClick={() => void next()}
                  >
                    <Dices size={20} className={busy ? "spinning" : ""} />
                    {busy ? "魔法酝酿中…" : "再抽一次"}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="image-details">
            {pony ? (
              <>
                <div className="stats">
                  <span>
                    <Star size={14} /> {pony.score}
                  </span>
                  <span>
                    {pony.width} × {pony.height}
                  </span>
                  <span>#{pony.id}</span>
                </div>
                <a
                  href={pony.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看 {providerLabels[pony.provider]} 原页面{" "}
                  <ExternalLink size={13} />
                </a>
              </>
            ) : (
              <span>一份惊喜 · 一点灵感 · 一只小马</span>
            )}
          </div>
          {pony && showInfo && (
            <div className="tags">
              {(more
                ? pony.tags
                : pony.tags.filter((t) => !t.startsWith("artist:")).slice(0, 7)
              ).map((t) => (
                <span key={t}>{t}</span>
              ))}
              {pony.tags.length > 7 && (
                <button onClick={() => setMore(!more)}>
                  {more ? "收起标签" : "更多标签"} <ChevronDown size={12} />
                </button>
              )}
            </div>
          )}
        </section>
        <div className="under-note">
          <span>
            <ShieldCheck size={14} /> {contentLabels[contentLevel]} ·{" "}
            {graphicLabels[graphicLevel]} · {currentFilter.name}
          </span>
          <span className="keyboard">
            <kbd>Space</kbd> 下一张 <i>·</i> <kbd>F</kbd> 收藏
          </span>
        </div>
      </main>
      <footer>
        <span>Made for the magic of discovering.</span>
        <span>
          Artwork belongs to its respective artists.{" "}
          <span className="footer-star">✧</span>
        </span>
      </footer>
      {notice && (
        <div role="status" className="toast">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className={`panel-${panel}`}
        onCancel={() => setPanel(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setPanel(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">YOUR LITTLE COLLECTION</span>
            <h2>
              {panel === "favorites"
                ? "我的收藏"
                : panel === "history"
                  ? "最近看过"
                  : panel === "filters"
                    ? "Filters"
                    : panel === "characters"
                      ? "Choose your pony"
                      : panel === "collection"
                        ? "My Collection"
                        : panel === "stats"
                          ? "My Pony Profile"
                          : panel === "details"
                            ? "Image Details"
                            : panel === "tutorial"
                              ? "Welcome to Pony Gacha"
                              : "偏好设置"}
            </h2>
          </div>
          <button
            aria-label="关闭"
            className="icon-button"
            onClick={() => setPanel(null)}
          >
            <X />
          </button>
        </div>
        {panel === "tutorial" ? (
          <div className="settings">
            <h3>01 · 选择喜欢的 Filter</h3>
            <p>首次使用 Safe + Clean；两个内容维度可以独立调整。</p>
            <h3>02 · 选择角色</h3>
            <p>找熟悉的小马，或把惊喜交给随机。</p>
            <h3>03 · 转动扭蛋机</h3>
            <p>Space 跳过演出 / 下一抽 · F 收藏 · Esc 关闭</p>
            <button
              className="roll"
              onClick={() => {
                storePreference("pony_tutorial", true);
                setPanel(null);
              }}
            >
              Let's Roll →
            </button>
          </div>
        ) : panel === "characters" ? (
          <div className="settings">
            <input
              aria-label="搜索角色"
              placeholder="搜索角色…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => {
                const keys = Object.keys(characters).filter(
                  (k) => k !== "all",
                ) as Character[];
                const key = keys[Math.floor(Math.random() * keys.length)]!;
                setCharacter(key);
                setNotice(`Today's pony: ${characters[key]}`);
                setPanel(null);
              }}
            >
              🎲 Random Character
            </button>
            {["Any Pony", "Mane Six", "Princesses", "Others"].map(
              (group, g) => (
                <section key={group}>
                  <h3>{group}</h3>
                  <div className="character-grid">
                    {Object.entries(characters)
                      .filter(
                        ([key, name], i) =>
                          (g === 0
                            ? i === 0
                            : g === 1
                              ? i >= 1 && i <= 6
                              : g === 2
                                ? ["luna", "celestia", "cadance"].includes(key)
                                : i > 6 &&
                                  !["luna", "celestia", "cadance"].includes(
                                    key,
                                  )) &&
                          name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map(([key, name]) => (
                        <button
                          className={key === character ? "selected" : ""}
                          key={key}
                          onClick={() => {
                            setCharacter(key as Character);
                            setPanel(null);
                          }}
                        >
                          <span>✧</span>
                          {name}
                        </button>
                      ))}
                  </div>
                </section>
              ),
            )}
          </div>
        ) : panel === "stats" ? (
          <div className="settings">
            <div className="profile-grid">
              {[
                ["Total Rolls", journal.totalRolls],
                ["Unique Discoveries", journal.items.length],
                [
                  "Duplicates",
                  journal.items.reduce(
                    (n, p) => n + Math.max(0, p.count - 1),
                    0,
                  ),
                ],
                ["Favorites", favorites.length],
                ["New Streak", journal.streak],
                [
                  "Harmony",
                  journal.items.filter((p) => rarity(p) === "Harmony").length,
                ],
              ].map(([name, n]) => (
                <div key={name}>
                  <strong>{n}</strong>
                  <span>{name}</span>
                </div>
              ))}
            </div>
            <p>
              Rarest Pull ·{" "}
              {journal.items.length
                ? rarities[
                    Math.max(
                      ...journal.items.map((p) => rarities.indexOf(rarity(p))),
                    )
                  ]
                : "—"}
            </p>
            <p>
              Favorite Pony ·{" "}
              {Object.values(characters)
                .slice(1)
                .map((name) => ({
                  name,
                  n: favorites.filter((p) =>
                    p.tags.includes(name.toLowerCase()),
                  ).length,
                }))
                .sort((a, b) => b.n - a.n)
                .find((p) => p.n)?.name ?? "—"}
            </p>
            <p>
              Most Seen Character ·{" "}
              {Object.values(characters)
                .slice(1)
                .map((name) => ({
                  name,
                  n: journal.items.reduce(
                    (n, p) =>
                      n + (p.tags.includes(name.toLowerCase()) ? p.count : 0),
                    0,
                  ),
                }))
                .sort((a, b) => b.n - a.n)
                .find((p) => p.n)?.name ?? "—"}
            </p>
            <p>
              Favorite Artist ·{" "}
              {Object.entries(
                favorites
                  .flatMap((p) => p.artists)
                  .reduce<Record<string, number>>(
                    (a, n) => ({ ...a, [n]: (a[n] ?? 0) + 1 }),
                    {},
                  ),
              ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}
            </p>
            <h3>Achievements</h3>
            <div className="achievement-grid">
              {[
                "First Roll",
                "New Collector",
                "Mane Six",
                "Lucky Pony",
                "Harmony",
                "Explorer",
              ].map((a) => (
                <span
                  className={journal.achievements.includes(a) ? "unlocked" : ""}
                  key={a}
                >
                  ✧ {a}
                </span>
              ))}
            </div>
            <small>只记录当前浏览器的数据。无需账号，永远免费。</small>
          </div>
        ) : panel === "details" && pony ? (
          <div className="settings">
            <div className={`rarity-badge tier-${rarity(pony)}`}>
              {rarityLabel(pony)}
            </div>
            <p>
              #{pony.id} · {names.join(", ") || "MLP"}
            </p>
            <p>Artist · {pony.artists.join(", ") || "未标注"}</p>
            <p>
              Score {pony.score} · Wilson {pony.wilsonScore ?? "—"}
            </p>
            <p>
              {pony.width} × {pony.height} · {pony.format ?? "—"}
            </p>
            <p>Created · {pony.createdAt ?? "—"}</p>
            <p>Data Source · {providerLabels[pony.provider]}</p>
            <p>
              Content · {pony.rating} / {pony.graphicLevel}
            </p>
            {pony.featured && (
              <p>⭐ Featured on {providerLabels[pony.provider]}</p>
            )}
            {pony.score >= 600 && <p>✦ Community Favorite</p>}
            <button className="roll" onClick={() => void share()}>
              Share Discovery ↗
            </button>
            <a href={pony.pageUrl} target="_blank" rel="noopener noreferrer">
              {providerLabels[pony.provider]} Page ↗
            </a>
            {pony.sourceUrls?.map((s) => (
              <a key={s} href={s} target="_blank" rel="noopener noreferrer">
                Source ↗
              </a>
            ))}
            <div className="tags">
              {pony.tags.map((t) => (
                <span className={`tag-${tagCategory(t)}`} key={t}>
                  {t}
                  {rollTags.includes(t) && (
                    <button
                      onClick={() => {
                        setRollTag(t);
                        setPanel(null);
                        setNotice(`Roll with this tag: ${t} · 点击 ROLL 开始`);
                      }}
                    >
                      Roll with this tag →
                    </button>
                  )}
                </span>
              ))}
            </div>
            <small>稀有度是本站图片发现机制，并非 Derpibooru 官方评级。</small>
          </div>
        ) : panel === "filters" ? (
          <div className="settings filter-settings">
            <section className="content-filter-section">
              <span className="eyebrow">SEXUAL CONTENT</span>
              <div className="content-choice-grid">
                {(
                  [
                    ["safe", "🛡 Safe", "普通公开内容"],
                    ["teen", "🌙 13+", "轻度暗示内容"],
                    ["adult", "🔞 18+", "成人内容"],
                  ] as const
                ).map(([value, label, description]) => (
                  <button
                    key={value}
                    className={contentLevel === value ? "selected" : ""}
                    aria-pressed={contentLevel === value}
                    onClick={() => chooseContentLevel(value)}
                  >
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
              {contentLevel === "adult" && (
                <div className="adult-modes">
                  <span>ADULT CONTENT</span>
                  {(
                    [
                      ["all", "All Adult"],
                      ["questionable", "Questionable"],
                      ["explicit", "Explicit Only"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={adultMode === value ? "selected" : ""}
                      onClick={() => {
                        setAdultMode(value);
                        storePreference("pony_adult_mode", value);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="content-filter-section">
              <span className="eyebrow">GRAPHIC CONTENT</span>
              <div className="content-choice-grid">
                {(
                  [
                    ["clean", "✨ Clean", "隐藏黑暗、血腥和猎奇"],
                    ["dark", "🌑 Dark", "允许 Grimdark，隐藏明显血腥"],
                    ["graphic", "🩸 Graphic", "允许重度图形内容"],
                  ] as const
                ).map(([value, label, description]) => (
                  <button
                    key={value}
                    className={graphicLevel === value ? "selected" : ""}
                    aria-pressed={graphicLevel === value}
                    onClick={() => chooseGraphicLevel(value)}
                  >
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
              <small>性内容与图形内容是两个独立维度，互不自动改变。</small>
            </section>
            <section className="content-filter-section advanced-filter">
              <span className="eyebrow">DERPIBOORU FILTER · ADVANCED</span>
              <FilterSelector
                catalog={catalog}
                selected={filter}
                onSelect={chooseFilter}
              />
            </section>
            {adultConfirm && (
              <div
                className="filter-confirm adult-confirm"
                role="alertdialog"
                aria-label="Adult Content 确认"
              >
                <h3>Adult Content</h3>
                <p>
                  此模式可能显示明确的成人内容。只有在你已满 18
                  岁，并且此类内容在你所在地允许查看时，才应继续。
                </p>
                <button
                  onClick={() => {
                    pendingAdult.current = null;
                    setAdultConfirm(false);
                  }}
                >
                  返回
                </button>
                <button className="roll" onClick={confirmAdultAccess}>
                  我已满 18 岁，继续
                </button>
              </div>
            )}
          </div>
        ) : panel === "settings" ? (
          <div className="settings">
            <label>
              抽取动画
              <select
                value={animation}
                onChange={(e) => {
                  setAnimation(e.target.value as typeof animation);
                  storePreference("pony_animation", e.target.value);
                }}
              >
                <option value="full">完整 Full</option>
                <option value="fast">快速 Fast</option>
                <option value="off">关闭 Off</option>
              </select>
            </label>
            {reduced && (
              <small>系统已启用减少动态效果，自动使用快速模式。</small>
            )}
            <label>
              Image Quality
              <select
                value={quality}
                onChange={(e) => {
                  setQuality(e.target.value as typeof quality);
                  storePreference("pony_quality", e.target.value);
                }}
              >
                <option value="auto">Auto</option>
                <option value="saver">Data Saver</option>
                <option value="high">High Quality</option>
                <option value="original">Original</option>
              </select>
            </label>
            <small>
              清晰度应用于下一张图片；Auto
              会考虑手机屏幕与省流量设置。原图仍受代理大小上限保护。
            </small>
            {(
              [
                ["Sound Effects", audio, setAudio, "pony_sound"],
                [
                  "Blur adult thumbnails",
                  blurAdultThumbs,
                  setBlurAdultThumbs,
                  "pony_blur_adult_thumbnails",
                ],
                [
                  "Auto Reveal Spoilers",
                  autoSpoilers,
                  setAutoSpoilers,
                  "pony_auto_spoilers",
                ],
                ["Show Image Info", showInfo, setShowInfo, "pony_info"],
                [
                  "Background Blur",
                  background,
                  setBackground,
                  "pony_background",
                ],
              ] as const
            ).map(([name, checked, set, key]) => (
              <label key={key}>
                {name}
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    set(e.target.checked);
                    storePreference(key, e.target.checked);
                  }}
                />
              </label>
            ))}
            <button onClick={() => setPanel("filters")}>
              Filter · {currentFilter.name}
            </button>
            <details>
              <summary>高级设置 · Service Status</summary>
              <button
                onClick={() => {
                  setService("检查中");
                  void fetch("/api/health")
                    .then((r) => r.json())
                    .then((v) => {
                      const status = (id: ProviderId) =>
                        v.providers?.[id] === "online"
                          ? "● Online"
                          : v.providers?.[id] === "unknown"
                            ? "◌ Waiting"
                            : "○ Unavailable";
                      setService(
                        `Derpibooru · ${status("derpibooru")} · Primary\nTrixiebooru · ${status("trixiebooru")} · Backup\nTwibooru · ${status("twibooru")} · Emergency Backup\nActive · ${v.active ? providerLabels[v.active as ProviderId] : "等待首次抽取"}\nMedia Cache · ${v.mediaCache === "edge" ? "Cloudflare Edge" : "R2 + Edge"}`,
                      );
                    })
                    .catch(() => setService("服务暂不可用"));
                }}
              >
                检查连接
              </button>
              <pre>{service}</pre>
            </details>
            <small>
              图片经本站加载；来源链接仅在主动点击时打开。收藏和最近 50
              张浏览记录保存在当前浏览器。
            </small>
          </div>
        ) : (
          <>
            {panel === "collection" && (
              <div className="collection-filters">
                <div className="rarity-tabs">
                  {["All", ...rarities].map((r) => (
                    <button
                      className={rarityFilter === r ? "selected" : ""}
                      key={r}
                      onClick={() => setRarityFilter(r)}
                    >
                      {r}{" "}
                      {r === "All"
                        ? journal.items.length
                        : journal.items.filter((p) => rarity(p) === r).length}
                    </button>
                  ))}
                </div>
                <div className="rarity-tabs compact-tabs">
                  {(
                    [
                      ["all", "All"],
                      ["safe", "Safe"],
                      ["teen", "13+"],
                      ["adult", "18+"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={collectionContent === value ? "selected" : ""}
                      onClick={() => setCollectionContent(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="rarity-tabs compact-tabs">
                  {(["all", "clean", "dark", "graphic"] as const).map(
                    (value) => (
                      <button
                        key={value}
                        className={
                          collectionGraphic === value ? "selected" : ""
                        }
                        onClick={() => setCollectionGraphic(value)}
                      >
                        {value === "all"
                          ? "All"
                          : graphicLabels[value].replace(/^\S+\s/, "")}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {list.length ? (
              <div className="collection-grid">
                {list.map((p) => (
                  <button
                    key={p.canonicalId}
                    title={`${p.artists.join(", ") || "Artist 未标注"} · Score ${p.score} · 查看`}
                    onClick={() => void reopen(p)}
                  >
                    <img
                      src={imageSource(p, "preview", savedContentSettings(p))}
                      loading="lazy"
                      alt={p.tags.slice(0, 3).join(", ")}
                      className={
                        p.spoilered !== false ||
                        (isAdult(p) &&
                          (blurAdultThumbs || contentLevel !== "adult"))
                          ? "spoiler-art"
                          : ""
                      }
                    />
                    <span>
                      #{p.id}{" "}
                      {favorites.some(
                        (favorite) => favorite.canonicalId === p.canonicalId,
                      ) && <Check size={13} />}
                    </span>
                    <small className={`rarity-badge tier-${rarity(p)}`}>
                      {rarityLabel(p)}
                    </small>
                    <small>
                      {Object.values(characters).find((n) =>
                        p.tags.includes(n.toLowerCase()),
                      ) ?? "MLP"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty">
                <Heart size={35} />
                <h3>
                  {panel === "favorites"
                    ? "把喜欢的小马留在这里"
                    : "故事才刚刚开始"}
                </h3>
                <p>
                  {panel === "favorites"
                    ? "点击图片下方的「收藏」，下次再见。"
                    : "你最近遇见的小马会出现在这里。"}
                </p>
              </div>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
