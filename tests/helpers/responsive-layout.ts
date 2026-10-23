import { expect, type Page } from "@playwright/test";

export async function expectResponsiveLayout(page: Page) {
  const geometry = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const wordmark = document
      .querySelector(".wordmark")!
      .getBoundingClientRect();
    const actions = document
      .querySelector(".header-actions")!
      .getBoundingClientRect();
    const nav = document.querySelector(".site-nav")!;
    const bounds = nav.getBoundingClientRect();
    const overflow = document.documentElement.scrollWidth > viewport;
    const collision =
      wordmark.right > actions.left ||
      actions.right > viewport ||
      (getComputedStyle(nav).display !== "none" &&
        (bounds.left < wordmark.right || bounds.right > actions.left));
    // Geometry only: never include text, form values, URLs or request data.
    const outside =
      overflow || collision
        ? [...document.querySelectorAll("body *")]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.width && (rect.right > viewport + 1 || rect.left < -1)
              );
            })
            .slice(0, 30)
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].map((name) => `.${name}`).join("")}`,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                position: style.position,
                overflowX: style.overflowX,
                parentWidth:
                  element.parentElement?.getBoundingClientRect().width,
                parentOverflowX: element.parentElement
                  ? getComputedStyle(element.parentElement).overflowX
                  : undefined,
              };
            })
        : [];
    return {
      overflow,
      collision,
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      fontStatus: document.fonts.status,
      outside,
    };
  });
  expect(
    { overflow: geometry.overflow, collision: geometry.collision },
    `Responsive layout: ${JSON.stringify(geometry)}`,
  ).toEqual({ overflow: false, collision: false });
}
