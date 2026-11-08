import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const NEW_KEY = "insightdesk:category-colors";
const OLD_KEY = "brainy:category-colors";

// Node's own localStorage global hides jsdom's here, so tests get a small in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
    clear: () => items.clear(),
  };
}

let storage: Storage;

// The store caches what it reads, so each test loads a fresh copy of the module.
async function loadStore() {
  vi.resetModules();
  return await import("../categoryColorStore");
}

describe("categoryColorStore", () => {
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("moves colors saved under the old key to the new key", async () => {
    storage.setItem(OLD_KEY, JSON.stringify({ security: 2 }));
    const { getCategoryHue, CAT_HUES } = await loadStore();

    expect(getCategoryHue("Security")).toBe(CAT_HUES[2]);
    expect(JSON.parse(storage.getItem(NEW_KEY)!)).toEqual({ security: 2 });
    expect(storage.getItem(OLD_KEY)).toBeNull();
  });

  it("uses the new key when both keys exist, and removes the old one", async () => {
    storage.setItem(NEW_KEY, JSON.stringify({ security: 3 }));
    storage.setItem(OLD_KEY, JSON.stringify({ security: 2 }));
    const { getCategoryHue, CAT_HUES } = await loadStore();

    expect(getCategoryHue("Security")).toBe(CAT_HUES[3]);
    expect(JSON.parse(storage.getItem(NEW_KEY)!)).toEqual({ security: 3 });
    expect(storage.getItem(OLD_KEY)).toBeNull();
  });

  it("returns no color when storage is unavailable", async () => {
    storage.getItem = () => {
      throw new DOMException("Storage is blocked", "SecurityError");
    };
    const { getCategoryHue } = await loadStore();

    expect(getCategoryHue("Security")).toBeNull();
  });

  it("keeps the old key when the new key cannot be written", async () => {
    storage.setItem(OLD_KEY, JSON.stringify({ security: 2 }));
    storage.setItem = () => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
    const { getCategoryHue, CAT_HUES } = await loadStore();

    expect(getCategoryHue("Security")).toBe(CAT_HUES[2]);
    expect(storage.getItem(OLD_KEY)).not.toBeNull();
  });

  it.each(["not json", "null", "[1, 2]", "5"])("ignores an invalid saved value %j", async (raw) => {
    storage.setItem(NEW_KEY, raw);
    const { getCategoryHue } = await loadStore();

    expect(getCategoryHue("Security")).toBeNull();
  });

  it("drops an invalid value under the old key without writing the new key", async () => {
    storage.setItem(OLD_KEY, "not json");
    const { getCategoryHue } = await loadStore();

    expect(getCategoryHue("Security")).toBeNull();
    expect(storage.getItem(NEW_KEY)).toBeNull();
    expect(storage.getItem(OLD_KEY)).toBeNull();
  });

  it("returns no color when nothing is saved", async () => {
    const { getCategoryHue } = await loadStore();

    expect(getCategoryHue("Security")).toBeNull();
    expect(storage.getItem(NEW_KEY)).toBeNull();
  });
});
