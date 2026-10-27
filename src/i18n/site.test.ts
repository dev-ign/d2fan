import { describe, expect, it, vi } from "vitest";
import { messages } from "../config/messages";
import { readLocale, localeStorageKey } from "../app/localeContext";
function flatten(tree: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[prefix + key, value]]
        : Object.entries(flatten(value, prefix + key + ".")),
    ),
  );
}
describe("complete bilingual copy", () => {
  it("has identical semantic keys and interpolation fields in both languages", () => {
    const en = flatten(messages.en),
      es = flatten(messages.es);
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(es[key].trim(), key).not.toBe("");
      expect((es[key].match(/\{\w+\}/g) ?? []).sort(), key).toEqual(
        (en[key].match(/\{\w+\}/g) ?? []).sort(),
      );
    }
  });
  it("defaults to Spanish and respects only valid explicit preferences", () => {
    localStorage.removeItem(localeStorageKey);
    expect(readLocale()).toBe("es");
    localStorage.setItem(localeStorageKey, "en");
    expect(readLocale()).toBe("en");
    localStorage.setItem(localeStorageKey, "es");
    expect(readLocale()).toBe("es");
    localStorage.setItem(localeStorageKey, "English");
    expect(readLocale()).toBe("es");
    localStorage.removeItem(localeStorageKey);
  });
  it("falls back to Spanish when preference storage is unavailable", () => {
    const storage = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    try {
      expect(readLocale()).toBe("es");
    } finally {
      storage.mockRestore();
    }
  });
});
