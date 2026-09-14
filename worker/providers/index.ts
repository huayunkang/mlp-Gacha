import { createPhilomenaProvider } from "./philomena";
import { twibooruProvider } from "./twibooru";
import type { ProviderId } from "../../shared/types";

export const providers = [
  createPhilomenaProvider({
    id: "derpibooru",
    label: "Derpibooru",
    baseUrl: "https://derpibooru.org",
    supportsDerpibooruFilter: true,
  }),
  createPhilomenaProvider({
    id: "trixiebooru",
    label: "Trixiebooru",
    baseUrl: "https://trixiebooru.org",
    supportsDerpibooruFilter: false,
  }),
  twibooruProvider,
] as const;

export function providerById(id: ProviderId) {
  return providers.find((provider) => provider.id === id)!;
}
