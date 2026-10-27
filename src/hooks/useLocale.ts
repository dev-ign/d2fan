import { useContext } from "react";
import { LocaleContext } from "../app/localeContext";
import { messages } from "../config/messages";
import type { VaultItem } from "../domain/types";
export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale requires LocaleProvider");
  const t = messages[context.locale];
  return { ...context, t };
}
export function text(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? `{${key}}`),
  );
}
export function vaultCopy(
  item: VaultItem,
  t: (typeof messages)["en"] | (typeof messages)["es"],
) {
  return t.vault.items[item.slug as keyof typeof t.vault.items] ?? item;
}
export function audioError(
  error: string,
  t: (typeof messages)["en"] | (typeof messages)["es"],
) {
  if (error === messages.en.player.failed) return t.player.failed;
  if (error === messages.en.player.unavailable) return t.player.unavailable;
  return t.player.blocked;
}
