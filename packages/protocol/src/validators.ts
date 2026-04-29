import { isProtocolErrorCode, type ProtocolError } from "./errors.js";
import type { ClientMessage, ServerMessage, TransferMessage } from "./messages.js";
import { isPublicCode } from "./public-code.js";

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: ProtocolError;
    };

export function validateClientMessage(value: unknown): ValidationResult<ClientMessage> {
  if (!isRecord(value)) {
    return invalid("message", "Message must be an object.");
  }

  switch (value.type) {
    case "session:create":
      return requireFields(value, ["deviceId"], {
        optionalStrings: ["deviceLabel"],
      });
    case "session:join":
      if (!isString(value.publicCode) || !isPublicCode(value.publicCode)) {
        return invalid("publicCode", "Public code is invalid.", "invalid_public_code");
      }

      return requireFields(value, ["publicCode", "deviceId"], {
        optionalStrings: ["deviceLabel"],
      });
    case "session:resume":
      return requireFields(value, ["sessionId", "deviceId"]);
    case "session:approve-peer":
    case "session:reject-peer":
      return requireFields(value, ["sessionId", "deviceId", "peerDeviceId"]);
    case "webrtc:offer":
    case "webrtc:answer":
      return validateWebRtcDescriptionMessage<ClientMessage>(value);
    case "webrtc:ice-candidate":
      return validateIceCandidateMessage<ClientMessage>(value);
    case "crypto:public-key":
      return validateCryptoPublicKeyClientMessage(value);
    case "session:end":
    case "presence:ping":
      return requireFields(value, ["sessionId", "deviceId"]);
    default:
      return invalid("type", "Unsupported client message type.");
  }
}

export function validateServerMessage(value: unknown): ValidationResult<ServerMessage> {
  if (!isRecord(value)) {
    return invalid("message", "Message must be an object.");
  }

  switch (value.type) {
    case "session:created":
      if (!isString(value.publicCode) || !isPublicCode(value.publicCode)) {
        return invalid("publicCode", "Public code is invalid.", "invalid_public_code");
      }

      return requireFields(value, ["sessionId", "publicCode", "joinUrl"], {
        numbers: ["expiresAt"],
      });
    case "session:join-request":
      return requireFields(value, ["sessionId", "peerDeviceId", "peerDeviceLabel"]);
    case "session:joined":
      return requireFields(value, ["sessionId", "peerDeviceId", "peerDeviceLabel"]);
    case "session:resumed": {
      const base = requireFields<ServerMessage>(value, [
        "sessionId",
        "peerDeviceId",
        "peerDeviceLabel",
        "role",
      ]);
      if (!base.ok) {
        return base;
      }
      if (value.role !== "host" && value.role !== "guest") {
        return invalid("role", "Role is invalid.");
      }
      return ok(value as ServerMessage);
    }
    case "session:rejected":
      return requireFields(value, ["reason"]);
    case "peer:connected":
    case "peer:disconnected":
      return requireFields(value, ["peerDeviceId"]);
    case "webrtc:offer":
    case "webrtc:answer":
      return validateWebRtcDescriptionMessage<ServerMessage>(value, false);
    case "webrtc:ice-candidate":
      return validateIceCandidateMessage<ServerMessage>(value, false);
    case "crypto:public-key":
      return validateCryptoPublicKeyServerMessage(value);
    case "session:expired":
    case "session:ended":
      return ok(value as ServerMessage);
    case "error":
      if (!isString(value.code) || !isProtocolErrorCode(value.code)) {
        return invalid("code", "Error code is invalid.");
      }

      return requireFields(value, ["code", "message"]);
    default:
      return invalid("type", "Unsupported server message type.");
  }
}

export function validateTransferMessage(value: unknown): ValidationResult<TransferMessage> {
  if (!isRecord(value)) {
    return invalid("message", "Message must be an object.");
  }

  switch (value.type) {
    case "file:offer":
      return validateFileOfferMessage(value);
    case "file:accept":
      return requireFields(value, ["transferId"]);
    case "file:reject":
      return requireFields(value, ["transferId"], {
        optionalStrings: ["reason"],
      });
    case "file:chunk":
      return requireFields(value, ["transferId", "fileId", "iv"], {
        integers: ["chunkIndex", "offset", "plaintextSize", "encryptedSize"],
      });
    case "file:complete":
      return requireFields(value, ["transferId", "fileId", "sha256"]);
    case "file:cancel":
      return requireFields(value, ["transferId"], {
        optionalStrings: ["fileId"],
      });
    case "transfer:error":
      return requireFields(value, ["transferId", "code", "message"], {
        optionalStrings: ["fileId"],
      });
    default:
      return invalid("type", "Unsupported transfer message type.");
  }
}

