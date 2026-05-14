export function getInitials(email: string): string {
  const name = (email || "").split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const first = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const second = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (first + second).trim();
}
