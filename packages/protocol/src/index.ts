export type SessionStatus = "waiting" | "pairing" | "connected" | "ended" | "expired";

export type DeviceRole = "host" | "guest";

export type Device = {
  id: string;
  role: DeviceRole;
  label: string;
  userAgent?: string;
  connectedAt: number;
  lastSeenAt: number;
};

export type Session = {
  id: string;
  publicCode: string;
  createdAt: number;
  expiresAt: number;
  status: SessionStatus;
  hostDeviceId: string;
  guestDeviceId?: string;
};

export type ProtocolErrorCode =
  | "invalid_message"
  | "session_not_found"
  | "session_expired"
  | "session_ended"
  | "not_authorized"
  | "rate_limited"
  | "peer_not_approved"
  | "transfer_failed"
  | "crypto_failed"
  | "webrtc_failed"
  | "internal_error";
