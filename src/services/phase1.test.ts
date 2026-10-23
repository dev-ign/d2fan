import { describe, expect, it, beforeEach } from "vitest";
import {
  amountFromInput,
  normalizeEmail,
  boundedAttribution,
  validatePhone,
  validAmount,
} from "../../supabase/shared/validation";
import {
  signToken,
  verifyToken,
} from "../../supabase/functions/_shared/security";
import { attribution } from "./attribution";
const secret = "a-long-local-test-secret-with-at-least-32-characters";
describe("money and boundary validation", () => {
  it("uses integer cents and rejects malformed values", () => {
    expect(amountFromInput("15.25")).toBe(1525);
    for (const value of ["-5", "1e3", "5.001", "NaN", "Infinity", "5abc"])
      expect(amountFromInput(value)).toBeNull();
    expect(validAmount(499)).toBe(false);
    expect(validAmount(100001)).toBe(false);
    expect(validAmount(500)).toBe(true);
  });
  it("normalizes contact and bounds safe attribution", () => {
    expect(normalizeEmail(" Fan@Example.com ")).toBe("fan@example.com");
    expect(() => normalizeEmail("bad")).toThrow();
    expect(validatePhone("+18095551234")).toBe(true);
    expect(validatePhone("8095551234")).toBe(false);
    expect(
      boundedAttribution({
        utm_source: "instagram",
        email: "x@example.com",
        ref: "x@example.com",
        utm_content: "a".repeat(101),
      }),
    ).toEqual({ utm_source: "instagram" });
  });
});
describe("scoped access", () => {
  it("requires signature, scope, artist and unexpired time", async () => {
    const claims = {
      scope: "status" as const,
      sub: "attempt",
      artist: "jona-ferreira",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    const signed = await signToken(claims, secret);
    expect(
      (await verifyToken(signed, "status", "jona-ferreira", secret)).sub,
    ).toBe("attempt");
    for (const [value, scope, artist] of [
      [signed + "x", "status", "jona-ferreira"],
      [signed, "access", "jona-ferreira"],
      [signed, "status", "other"],
    ] as const)
      await expect(verifyToken(value, scope, artist, secret)).rejects.toThrow(
        "unauthorized",
      );
    await expect(
      verifyToken(
        await signToken({ ...claims, exp: 1 }, secret),
        "status",
        "jona-ferreira",
        secret,
      ),
    ).rejects.toThrow();
  });
});
describe("attribution", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
  });
  it("preserves first campaign and separately updates last", () => {
    history.replaceState(
      null,
      "",
      "/?utm_source=instagram&utm_content=creative_a",
    );
    expect(attribution().firstTouch.utm_source).toBe("instagram");
    history.replaceState(null, "", "/music/accion?utm_source=direct");
    const next = attribution();
    expect(next.firstTouch.utm_source).toBe("instagram");
    expect(next.lastTouch).toEqual({ utm_source: "direct", release: "accion" });
  });
});
