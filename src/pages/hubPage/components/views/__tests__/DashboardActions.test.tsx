import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DashboardView from "../DashboardView";

vi.mock("../../../../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { email: "admin@example.com", role: "admin" },
    favoritesMap: {},
    toggleFavorite: async () => {},
  }),
}));
vi.mock("../../../../../context/DocumentsContext", () => ({
  useDocuments: () => ({ docs: [], loading: false, error: null }),
}));

let container: HTMLDivElement;
let root: Root;

const actionBtn = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".action-btn")].find((b) => b.textContent?.includes(text))!;

function render(props: { isExporting?: boolean; isImporting?: boolean }) {
  act(() => root.render(<DashboardView canEdit onExport={() => {}} onImport={() => {}} {...props} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("dashboard bulk action buttons", () => {
  it("are enabled with their normal labels when idle", () => {
    render({});
    expect(actionBtn("Export").disabled).toBe(false);
    expect(actionBtn("Import").disabled).toBe(false);
  });

  it("show Exporting… and block only Export while exporting", () => {
    render({ isExporting: true });
    expect(actionBtn("Exporting…").disabled).toBe(true);
    expect(actionBtn("Exporting…").getAttribute("aria-busy")).toBe("true");
    expect(actionBtn("Import").disabled).toBe(false);
  });

  it("show Importing… and block only Import while importing", () => {
    render({ isImporting: true });
    expect(actionBtn("Importing…").disabled).toBe(true);
    expect(actionBtn("Importing…").getAttribute("aria-busy")).toBe("true");
    expect(actionBtn("Export").disabled).toBe(false);
  });
});
