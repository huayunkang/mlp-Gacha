import type { Character, Mode, Pony } from "../shared/types";
export async function randomPony(
  character: Character,
  mode: Mode,
  signal: AbortSignal,
  exclude?: number,
  filter?: number,
  tag?: string,
  strictSafe = true,
): Promise<Pony> {
  let response: Response;
  try {
    response = await fetch(
      `/api/random?character=${character}&mode=${mode}${exclude ? `&exclude=${exclude}` : ""}${filter !== undefined ? `&filter=${filter}` : ""}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}&strict=${strictSafe ? "1" : "0"}`,
      { signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]) },
    );
  } catch {
    throw new Error("暂时没找到小马，再试一次 ✨");
  }
  const json = await response.json().catch(() => {
    throw new Error("暂时没找到小马，再试一次 ✨");
  });
  if (!response.ok)
    throw new Error(json.error ?? "暂时没找到小马，再试一次 ✨");
  return json as Pony;
}
export function loadImage(src: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      cleanup();
      img.src = "";
      reject(new Error("图片暂时没有抵达，再试一次 ✨"));
    }, 40000);
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      img.onload = null;
      img.onerror = null;
    };
    const abort = () => {
      cleanup();
      img.src = "";
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    img.onload = () => {
      cleanup();
      resolve();
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("图片暂时没有抵达，再试一次 ✨"));
    };
    img.src = src;
  });
}
