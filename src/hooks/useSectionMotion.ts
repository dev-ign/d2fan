import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export const motion = {
  feedback: 0.18,
  component: 0.4,
  cinematic: 0.65,
  ease: "power2.out",
};

export function useSectionMotion(ready: boolean | string) {
  const scope = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (!ready || !scope.current) return;
      const root = scope.current;
      const mm = gsap.matchMedia();
      mm.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          const hero = root.querySelector(".hero");
          if (hero) {
            const entrance = hero.querySelectorAll(
              "#hero-title, .hero-bio, .hero-read, .featured-card, .social-strip",
            );
            gsap
              .timeline({
                defaults: { duration: motion.cinematic, ease: motion.ease },
              })
              .from(entrance, {
                autoAlpha: 0,
                y: 16,
                stagger: 0.065,
                clearProps: "opacity,visibility,transform",
              });
          }
          root
            .querySelectorAll(
              "section.music-section, section.vault-section, section.stay-section",
            )
            .forEach((section) => {
              const groups = section.querySelectorAll(".reveal");
              if (!groups.length) return;
              gsap
                .timeline({
                  scrollTrigger: {
                    trigger: section,
                    start: "top 88%",
                    once: true,
                  },
                  defaults: { duration: motion.cinematic, ease: motion.ease },
                })
                .from(groups, {
                  autoAlpha: 0,
                  y: 20,
                  stagger: { amount: 0.2 },
                  clearProps: "opacity,visibility,transform",
                });
            });
          if (root.matches(".release-page")) {
            gsap.from(root.querySelectorAll(".reveal"), {
              autoAlpha: 0,
              y: 14,
              stagger: 0.08,
              duration: motion.cinematic,
              ease: motion.ease,
              clearProps: "opacity,visibility,transform",
            });
          }
        },
        scope,
      );
      let live = true;
      let frame = 0;
      const refresh = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (live) ScrollTrigger.refresh();
        });
      };
      void document.fonts.ready.then(() => {
        if (live) refresh();
      });
      const observer = new ResizeObserver(refresh);
      observer.observe(root);
      root.addEventListener("load", refresh, true);
      return () => {
        live = false;
        cancelAnimationFrame(frame);
        observer.disconnect();
        root.removeEventListener("load", refresh, true);
        mm.revert();
      };
    },
    { scope, dependencies: [ready], revertOnUpdate: true },
  );
  return scope;
}
