import { useAuth } from "./useAuth";
import { useStatus } from "../components/statusBar/useStatus";

/** Toggles a favorite and tells the user when the change could not be saved. */
export function useFavoriteToggle() {
  const { toggleFavorite, pendingFavorites } = useAuth();
  const status = useStatus();

  async function toggle(id: string) {
    try {
      await toggleFavorite(id);
    } catch (e) {
      status.show({
        kind: "error",
        title: "Favorite not updated",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  return { toggle, pendingFavorites: pendingFavorites ?? {} };
}
