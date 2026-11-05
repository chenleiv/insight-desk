// @vitest-environment node
import { describe, it, expect } from "vitest";
import { addressKey, IPV6_PREFIX } from "../clientAddress.js";

describe("addressKey", () => {
  it("uses a /56 prefix", () => {
    expect(IPV6_PREFIX).toBe(56);
  });

  it("leaves an IPv4 address as it is", () => {
    expect(addressKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("counts two addresses in the same /64 as one", () => {
    expect(addressKey("2001:db8:1:2:aaaa::1")).toBe(addressKey("2001:db8:1:2:bbbb::2"));
  });

  it("counts different /64 networks in the same /56 as one", () => {
    expect(addressKey("2001:db8:1:0::1")).toBe(addressKey("2001:db8:1:ff::1"));
  });

  it("counts different /56 networks separately", () => {
    expect(addressKey("2001:db8:1:ff::1")).not.toBe(addressKey("2001:db8:1:100::1"));
    expect(addressKey("2001:db8:1::1")).not.toBe(addressKey("2001:db8:2::1"));
  });

  it("gives every spelling of an address the same key", () => {
    const key = addressKey("2001:db8:1:2::1");
    expect(addressKey("2001:DB8:1:2::1")).toBe(key);
    expect(addressKey("2001:0db8:0001:0002:0000:0000:0000:0001")).toBe(key);
  });

  it("counts an IPv4-mapped address as its IPv4 address", () => {
    expect(addressKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(addressKey("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("leaves an invalid value as it is, without throwing", () => {
    for (const value of ["not-an-ip", "", "[2001:db8::1]", "::ffff:999.1.1.1"]) {
      expect(addressKey(value)).toBe(value);
    }
    expect(addressKey(undefined)).toBeUndefined();
  });
});
