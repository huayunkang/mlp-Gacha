import type { Env } from "../types";
import { providerHealthSnapshot } from "../services/providers";

export async function healthRoute(env: Env) {
  const snapshot = await providerHealthSnapshot();
  const statuses = Object.values(snapshot.providers).map(
    (state) => state.status,
  );
  return Response.json(
    {
      status: statuses.includes("online") ? "ok" : "degraded",
      providers: Object.fromEntries(
        Object.entries(snapshot.providers).map(([id, state]) => [
          id,
          state.status,
        ]),
      ),
      providerDetails: snapshot.providers,
      active: snapshot.active,
      mediaCache: env.PONY_IMAGES ? "r2+edge" : "edge",
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
