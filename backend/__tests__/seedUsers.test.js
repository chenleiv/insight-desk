// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { User } = vi.hoisted(() => ({
  User: { countDocuments: vi.fn(), exists: vi.fn(), create: vi.fn() },
}));
vi.mock("../models.js", () => ({ User }));
vi.mock("../logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { seedUsersIfEmpty } from "../auth.js";

beforeEach(() => vi.clearAllMocks());

describe("seedUsersIfEmpty with existing users", () => {
  beforeEach(() => User.countDocuments.mockResolvedValue(3));

  it("creates the public demo account as a viewer, never an admin", async () => {
    User.exists.mockResolvedValue(null);

    await seedUsersIfEmpty();

    expect(User.create).toHaveBeenCalledTimes(1);
    const created = User.create.mock.calls[0][0];
    expect(created).toMatchObject({ email: "viewer@demo.com", role: "viewer" });
    expect(User.exists).not.toHaveBeenCalledWith({ email: "admin@demo.com" });
  });

  it("does nothing when the demo account already exists", async () => {
    User.exists.mockResolvedValue({ _id: "u1" });

    await seedUsersIfEmpty();

    expect(User.create).not.toHaveBeenCalled();
  });
});
