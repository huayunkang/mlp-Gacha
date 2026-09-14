import type { Env } from "../types";
import { settings } from "../config";
import type { ProviderId } from "../../shared/types";
import type { ProviderRateLimit } from "./types";
import { ServiceError } from "../services/errors";

export class ProviderError extends ServiceError {
  constructor(
    message: string,
    public provider: ProviderId,
    public status = 503,
    public retryable = true,
    public code = "provider_error",
  ) {
    super(message, status);
  }
}

function numberHeader(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function readRateLimit(headers: Headers): ProviderRateLimit {
  return {
    limit: numberHeader(headers, "X-RL"),
    remaining: numberHeader(headers, "X-RL-Remaining"),
    reset: headers.get("X-RL-Reset") ?? undefined,
  };
}

function retryableStatus(status: number) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

export async function providerJSON(
  env: Env,
  provider: ProviderId,
  url: URL,
): Promise<{ value: unknown; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(settings(env).providerTimeout),
      headers: {
        "User-Agent": "PonyRoulette/2.0 (MLP image discovery; cached proxy)",
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new ProviderError(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "Provider timeout"
        : "Provider network error",
      provider,
      503,
      true,
      "network",
    );
  }
  if (!response.ok) {
    const type = response.headers.get("content-type") ?? "";
    const challenge =
      response.status === 403 &&
      (type.includes("text/html") ||
        response.headers.get("cf-mitigated") === "challenge");
    await response.body?.cancel();
    throw new ProviderError(
      challenge
        ? "Provider anti-bot challenge"
        : `Provider HTTP ${response.status}`,
      provider,
      response.status,
      challenge || retryableStatus(response.status),
      challenge ? "challenge" : "http",
    );
  }
  const length = Number(response.headers.get("content-length"));
  if (length > 1024 * 1024) {
    await response.body?.cancel();
    throw new ProviderError(
      "Provider metadata too large",
      provider,
      502,
      true,
      "invalid_response",
    );
  }
  try {
    return { value: await response.json(), headers: response.headers };
  } catch {
    throw new ProviderError(
      "Invalid provider JSON",
      provider,
      502,
      true,
      "invalid_response",
    );
  }
}
