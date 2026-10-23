import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export const motion = {
  feedback: 0.18,
  component: 0.4,
  cinematic: 0.7,
  ease: "cubic-bezier(.2,.7,.2,1)",
};

export function useSectionMotion(ready: boolean) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!ready) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          regular: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          if (context.conditions?.reduced) return;
          gsap.utils.toArray<HTMLElement>(".reveal").forEach((element) => {
            gsap.from(element, {
              autoAlpha: 0,
              y: 32,
              duration: motion.cinematic,
              ease: "power2.out",
              scrollTrigger: { trigger: element, start: "top 85%", once: true },
            });
          });
        },
      );
      return () => mm.revert();
    },
    { scope, dependencies: [ready], revertOnUpdate: true },
  );
  return scope;
}
