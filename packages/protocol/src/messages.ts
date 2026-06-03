import type { ProtocolErrorCode } from "./errors.js";
import type { PublicConfig } from "./types.js";

export type SessionLimits = PublicConfig["limits"];

export type ClientMessage =
  | {
      type: "session:create";
      deviceId: string;
      deviceLabel?: string;
    }
  | {
      type: "session:join";
      publicCode: string;
      deviceId: string;
      deviceLabel?: string;
    }
  | {
      type: "session:resume";
      sessionId: string;
      deviceId: string;
    }
  | {
      type: "session:approve-peer";
      sessionId: string;
      deviceId: string;
      peerDeviceId: string;
    }
  | {
      type: "session:reject-peer";
      sessionId: string;
      deviceId: string;
      peerDeviceId: string;
    }
  | {
      type: "webrtc:offer";
      sessionId: string;
      fromDeviceId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc:answer";
      sessionId: string;
      fromDeviceId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc:ice-candidate";
      sessionId: string;
      fromDeviceId: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "crypto:public-key";
      sessionId: string;
      fromDeviceId: string;
      publicKey: JsonWebKey;
    }
  | {
      type: "session:end";
      sessionId: string;
      deviceId: string;
    }
  | {
      type: "presence:ping";
      sessionId: string;
      deviceId: string;
    };

export type ServerMessage =
  | {
      type: "session:created";
      sessionId: string;
      publicCode: string;
      joinUrl: string;
      expiresAt: number;
      limits?: SessionLimits;
    }
  | {
      type: "session:join-request";
      sessionId: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
      limits?: SessionLimits;
    }
  | {
      type: "session:joined";
      sessionId: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
      limits?: SessionLimits;
    }
  | {
      type: "session:resumed";
      sessionId: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
      role: "host" | "guest";
      limits?: SessionLimits;
    }
  | {
      type: "session:rejected";
      reason: string;
    }
  | {
      type: "peer:connected";
      peerDeviceId: string;
      limits?: SessionLimits;
    }
  | {
      type: "peer:disconnected";
      peerDeviceId: string;
    }
  | {
      type: "webrtc:offer";
      fromDeviceId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc:answer";
      fromDeviceId: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc:ice-candidate";
      fromDeviceId: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "crypto:public-key";
      fromDeviceId: string;
      publicKey: JsonWebKey;
    }
  | {
      type: "session:expired";
    }
  | {
      type: "session:ended";
    }
  | {
      type: "error";
      code: ProtocolErrorCode;
      message: string;
    };

export type FileOfferMessage = {
  type: "file:offer";
  transferId: string;
  files: FileOfferItem[];
  totalSize: number;
};

export type FileOfferItem = {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  lastModified?: number;
};

export type FileAcceptMessage = {
  type: "file:accept";
  transferId: string;
};

export type FileRejectMessage = {
  type: "file:reject";
  transferId: string;
  reason?: string;
};

export type FileChunkHeaderMessage = {
  type: "file:chunk";
  transferId: string;
  fileId: string;
  chunkIndex: number;
  offset: number;
  plaintextSize: number;
  encryptedSize: number;
  iv: string;
  plaintextSha256?: string;
};

export type FileCompleteMessage = {
  type: "file:complete";
  transferId: string;
  fileId: string;
  sha256: string;
};

export type FileCancelMessage = {
  type: "file:cancel";
  transferId: string;
  fileId?: string;
};

export type TransferErrorMessage = {
  type: "transfer:error";
  transferId: string;
  fileId?: string;
  code: string;
  message: string;
};

export type TransferMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileChunkHeaderMessage
  | FileCompleteMessage
  | FileCancelMessage
  | TransferErrorMessage;
