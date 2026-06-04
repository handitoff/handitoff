export const PROTOCOL_ERROR_CODES = [
  "invalid_message",
  "invalid_session_id",
  "invalid_device_id",
  "invalid_public_code",
  "session_not_found",
  "session_expired",
  "session_ended",
  "session_full",
  "not_authorized",
  "rate_limited",
  "peer_not_approved",
  "peer_disconnected",
  "device_not_found",
  "webrtc_failed",
  "transfer_failed",
  "crypto_failed",
  "internal_error",
] as const;

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

export type ProtocolError = {
  code: ProtocolErrorCode;
  message: string;
  field?: string;
};

export function normalizeProtocolError(error: unknown): ProtocolError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    isProtocolErrorCode(error.code)
  ) {
    const normalized: ProtocolError = {
      code: error.code,
      message:
        "message" in error && typeof error.message === "string" ? error.message : "Request failed.",
    };

    if ("field" in error && typeof error.field === "string") {
      normalized.field = error.field;
    }

    return normalized;
  }

  return {
    code: "internal_error",
    message: "Request failed.",
  };
}

export function isProtocolErrorCode(value: string): value is ProtocolErrorCode {
  return PROTOCOL_ERROR_CODES.includes(value as ProtocolErrorCode);
}
