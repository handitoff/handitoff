import { describe, expect, it } from "vitest";

import { isProtocolErrorCode, normalizeProtocolError } from "./errors.js";

describe("protocol errors", () => {
  it("recognizes known error codes", () => {
    expect(isProtocolErrorCode("invalid_message")).toBe(true);
    expect(isProtocolErrorCode("unknown")).toBe(false);
  });

  it("normalizes known errors", () => {
    expect(
      normalizeProtocolError({
        code: "session_expired",
        message: "Expired.",
        field: "sessionId",
      }),
    ).toEqual({
      code: "session_expired",
      message: "Expired.",
      field: "sessionId",
    });
  });

  it("normalizes unknown errors safely", () => {
    expect(normalizeProtocolError(new Error("boom"))).toEqual({
      code: "internal_error",
      message: "Request failed.",
    });
  });
});
