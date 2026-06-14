export function getApiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  return (fromEnv || "").replace(/\/$/, "");
}
