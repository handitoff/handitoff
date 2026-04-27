import { describe, expect, it } from "vitest";

import { generatePublicCode, isPublicCode, PUBLIC_CODE_ALPHABET } from "./public-code.js";

describe("generatePublicCode", () => {
  it("generates URL-safe public codes with the default length", () => {
    const code = generatePublicCode();

    expect(code).toHaveLength(6);
    expect(isPublicCode(code)).toBe(true);
  });

  it("supports deterministic random bytes for tests", () => {
    const code = generatePublicCode({
      length: 6,
      randomBytes: (length) => new Uint8Array(Array.from({ length }, (_, index) => index)),
    });

    expect(code).toBe(PUBLIC_CODE_ALPHABET.slice(0, 6));
  });

  it("rejects unsupported lengths", () => {
    expect(() => generatePublicCode({ length: 5 })).toThrow(RangeError);
    expect(() => generatePublicCode({ length: 13 })).toThrow(RangeError);
  });

  it("validates public code format", () => {
    expect(isPublicCode("A7K9Q2")).toBe(true);
    expect(isPublicCode("a7k9q2")).toBe(false);
    expect(isPublicCode("A7K9Q0")).toBe(false);
    expect(isPublicCode("A7K9QO")).toBe(false);
  });
});