function validateWebRtcDescriptionMessage<T extends ClientMessage | ServerMessage>(
  value: Record<string, unknown>,
  client = true,
): ValidationResult<T> {
  const required = client ? ["sessionId", "fromDeviceId"] : ["fromDeviceId"];
  const base = requireFields(value, required);

  if (!base.ok) {
    return base;
  }

  if (!isRecord(value.sdp) || !isString(value.sdp.type) || !isString(value.sdp.sdp)) {
    return invalid("sdp", "Session description is invalid.");
  }

  if (value.sdp.type !== "offer" && value.sdp.type !== "answer") {
    return invalid("sdp.type", "Session description type is invalid.");
  }

  return ok(value as T);
}

function validateIceCandidateMessage<T extends ClientMessage | ServerMessage>(
  value: Record<string, unknown>,
  client = true,
): ValidationResult<T> {
  const required = client ? ["sessionId", "fromDeviceId"] : ["fromDeviceId"];
  const base = requireFields(value, required);

  if (!base.ok) {
    return base;
  }

  if (!isRecord(value.candidate)) {
    return invalid("candidate", "ICE candidate is invalid.");
  }

  return ok(value as T);
}

function validateCryptoPublicKeyClientMessage(
  value: Record<string, unknown>,
): ValidationResult<ClientMessage> {
  const base = requireFields(value, ["sessionId", "fromDeviceId"]);

  if (!base.ok) {
    return base;
  }

  if (!isJsonWebKey(value.publicKey)) {
    return invalid("publicKey", "Public key is invalid.", "crypto_failed");
  }

  return ok(value as ClientMessage);
}

function validateCryptoPublicKeyServerMessage(
  value: Record<string, unknown>,
): ValidationResult<ServerMessage> {
  const base = requireFields(value, ["fromDeviceId"]);

  if (!base.ok) {
    return base;
  }

  if (!isJsonWebKey(value.publicKey)) {
    return invalid("publicKey", "Public key is invalid.", "crypto_failed");
  }

  return ok(value as ServerMessage);
}

function validateFileOfferMessage(
  value: Record<string, unknown>,
): ValidationResult<TransferMessage> {
  const base = requireFields(value, ["transferId"], {
    numbers: ["totalSize"],
  });

  if (!base.ok) {
    return base;
  }

  if (!Array.isArray(value.files) || value.files.length === 0) {
    return invalid("files", "File offer must include at least one file.");
  }

  for (const [index, file] of value.files.entries()) {
    if (!isRecord(file)) {
      return invalid(`files.${index}`, "File offer item must be an object.");
    }

    const fileResult = requireFields(file, ["fileId", "name", "mimeType"], {
      numbers: ["size"],
      optionalNumbers: ["lastModified"],
    });

    if (!fileResult.ok) {
      return fileResult;
    }
  }

  return ok(value as TransferMessage);
}

function requireFields<T>(
  value: Record<string, unknown>,
  strings: string[],
  options: {
    optionalStrings?: string[];
    numbers?: string[];
    optionalNumbers?: string[];
    integers?: string[];
  } = {},
): ValidationResult<T> {
  for (const field of strings) {
    if (!isNonEmptyString(value[field])) {
      return invalid(field, `${field} is required.`);
    }
  }

  for (const field of options.optionalStrings ?? []) {
    if (value[field] !== undefined && !isString(value[field])) {
      return invalid(field, `${field} must be a string.`);
    }
  }

  for (const field of options.numbers ?? []) {
    if (!isSafeNonNegativeNumber(value[field])) {
      return invalid(field, `${field} must be a non-negative number.`);
    }
  }

  for (const field of options.optionalNumbers ?? []) {
    if (value[field] !== undefined && !isSafeNonNegativeNumber(value[field])) {
      return invalid(field, `${field} must be a non-negative number.`);
    }
  }

  for (const field of options.integers ?? []) {
    if (!isSafeNonNegativeInteger(value[field])) {
      return invalid(field, `${field} must be a non-negative integer.`);
    }
  }

  return ok(value as T);
}

function isJsonWebKey(value: unknown): value is JsonWebKey {
  return isRecord(value) && isString(value.kty);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isSafeNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function ok<T>(value: T): ValidationResult<T> {
  return {
    ok: true,
    value,
  };
}

function invalid<T>(
  field: string,
  message: string,
  code: ProtocolError["code"] = "invalid_message",
): ValidationResult<T> {
  return {
    ok: false,
    error: {
      code,
      field,
      message,
    },
  };
}
