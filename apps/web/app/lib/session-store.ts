export type ClientConnectionState =
  | "idle"
  | "creating"
  | "waiting"
  | "joining"
  | "paired"
  | "rejected"
  | "ended"
  | "expired"
  | "error";

export type ClientSessionState = {
  connection: ClientConnectionState;
  sessionId?: string;
  publicCode?: string;
  deviceId?: string;
  deviceLabel?: string;
  peerDeviceId?: string;
  peerDeviceLabel?: string;
  role?: "host" | "guest";
  pendingPeerDeviceId?: string;
  pendingPeerDeviceLabel?: string;
  websocket: "disconnected" | "connecting" | "connected";
  webrtc: "idle" | "negotiating" | "connected" | "failed";
  dataChannel: "idle" | "connecting" | "open" | "closed" | "failed";
  crypto: "idle" | "generating" | "exchanging" | "ready" | "failed";
  transfer: {
    outgoing: TransferItem[];
    incoming: TransferItem[];
  };
  error?: string;
};

export type TransferItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  direction: "incoming" | "outgoing";
};

export type ClientSessionAction =
  | { type: "socket:connecting" }
  | { type: "socket:connected" }
  | { type: "socket:disconnected"; reason?: string }
  | { type: "session:create-start"; deviceId: string; deviceLabel: string }
  | { type: "session:created"; sessionId: string; publicCode: string }
  | { type: "session:join-start"; publicCode: string; deviceId: string; deviceLabel: string }
  | {
      type: "session:resume-start";
      sessionId: string;
      publicCode: string;
      deviceId: string;
      deviceLabel: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
      role: "host" | "guest";
    }
  | { type: "session:join-requested"; sessionId: string }
  | {
      type: "session:join-request-received";
      sessionId: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
    }
  | {
      type: "session:paired";
      sessionId: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
      role?: "host" | "guest";
    }
  | { type: "session:rejected"; message?: string }
  | { type: "session:expired" }
  | { type: "session:ended" }
  | { type: "session:error"; message: string }
  | { type: "webrtc:negotiating" }
  | { type: "webrtc:connected" }
  | { type: "webrtc:failed"; message: string }
  | { type: "data-channel:connecting" }
  | { type: "data-channel:open" }
  | { type: "data-channel:closed" }
  | { type: "data-channel:failed"; message: string }
  | { type: "crypto:generating" }
  | { type: "crypto:exchanging" }
  | { type: "crypto:ready" }
  | { type: "crypto:failed"; message: string }
  | { type: "transfer:upsert"; item: TransferItem }
  | { type: "transfer:clear" };

export const initialClientSessionState: ClientSessionState = {
  connection: "idle",
  websocket: "disconnected",
  webrtc: "idle",
  dataChannel: "idle",
  crypto: "idle",
  transfer: {
    outgoing: [],
    incoming: [],
  },
};

