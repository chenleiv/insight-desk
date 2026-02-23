import { useState, useEffect } from "react";

const ONBOARDING_FAB_KEY = "ai_hub_ob_fab";
const ONBOARDING_CTX_KEY = "ai_hub_ob_ctx";
const ONBOARDING_DEMO_KEY = "ai_hub_ob_demo";

export function useOnboarding() {
  const [hasClickedFab, setHasClickedFab] = useState(true); // Default true to prevent flash
  const [hasSelectedContext, setHasSelectedContext] = useState(true);
  const [hasSeenDemo, setHasSeenDemo] = useState(true);

  useEffect(() => {
    setHasClickedFab(localStorage.getItem(ONBOARDING_FAB_KEY) === "true");
    setHasSelectedContext(localStorage.getItem(ONBOARDING_CTX_KEY) === "true");
    setHasSeenDemo(localStorage.getItem(ONBOARDING_DEMO_KEY) === "true");
  }, []);

  const completeFab = () => {
    localStorage.setItem(ONBOARDING_FAB_KEY, "true");
    setHasClickedFab(true);
  };

  const completeCtx = () => {
    localStorage.setItem(ONBOARDING_CTX_KEY, "true");
    setHasSelectedContext(true);
  };

  const completeDemo = () => {
    localStorage.setItem(ONBOARDING_DEMO_KEY, "true");
    setHasSeenDemo(true);
    // Fulfill the standalone feature tooltips so they don't appear immediately after the tour
    completeFab();
    completeCtx();
  };

  return {
    hasClickedFab,
    hasSelectedContext,
    hasSeenDemo,
    completeFab,
    completeCtx,
    completeDemo,
  };
}
