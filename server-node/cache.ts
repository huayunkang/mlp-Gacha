import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import type { Upstream } from "./upstream.js";
import { imageSchema, safeImage } from "../shared/legacy-safety.js";
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
export function validImage(data: Buffer, mime: string) {
  return mime === "image/jpeg"
    ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : mime === "image/png"
      ? data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/webp"
        ? data.toString("ascii", 0, 4) === "RIFF" &&
          data.toString("ascii", 8, 12) === "WEBP"
        : mime === "image/gif"
          ? /^GIF8[79]a$/.test(data.toString("ascii", 0, 6))
          : false;
}
export class ImageCache {
  private pending = new Map<
    string,
    Promise<{ file: string; mime: string; hit: boolean }>
  >();
  public healthy = true;
  constructor(
    private api: Upstream,
    private dir = path.join(config.cacheDir, "images"),
  ) {}
  async init() {
    await mkdir(this.dir, { recursive: true });
    await this.cleanup();
  }
  async get(id: number, preview: boolean) {
    const key = `${id}-${preview ? "preview" : "full"}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = this.load(id, preview, key).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, promise);
    return promise;
  }
  private async load(id: number, preview: boolean, key: string) {
    const metaFile = path.join(this.dir, key + ".json");
    try {
      const meta = JSON.parse(await readFile(metaFile, "utf8"));
      const parsed = imageSchema.safeParse(meta.image);
      if (
        Date.now() - meta.createdAt < config.ttl &&
        parsed.success &&
        parsed.data.id === id &&
        safeImage(parsed.data) &&
        extensions[meta.mime]
      ) {
        const file = path.join(this.dir, key + "." + extensions[meta.mime]);
        await stat(file);
        await utimes(file, new Date(), new Date());
        return { file, mime: meta.mime as string, hit: true };
      }
    } catch {
      /* miss or corrupt entry: refetch */
    }
    const image = await this.api.image(id);
    const url = preview
      ? (image.representations.thumb ??
        image.representations.medium ??
        image.representations.full)
      : (image.representations.large ?? image.representations.full);
    const { data, mime } = await this.api.download(url);
    const ext = extensions[mime];
    if (!ext || !validImage(data, mime))
      throw new Error("Unsupported or invalid image content");
    if (data.length > config.maxImage || data.length > config.maxCache)
      throw new Error("Image exceeds cache budget");
    const file = path.join(this.dir, key + "." + ext);
    const temp = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, data);
      await rename(temp, file);
      await writeFile(
        metaFile,
        JSON.stringify({ image, mime, createdAt: Date.now() }),
      );
      this.healthy = true;
    } catch (e) {
      this.healthy = false;
      await unlink(temp).catch(() => {});
      throw e;
    }
    void this.cleanup().catch(() => {
      this.healthy = false;
    });
    return { file, mime, hit: false };
  }
  private cleaning?: Promise<void>;
  cleanup() {
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.clean().finally(() => {
      this.cleaning = undefined;
    });
    return this.cleaning;
  }
  private async clean() {
    const names = await readdir(this.dir);
    const entries = await Promise.all(
      names
        .filter((n) => /^[0-9]+-(full|preview)\.(jpg|png|webp|gif)$/.test(n))
        .map(async (name) => {
          const file = path.join(this.dir, name);
          const s = await stat(file).catch(() => null);
          return s ? { file, size: s.size, time: s.mtimeMs } : null;
        }),
    );
    let total = entries.reduce((s, e) => s + (e?.size ?? 0), 0);
    for (const e of entries
      .filter((e) => e !== null)
      .sort((a, b) => a.time - b.time)) {
      let expired = Date.now() - e.time > config.ttl;
      try {
        const meta = JSON.parse(
          await readFile(e.file.replace(/\.[^.]+$/, ".json"), "utf8"),
        );
        expired = expired || Date.now() - meta.createdAt > config.ttl;
      } catch {
        expired = true;
      }
      if (expired || total > config.maxCache) {
        await unlink(e.file).catch(() => {});
        await unlink(e.file.replace(/\.[^.]+$/, ".json")).catch(() => {});
        total -= e.size;
      }
    }
  }
}