export function reduceClientSessionState(
  state: ClientSessionState,
  action: ClientSessionAction,
): ClientSessionState {
  switch (action.type) {
    case "socket:connecting":
      return { ...state, websocket: "connecting" };
    case "socket:connected":
      return { ...state, websocket: "connected" };
    case "socket:disconnected":
      return {
        ...state,
        websocket: "disconnected",
        connection: state.connection === "ended" ? "ended" : "error",
        ...(action.reason === undefined ? {} : { error: action.reason }),
      };
    case "session:create-start":
      return {
        ...initialClientSessionState,
        websocket: state.websocket,
        connection: "creating",
        deviceId: action.deviceId,
        deviceLabel: action.deviceLabel,
      };
    case "session:created":
      if (state.connection !== "creating") {
        return state;
      }
      return {
        ...state,
        connection: "waiting",
        sessionId: action.sessionId,
        publicCode: action.publicCode,
      };
    case "session:join-start":
      return {
        ...initialClientSessionState,
        websocket: state.websocket,
        connection: "joining",
        publicCode: action.publicCode,
        deviceId: action.deviceId,
        deviceLabel: action.deviceLabel,
      };
    case "session:resume-start":
      return {
        ...initialClientSessionState,
        websocket: state.websocket,
        connection: "paired",
        sessionId: action.sessionId,
        publicCode: action.publicCode,
        deviceId: action.deviceId,
        deviceLabel: action.deviceLabel,
        peerDeviceId: action.peerDeviceId,
        peerDeviceLabel: action.peerDeviceLabel,
        role: action.role,
      };
    case "session:join-requested":
      if (state.connection !== "joining") {
        return state;
      }
      return { ...state, sessionId: action.sessionId };
    case "session:join-request-received":
      if (state.connection !== "waiting") {
        return state;
      }
      return {
        ...state,
        sessionId: action.sessionId,
        pendingPeerDeviceId: action.peerDeviceId,
        pendingPeerDeviceLabel: action.peerDeviceLabel,
      };
    case "session:paired":
      if (state.connection !== "waiting" && state.connection !== "joining") {
        return state;
      }
      {
        const { pendingPeerDeviceId, pendingPeerDeviceLabel, ...rest } = state;
        void pendingPeerDeviceId;
        void pendingPeerDeviceLabel;
        return {
          ...rest,
          connection: "paired",
          sessionId: action.sessionId,
          peerDeviceId: action.peerDeviceId,
          peerDeviceLabel: action.peerDeviceLabel,
          ...(action.role === undefined ? {} : { role: action.role }),
        };
      }
    case "session:rejected": {
      const { pendingPeerDeviceId, pendingPeerDeviceLabel, ...rest } = state;
      void pendingPeerDeviceId;
      void pendingPeerDeviceLabel;
      return {
        ...rest,
        connection: "rejected",
        ...(action.message === undefined ? {} : { error: action.message }),
      };
    }
    case "session:expired": {
      const { pendingPeerDeviceId, pendingPeerDeviceLabel, ...rest } = state;
      void pendingPeerDeviceId;
      void pendingPeerDeviceLabel;
      return {
        ...rest,
        connection: "expired",
      };
    }
    case "session:ended":
      return {
        ...state,
        connection: "ended",
        webrtc: "idle",
        dataChannel: "idle",
        crypto: "idle",
      };
    case "session:error":
      return { ...state, connection: "error", error: action.message };
    case "webrtc:negotiating":
      return state.connection === "paired" ? { ...state, webrtc: "negotiating" } : state;
    case "webrtc:connected":
      return state.connection === "paired" ? { ...state, webrtc: "connected" } : state;
    case "webrtc:failed":
      return { ...state, webrtc: "failed", crypto: "idle", error: action.message };
    case "data-channel:connecting":
      return state.connection === "paired" ? { ...state, dataChannel: "connecting" } : state;
    case "data-channel:open":
      return state.connection === "paired" ? { ...state, dataChannel: "open" } : state;
    case "data-channel:closed":
      return { ...state, dataChannel: "closed", crypto: "idle" };
    case "data-channel:failed":
      return { ...state, dataChannel: "failed", crypto: "idle", error: action.message };
    case "crypto:generating":
      return state.connection === "paired" ? { ...state, crypto: "generating" } : state;
    case "crypto:exchanging":
      return state.connection === "paired" ? { ...state, crypto: "exchanging" } : state;
    case "crypto:ready":
      return state.connection === "paired" ? { ...state, crypto: "ready" } : state;
    case "crypto:failed":
      return { ...state, crypto: "failed", error: action.message };
    case "transfer:upsert":
      return {
        ...state,
        transfer: upsertTransfer(state.transfer, action.item),
      };
    case "transfer:clear":
      return { ...state, transfer: { outgoing: [], incoming: [] } };
  }
}

function upsertTransfer(
  transfer: ClientSessionState["transfer"],
  item: TransferItem,
): ClientSessionState["transfer"] {
  const key = item.direction;
  const list = transfer[key];
  const index = list.findIndex((existing) => existing.id === item.id);
  const next =
    index === -1
      ? [...list, item]
      : list.map((existing) => (existing.id === item.id ? item : existing));
  return { ...transfer, [key]: next };
}
