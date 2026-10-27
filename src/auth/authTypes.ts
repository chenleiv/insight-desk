export const AUTH_USER_KEY = "authUser";

// "demo": a temporary visitor with a private copy of the sample documents.
export type Role = "admin" | "viewer" | "demo";
export type AuthUser = {
  email: string;
  role: Role;
  favorites: string[];
  displayName?: string;
  jobTitle?: string;
  expiresAt?: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  isAuthed: boolean;
  favoritesMap: Record<string | number, boolean>;
  loginSuccess: (user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => Promise<void>;
  toggleFavorite: (id: string | number) => Promise<void>;
};
