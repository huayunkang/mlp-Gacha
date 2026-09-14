import type { Character, ContentSettings, Mode, Pony } from "../shared/types";

export async function randomPony(
  character: Character,
  mode: Mode,
  signal: AbortSignal,
  exclude: string | undefined,
  filter: number,
  tag: string | undefined,
  content: ContentSettings,
): Promise<Pony> {
  const params = new URLSearchParams({
    character,
    mode,
    filter: String(filter),
    content: content.contentLevel,
    adultMode: content.adultMode,
    graphic: content.graphicLevel,
  });
  if (exclude) params.set("exclude", exclude);
  if (tag) params.set("tag", tag);
  let response: Response;
  try {
    response = await fetch(`/api/random?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(16000)]),
    });
  } catch {
    throw new Error("这次胶囊好像真的卡住了……暂时无法连接图库。");
  }
  const json = await response.json().catch(() => {
    throw new Error("这次胶囊好像真的卡住了……暂时无法连接图库。");
  });
  if (!response.ok)
    throw new Error(json.error ?? "暂时没找到小马，再试一次 ✨");
  return json as Pony;
}

export function loadImage(src: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      cleanup();
      image.src = "";
      reject(new Error("图片暂时没有抵达，再试一次 ✨"));
    }, 40000);
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
    };
    const abort = () => {
      cleanup();
      image.src = "";
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      cleanup();
      resolve();
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("图片暂时没有抵达，再试一次 ✨"));
    };
    image.src = src;
  });
}
