import express from "express";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import path from "node:path";
import { characters } from "../shared/types.js";
import { config } from "./config.js";
import {
  upstream,
  connectivity,
  type Upstream,
  UpstreamError,
} from "./upstream.js";
import { publicPony } from "../shared/safety.js";
import { RandomPool } from "./pool.js";
import { ImageCache } from "./cache.js";
export async function createApp(api: Upstream = upstream, cacheDir?: string) {
  const app = express();
  const cache = new ImageCache(api, cacheDir);
  await cache.init();
  const pool = new RandomPool(api);
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(compression());
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60000,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "慢一点，让小马休息一下。请稍后重试 ✨" },
    });
  app.get("/api/health", limiter(120), (_req, res) =>
    res.json({
      status:
        connectivity.state === "reachable" && cache.healthy ? "ok" : "degraded",
      derpibooru: connectivity.state,
      cache: cache.healthy ? "ok" : "error",
      checkedAt: connectivity.checkedAt,
    }),
  );
  app.get("/api/random", limiter(60), async (req, res) => {
    const params = z
      .object({
        character: z
          .enum(
            Object.keys(characters) as [
              keyof typeof characters,
              ...(keyof typeof characters)[],
            ],
          )
          .default("all"),
        mode: z.enum(["random", "top", "featured"]).default("random"),
        exclude: z.string().regex(/^[1-9]\d{0,9}$/).optional(),
      })
      .strict()
      .parse(req.query);
    res
      .set("Cache-Control", "no-store")
      .json(publicPony(await pool.next(params.character, params.mode)));
  });
  app.get("/api/image/:id", limiter(240), async (req, res) => {
    const id = z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .parse(req.params.id);
    const params = z
      .object({ size: z.enum(["preview"]).optional() })
      .strict()
      .parse(req.query);
    const result = await cache.get(Number(id), params.size === "preview");
    res.set({
      "Content-Type": result.mime,
      "Cache-Control": "public, max-age=86400",
      "X-Cache": result.hit ? "HIT" : "MISS",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    res.sendFile(result.file);
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use(express.static(path.resolve("dist/client"), { maxAge: "1h" }));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/client/index.html")),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        err instanceof z.ZodError
          ? 400
          : err instanceof UpstreamError && err.status === 404
            ? 404
            : 503;
      console.warn(
        "[request]",
        err instanceof Error ? err.message : "Unknown error",
      );
      if (!res.headersSent)
        res
          .status(status)
          .json({
            error:
              status === 400
                ? "请求参数不正确。"
                : status === 404
                  ? "这张图片暂时无法公开展示。"
                  : "暂时没找到小马，再试一次 ✨",
          });
    },
  );
  return { app, cache };
}
