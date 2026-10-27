import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { ConfirmContext, type ConfirmFn } from "../../../../components/confirmModal/confirmContext";
import { useUnsavedChangesGuard } from "../useUnsavedChangesGuard";

type Guard = ReturnType<typeof useUnsavedChangesGuard> & { navigate: ReturnType<typeof useNavigate> };

let guard: Guard;
let container: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createMemoryRouter>;
const confirm = vi.fn<ConfirmFn>();

// Hands the hook's latest result to the test on every render.
function Probe({ expose }: { expose: (g: Guard) => void }) {
  expose({ ...useUnsavedChangesGuard(), navigate: useNavigate() });
  return null;
}

const currentUrl = () => router.state.location.pathname + router.state.location.search;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  confirm.mockReset();
  // History: assistant, then an open document.
  const expose = (g: Guard) => { guard = g; };
  router = createMemoryRouter([{ path: "*", element: <Probe expose={expose} /> }], {
    initialEntries: ["/hub", "/hub?doc=a"],
    initialIndex: 1,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ConfirmContext.Provider value={confirm}>
        <RouterProvider router={router} />
      </ConfirmContext.Provider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function markDirty() {
  await act(async () => guard.setIsDirty(true));
}

async function goBack() {
  await act(async () => {
    await router.navigate(-1);
  });
}

describe("useUnsavedChangesGuard", () => {
  it("lets browser back through without asking when nothing is dirty", async () => {
    await goBack();
    expect(confirm).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/hub");
  });

  it("asks before browser back with unsaved changes, and stays when cancelled", async () => {
    confirm.mockResolvedValue(false);
    await markDirty();
    await goBack();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/hub?doc=a");
    expect(guard.isDirty).toBe(true);
  });

  it("leaves and clears the flag when the discard is confirmed", async () => {
    confirm.mockResolvedValue(true);
    await markDirty();
    await goBack();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/hub");
    expect(guard.isDirty).toBe(false);
  });

  it("does not ask twice when in-app navigation already confirmed", async () => {
    confirm.mockResolvedValue(true);
    await markDirty();
    await act(async () => {
      if (await guard.guardDirty()) await guard.navigate("/hub?view=settings");
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/hub?view=settings");
  });
});
