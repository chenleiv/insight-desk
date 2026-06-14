import { loadJson, saveJson } from "../utils/storage";
import type { AuthUser } from "./authTypes";
import { AUTH_USER_KEY } from "./authTypes";

export function loadUserFromStorage(): AuthUser | null {
  return loadJson<AuthUser | null>(AUTH_USER_KEY, null);
}

export function saveUserToStorage(user: AuthUser) {
  saveJson(AUTH_USER_KEY, user);
}

export function clearUserFromStorage() {
  localStorage.removeItem(AUTH_USER_KEY);
}
