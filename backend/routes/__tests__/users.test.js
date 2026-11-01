// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";

const ADMIN = { _id: "admin-1", role: "admin" };
const USER_ID = "64b7f0c2a1b2c3d4e5f60718";

const { User } = vi.hoisted(() => ({
  User: { find: vi.fn(), findByIdAndUpdate: vi.fn(), findByIdAndDelete: vi.fn() },
}));

vi.mock("../../models.js", () => ({ User }));
vi.mock("../../auth.js", () => {
  const authenticate = (req, _res, next) => {
    req.user = ADMIN;
    next();
  };
  return { getCurrentUser: authenticate, requireAdmin: authenticate };
});
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import usersRouter from "../users.js";
import { jsonBody } from "../../middleware/setup.js";

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(jsonBody());
  app.use("/api/users", usersRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.clearAllMocks();
});

function patch(id, body) {
  return fetch(`${baseUrl}/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function updatedUser(fields) {
  const user = { _id: USER_ID, email: "user@example.com", role: "viewer", status: "active", ...fields };
  return { select: vi.fn(async () => user) };
}

describe("PATCH /api/users/:id", () => {
  it("returns 400 for an id that is not an ObjectId, without querying the database", async () => {
    const res = await patch("not-an-id", { role: "admin" });

    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual([{ path: ["id"], message: "Invalid user id" }]);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown role", { role: "demo" }],
    ["an unknown status", { status: "deleted" }],
    ["a valid role with an unknown status", { role: "admin", status: "deleted" }],
    ["a non-string role", { role: ["admin"] }],
    ["a field other than role and status", { role: "admin", email: "other@example.com" }],
    ["neither role nor status", {}],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await patch(USER_ID, body);

    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Validation failed");
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("updates only the validated role and status", async () => {
    User.findByIdAndUpdate.mockReturnValueOnce(updatedUser({ role: "admin", status: "inactive" }));

    const res = await patch(USER_ID, { role: "admin", status: "inactive" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: USER_ID,
      email: "user@example.com",
      role: "admin",
      status: "inactive",
    });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      USER_ID,
      { role: "admin", status: "inactive" },
      { new: true },
    );
  });

  it("updates a single field", async () => {
    User.findByIdAndUpdate.mockReturnValueOnce(updatedUser({ status: "inactive" }));

    const res = await patch(USER_ID, { status: "inactive" });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, { status: "inactive" }, { new: true });
  });

  it("returns 404 for a valid id with no user", async () => {
    User.findByIdAndUpdate.mockReturnValueOnce({ select: vi.fn(async () => null) });

    const res = await patch(USER_ID, { role: "viewer" });

    expect(res.status).toBe(404);
  });
});
