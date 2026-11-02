import { useEffect } from "react";

// Above this scale the user has pinched in; the layout must stay put while they look around.
const ZOOM_TOLERANCE = 1.01;

/**
 * Publishes the visible area as --app-height and --app-top, because iOS keeps the layout
 * viewport full size under the on-screen keyboard and moves the visual viewport instead.
 */
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const { style } = document.documentElement;

    function apply() {
      if (viewport!.scale > ZOOM_TOLERANCE) return;
      style.setProperty("--app-height", `${viewport!.height}px`);
      style.setProperty("--app-top", `${viewport!.offsetTop}px`);
    }

    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      style.removeProperty("--app-height");
      style.removeProperty("--app-top");
    };
  }, []);
}
