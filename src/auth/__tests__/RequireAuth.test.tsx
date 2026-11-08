import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireAuth from "../RequireAuth";

const { auth } = vi.hoisted(() => ({
  auth: { isReady: false, isAuthed: false, signedOut: false },
}));

vi.mock("../useAuth", () => ({ useAuth: () => auth }));

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(
    <MemoryRouter initialEntries={["/hub"]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route element={<RequireAuth />}>
          <Route path="/hub" element={<p>Hub page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  ));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RequireAuth during the startup session check", () => {
  it("shows a labelled loader instead of a blank screen", () => {
    Object.assign(auth, { isReady: false, isAuthed: false });
    render();

    const loader = container.querySelector("[role='status']");
    expect(loader?.getAttribute("aria-label")).toBe("Checking your session…");
    expect(loader?.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("Login page");
  });

  it("shows the page once the session is confirmed", () => {
    Object.assign(auth, { isReady: true, isAuthed: true });
    render();
    expect(container.textContent).toBe("Hub page");
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("goes to login when there is no session", () => {
    Object.assign(auth, { isReady: true, isAuthed: false });
    render();
    expect(container.textContent).toBe("Login page");
  });
});
