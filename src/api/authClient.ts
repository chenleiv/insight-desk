import type { AuthUser } from "../auth/authTypes";
import { apiFetch } from "./base";

export type LoginResponse = {
  user: AuthUser;
};

export async function login(email: string, password: string) {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return apiFetch<AuthUser>("/api/auth/me");
}

export async function logout() {
  return apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}
