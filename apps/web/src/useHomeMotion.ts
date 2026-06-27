import { useEffect, type RefObject } from "react";

export function useHomeMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let active = true;
    let cleanup = () => undefined;

    void Promise.all([import("gsap"), import("animejs")]).then(([gsapModule, animeModule]) => {
      if (!active || !root.isConnected) {
        return;
      }

      const { gsap } = gsapModule;
      const { animate, stagger } = animeModule;
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 800px)",
          reduceMotion: "(prefers-reduced-motion: reduce)"
        },
        (context) => {
          if (context.conditions?.reduceMotion) {
            return;
          }

          gsap.from(root.querySelectorAll(".masthead-copy, .workflow-stage, .panel"), {
            autoAlpha: 0,
            y: context.conditions?.isDesktop ? 18 : 10,
            duration: 0.72,
            stagger: 0.055,
            ease: "power3.out",
            clearProps: "transform,visibility,opacity"
          });
        },
        root
      );

      const nodeAnimation = animate(root.querySelectorAll(".flow-node"), {
        translateY: [0, -5, 0],
        delay: stagger(140),
        duration: 2600,
        loop: true,
        ease: "inOutSine"
      });

      cleanup = () => {
        nodeAnimation.cancel();
        mm.revert();
      };
    });

    return () => {
      active = false;
      cleanup();
    };
  }, [rootRef]);
}
