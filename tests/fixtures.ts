import { test as base, expect } from "@playwright/test";
// Legacy regressions exercise the English UI as a returning listener. Fresh
// Spanish-first behavior and locale switching are covered in localization.spec.
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem("jona:locale"))
          localStorage.setItem("jona:locale", "en");
      } catch {
        /* Optional storage. */
      }
    });
    await provide(page);
  },
});
export { expect };
