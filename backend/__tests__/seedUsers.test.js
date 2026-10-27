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

  it("creates no accounts, including the retired viewer@demo.com", async () => {
    await seedUsersIfEmpty();

    expect(User.create).not.toHaveBeenCalled();
  });
});
