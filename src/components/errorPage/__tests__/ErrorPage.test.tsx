import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, lazy, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const { reloading } = vi.hoisted(() => ({ reloading: { current: false } }));
vi.mock("../../../utils/staleAssetReload", () => ({ isReloadingForStaleAsset: () => reloading.current }));

import { ErrorPage } from "../ErrorPage";

const DETAIL = "Unable to preload CSS for /assets/HubPage-abc.css";
const reload = vi.fn();

let container: HTMLDivElement;
let root: Root;

// A lazy page whose file is gone, under a router set up like the one in main.tsx.
async function renderFailedPage() {
  const Missing = lazy(() => Promise.reject(new Error(DETAIL)));
  const router = createMemoryRouter([
    { path: "*", element: <Suspense fallback={null}><Missing /></Suspense>, errorElement: <ErrorPage /> },
  ]);
  await act(async () => root.render(<RouterProvider router={router} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("location", { reload, origin: "http://localhost", href: "http://localhost/" });
  reload.mockClear();
  reloading.current = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ErrorPage", () => {
  it("shows a friendly message without any detail of the error", async () => {
    await renderFailedPage();

    expect(container.querySelector("h1")?.textContent).toBe("Something went wrong");
    expect(container.textContent).not.toContain(DETAIL);
    expect(container.textContent).not.toContain("/assets/");
    expect(container.textContent).not.toContain("Unexpected Application Error");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("reloads the page from its button", async () => {
    await renderFailedPage();

    act(() => container.querySelector<HTMLButtonElement>(".error-page button")!.click());

    expect(reload).toHaveBeenCalledOnce();
  });

  it("shows only a loader while an automatic reload is under way", async () => {
    reloading.current = true;
    await renderFailedPage();

    expect(container.querySelector(".error-page .icon-spin")).not.toBeNull();
    expect(container.querySelector("h1")).toBeNull();
  });
});
