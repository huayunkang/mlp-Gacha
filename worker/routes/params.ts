import { z } from "zod";
import type { ContentSettings } from "../../shared/types";

export const contentFields = {
  content: z.enum(["safe", "teen", "adult"]).default("safe"),
  adultMode: z.enum(["all", "questionable", "explicit"]).default("all"),
  graphic: z.enum(["clean", "dark", "graphic"]).default("clean"),
};

export function contentSettings(params: {
  content: ContentSettings["contentLevel"];
  adultMode: ContentSettings["adultMode"];
  graphic: ContentSettings["graphicLevel"];
}): ContentSettings {
  return {
    contentLevel: params.content,
    adultMode: params.adultMode,
    graphicLevel: params.graphic,
  };
}

export function providerAndId(value: string) {
  const parts = value.split("/");
  const provider = parts.length === 1 ? "derpibooru" : parts[0];
  const id = parts.length === 1 ? parts[0] : parts[1];
  return {
    provider: z.enum(["derpibooru", "trixiebooru", "twibooru"]).parse(provider),
    id: Number(
      z
        .string()
        .regex(/^[1-9]\d{0,9}$/)
        .parse(id),
    ),
  };
}
