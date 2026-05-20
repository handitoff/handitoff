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

export type PublicSession = {
  publicCode: string;
  status: SessionStatus;
  expiresAt: number;
};

export type PublicConfig = {
  appUrl: string;
  apiUrl: string;
  wsUrl: string;
  iceServers: PublicIceServer[];
  billing: {
    enabled: boolean;
  };
  limits: {
    unpairedSessionTtlSeconds: number;
    pairedSessionTtlSeconds: number;
    maxFilesPerTransfer?: number;
    maxFileSizeBytes?: number;
    maxRecommendedFileSizeBytes?: number;
  };
  features: {
    turnEnabled: boolean;
    multiDeviceRooms: boolean;
    accounts: boolean;
  };
};

export type PublicIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
