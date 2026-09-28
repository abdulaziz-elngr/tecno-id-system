import { describe, expect, it } from "vitest";
import { buildWhatsAppLink, normalizeWhatsAppNumber } from "./wa-link";

describe("normalizeWhatsAppNumber (Egypt)", () => {
  it("converts a local mobile number to international format", () => {
    expect(normalizeWhatsAppNumber("01012345678")).toBe("201012345678");
  });
  it("accepts +20, 0020 and already-international forms", () => {
    expect(normalizeWhatsAppNumber("+201012345678")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("00201012345678")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("201012345678")).toBe("201012345678");
  });
  it("ignores spaces, dashes and parentheses", () => {
    expect(normalizeWhatsAppNumber("010 1234-5678")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("(+20) 10 1234 5678")).toBe("201012345678");
  });
  it("rejects empty or implausible numbers", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber("123")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a plain wa.me link", () => {
    expect(buildWhatsAppLink("01012345678")).toBe("https://wa.me/201012345678");
  });
  it("adds a URL-encoded pre-filled message", () => {
    expect(buildWhatsAppLink("01012345678", "Hello & مرحبا")).toBe(
      `https://wa.me/201012345678?text=${encodeURIComponent("Hello & مرحبا")}`
    );
  });
  it("returns null for an invalid number instead of a broken link", () => {
    expect(buildWhatsAppLink("xx")).toBeNull();
  });
});
