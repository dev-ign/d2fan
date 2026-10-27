import { useEffect, useState } from "react";
import { navigation } from "../config/navigation";

/** Viewport boundaries own selection, independently of clicks and route scrolling. */
export function useActiveSection(home: boolean) {
  const [active, setActive] = useState("");
  useEffect(() => {
    if (!home) return;
    let frame = 0;
    let sections: HTMLElement[] = [];
    const header = document.querySelector(".site-header");
    const update = () => {
      frame = 0;
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      // Read below the fixed header, in the upper quarter of usable space.
      const line = headerBottom + (innerHeight - headerBottom) * 0.2;
      const section = sections.find((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.top <= line && bounds.bottom > line;
      });
      setActive(section?.id === "top" ? "" : (section?.id ?? ""));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const attach = () => {
      sections = ["top", ...navigation.map(({ id }) => id)]
        .map((id) => document.getElementById(id))
        .filter((node): node is HTMLElement => node !== null);
      sections.forEach((node) => resize.observe(node));
      if (sections.length === navigation.length + 1) pending.disconnect();
      schedule();
    };
    const pending = new MutationObserver(attach);
    pending.observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
    });
    if (header) resize.observe(header);
    attach();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    return () => {
      cancelAnimationFrame(frame);
      pending.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
    };
  }, [home]);
  return home ? active : "";
}
