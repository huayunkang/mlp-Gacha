import type { Character, Mode } from "../shared/types.js";
import type { UpstreamImage } from "../shared/safety.js";
import type { Upstream } from "./upstream.js";
interface Pool {
  images: UpstreamImage[];
  recent: number[];
  pending?: Promise<void>;
  nextFetch: number;
}
export class RandomPool {
  private pools = new Map<string, Pool>();
  constructor(private api: Upstream) {}
  private fill(p: Pool, c: Character, m: Mode) {
    if (p.pending) return p.pending;
    if (Date.now() < p.nextFetch) return Promise.resolve();
    p.nextFetch = Date.now() + 10000;
    p.pending = this.api
      .search(c, m)
      .then((images) => {
        const seen = new Set([...p.recent, ...p.images.map((i) => i.id)]);
        p.images.push(...images.filter((i) => !seen.has(i.id)));
      })
      .finally(() => {
        p.pending = undefined;
      });
    return p.pending;
  }
  async next(c: Character, m: Mode) {
    const key = `${c}:${m}`;
    let p = this.pools.get(key);
    if (!p) {
      p = { images: [], recent: [], nextFetch: 0 };
      this.pools.set(key, p);
    }
    if (!p.images.length) await this.fill(p, c, m);
    const image = p.images.shift();
    if (!image) throw new Error("No safe candidates available; retry shortly");
    p.recent.push(image.id);
    p.recent = p.recent.slice(-50);
    if (p.images.length < 5) void this.fill(p, c, m).catch(() => {});
    return image;
  }
}
