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

export async function register(email: string, password: string, displayName?: string) {
  return apiFetch<LoginResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(displayName ? { displayName } : {}) }),
  });
}

export async function me() {
  return apiFetch<AuthUser>("/api/auth/me");
}

export async function logout() {
  return apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function updateProfile(data: { displayName?: string; jobTitle?: string }) {
  return apiFetch<{ email: string; role: string; displayName: string; jobTitle: string }>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok: true }>("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export type UserRecord = {
  id: number;
  email: string;
  role: "admin" | "viewer";
  status: "active" | "inactive";
  createdAt?: string;
  displayName?: string;
  jobTitle?: string;
};

export async function getUsers() {
  return apiFetch<UserRecord[]>("/api/users");
}

export async function updateUser(id: number, data: Partial<Pick<UserRecord, "role" | "status">>) {
  return apiFetch<UserRecord>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: number) {
  return apiFetch<{ ok: true }>(`/api/users/${id}`, { method: "DELETE" });
}
