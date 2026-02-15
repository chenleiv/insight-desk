export const AUTH_USER_KEY = "authUser";

export type Role = "admin" | "viewer";
export type AuthUser = { email: string; role: Role; favorites: string[] };

export type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  isAuthed: boolean;
  favoritesMap: Record<string | number, boolean>;
  loginSuccess: (user: AuthUser) => void;
  logout: () => Promise<void>;
  toggleFavorite: (id: string | number) => Promise<void>;
};
