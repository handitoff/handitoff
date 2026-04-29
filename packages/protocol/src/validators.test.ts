import { describe, expect, it } from "vitest";

import {
  validateClientMessage,
  validateServerMessage,
  validateTransferMessage,
} from "./validators.js";

describe("validateClientMessage", () => {
  it.each([
    [{ type: "session:create", deviceId: "device-1" }],
    [{ type: "session:join", publicCode: "A7K9Q2", deviceId: "device-1" }],
    [{ type: "session:resume", sessionId: "session-1", deviceId: "device-1" }],
    [
      {
        type: "session:approve-peer",
        sessionId: "session-1",
        deviceId: "host-1",
        peerDeviceId: "guest-1",
      },
    ],
    [
      {
        type: "session:reject-peer",
        sessionId: "session-1",
        deviceId: "host-1",
        peerDeviceId: "guest-1",
      },
    ],
    [
      {
        type: "webrtc:offer",
        sessionId: "session-1",
        fromDeviceId: "host-1",
        sdp: { type: "offer", sdp: "v=0" },
      },
    ],
    [
      {
        type: "webrtc:answer",
        sessionId: "session-1",
        fromDeviceId: "guest-1",
        sdp: { type: "answer", sdp: "v=0" },
      },
    ],
    [
      {
        type: "webrtc:ice-candidate",
        sessionId: "session-1",
        fromDeviceId: "guest-1",
        candidate: { candidate: "candidate", sdpMid: "0", sdpMLineIndex: 0 },
      },
    ],
    [
      {
        type: "crypto:public-key",
        sessionId: "session-1",
        fromDeviceId: "guest-1",
        publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      },
    ],
    [{ type: "session:end", sessionId: "session-1", deviceId: "host-1" }],
    [{ type: "presence:ping", sessionId: "session-1", deviceId: "host-1" }],
  ])("accepts valid client message %#", (message) => {
    expect(validateClientMessage(message).ok).toBe(true);
  });

  it("rejects invalid public codes", () => {
    const result = validateClientMessage({
      type: "session:join",
      publicCode: "bad",
      deviceId: "device-1",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_public_code",
        field: "publicCode",
        message: "Public code is invalid.",
      },
    });
  });

  it("rejects unsupported client message types", () => {
    expect(validateClientMessage({ type: "unknown" }).ok).toBe(false);
  });

  it("rejects malformed or private crypto public keys", () => {
    expect(
      validateClientMessage({
        type: "crypto:public-key",
        sessionId: "session-1",
        fromDeviceId: "guest-1",
        publicKey: { kty: "EC", crv: "P-384", x: "x", y: "y" },
      }),
    ).toMatchObject({ ok: false, error: { code: "crypto_failed", field: "publicKey" } });

    expect(
      validateClientMessage({
        type: "crypto:public-key",
        sessionId: "session-1",
        fromDeviceId: "guest-1",
        publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "private" },
      }),
    ).toMatchObject({ ok: false, error: { code: "crypto_failed", field: "publicKey" } });
  });
});

describe("validateServerMessage", () => {
  it.each([
    [
      {
        type: "session:created",
        sessionId: "session-1",
        publicCode: "A7K9Q2",
        joinUrl: "https://handitoff.io/join/A7K9Q2",
        expiresAt: Date.now(),
      },
    ],
    [
      {
        type: "session:join-request",
        sessionId: "session-1",
        peerDeviceId: "guest-1",
        peerDeviceLabel: "iPhone",
      },
    ],
    [
      {
        type: "session:joined",
        sessionId: "session-1",
        peerDeviceId: "host-1",
        peerDeviceLabel: "MacBook",
      },
    ],
    [
      {
        type: "session:resumed",
        sessionId: "session-1",
        peerDeviceId: "host-1",
        peerDeviceLabel: "MacBook",
        role: "guest",
      },
    ],
    [{ type: "session:rejected", reason: "Rejected by host." }],
    [{ type: "peer:connected", peerDeviceId: "guest-1" }],
    [{ type: "peer:disconnected", peerDeviceId: "guest-1" }],
    [{ type: "webrtc:offer", fromDeviceId: "host-1", sdp: { type: "offer", sdp: "v=0" } }],
    [{ type: "webrtc:answer", fromDeviceId: "guest-1", sdp: { type: "answer", sdp: "v=0" } }],
    [
      {
        type: "webrtc:ice-candidate",
        fromDeviceId: "guest-1",
        candidate: { candidate: "candidate", sdpMid: "0", sdpMLineIndex: 0 },
      },
    ],
    [
      {
        type: "crypto:public-key",
        fromDeviceId: "guest-1",
        publicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      },
    ],
    [{ type: "session:expired" }],
    [{ type: "session:ended" }],
    [{ type: "error", code: "invalid_message", message: "Bad message." }],
  ])("accepts valid server message %#", (message) => {
    expect(validateServerMessage(message).ok).toBe(true);
  });

  it("rejects invalid error codes", () => {
    expect(validateServerMessage({ type: "error", code: "bad", message: "Bad." }).ok).toBe(false);
  });
});

describe("validateTransferMessage", () => {
  it.each([
    [
      {
        type: "file:offer",
        transferId: "transfer-1",
        totalSize: 10,
        files: [{ fileId: "file-1", name: "photo.jpg", size: 10, mimeType: "image/jpeg" }],
      },
    ],
    [{ type: "file:accept", transferId: "transfer-1" }],
    [{ type: "file:reject", transferId: "transfer-1", reason: "No thanks." }],
    [
      {
        type: "file:chunk",
        transferId: "transfer-1",
        fileId: "file-1",
        chunkIndex: 0,
        offset: 0,
        plaintextSize: 10,
        encryptedSize: 26,
        iv: "base64url-iv",
      },
    ],
    [{ type: "file:complete", transferId: "transfer-1", fileId: "file-1", sha256: "abc123" }],
    [{ type: "file:cancel", transferId: "transfer-1", fileId: "file-1" }],
    [
      {
        type: "transfer:error",
        transferId: "transfer-1",
        fileId: "file-1",
        code: "decrypt_failed",
        message: "Could not decrypt chunk.",
      },
    ],
  ])("accepts valid transfer message %#", (message) => {
    expect(validateTransferMessage(message).ok).toBe(true);
  });

  it("rejects empty file offers", () => {
    const result = validateTransferMessage({
      type: "file:offer",
      transferId: "transfer-1",
      totalSize: 0,
      files: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_message",
        field: "files",
        message: "File offer must include at least one file.",
      },
    });
  });

  it("rejects negative chunk indexes", () => {
    expect(
      validateTransferMessage({
        type: "file:chunk",
        transferId: "transfer-1",
        fileId: "file-1",
        chunkIndex: -1,
        offset: 0,
        plaintextSize: 10,
        encryptedSize: 26,
        iv: "base64url-iv",
      }).ok,
    ).toBe(false);
  });
});
