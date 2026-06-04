import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import type { SessionLimits } from "@handitoff/protocol";
import { Button } from "../ui/button";
import { OnlineDot } from "./ui";
import {
  getDeviceRegistration,
  listDevices,
  removeDevice as removeDeviceRequest,
  renameDevice as renameDeviceRequest,
  type AccountDevice,
  type DeviceRegistration,
} from "../../lib/devices";
import { loadPublicRuntimeConfig } from "../../lib/runtime-config";
import { HanditoffWebSocketClient } from "../../lib/websocket-client";

// ─────────────────────────────────────────────────────────────────────────────
// Signed-in devices presence + handoff.
//
// The provider keeps one signaling websocket open for the whole account area.
// It registers this browser as a device, heartbeats so the account sees it as
// online, and drives the account-handoff request/accept/reject dance. When a
// handoff is established it stores the same session context the QR flow uses and
// navigates into the live session screen, so account handoffs become ordinary
// handoff sessions.
// ─────────────────────────────────────────────────────────────────────────────

type Limits = SessionLimits;

type OutgoingHandoff = {
  targetDeviceId: string;
  targetLabel: string;
  status: "requesting" | "waiting";
};

type IncomingHandoff = {
  requestId: string;
  fromDeviceLabel: string;
  accepting: boolean;
};

export type DevicesContextValue = {
  /** Whether the presence socket is connected. */
  online: boolean;
  /** Device id of this browser. */
  thisDeviceId: string;
  devices: AccountDevice[];
  /** Other account devices that are online right now (excludes this device). */
  onlineTargets: AccountDevice[];
  startHandoff: (target: AccountDevice) => void;
  cancelOutgoing: () => void;
  outgoing: OutgoingHandoff | undefined;
  renameDevice: (deviceId: string, label: string) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
};

const DevicesContext = createContext<DevicesContextValue | undefined>(undefined);

export function useDevices(): DevicesContextValue {
  const value = useContext(DevicesContext);
  if (value === undefined) {
    throw new Error("useDevices must be used within a DevicesProvider.");
  }
  return value;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 2_500;
// How long to wait for a registration ack before re-sending device:register.
// A stale socket holding our deviceId (StrictMode remount, an old tab) gets
// swept/closed within this window, so the retry then wins the slot.
const REGISTER_RETRY_DELAY_MS = 3_000;

export function DevicesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // Device metadata is stable; the *label* is owned per-device (see registerLabelRef).
  const registration = useMemo<DeviceRegistration>(() => getDeviceRegistration(), []);

  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [online, setOnline] = useState(false);
  const [outgoing, setOutgoing] = useState<OutgoingHandoff | undefined>(undefined);
  const [incoming, setIncoming] = useState<IncomingHandoff | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const socketRef = useRef<HanditoffWebSocketClient | undefined>(undefined);
  const heartbeatRef = useRef<number | undefined>(undefined);
  const reconnectRef = useRef<number | undefined>(undefined);
  const registerRetryRef = useRef<number | undefined>(undefined);
  const registeredRef = useRef(false);
  // The label to (re)register this device under. Seeded from the device's
  // existing label so reconnects never clobber a rename; falls back to the
  // inferred default for a device that hasn't been registered before.
  const registerLabelRef = useRef<string | undefined>(undefined);
  const unmountedRef = useRef(false);
  const navigatingRef = useRef(false);
  const outgoingRef = useRef<OutgoingHandoff | undefined>(undefined);
  const incomingRef = useRef<IncomingHandoff | undefined>(undefined);
  // Session info the host learns from account-handoff:started, awaiting peer:connected.
  const pendingHostRef = useRef<
    { sessionId: string; publicCode: string; limits?: Limits } | undefined
  >(undefined);

  outgoingRef.current = outgoing;
  incomingRef.current = incoming;

  const storeSessionContext = useCallback(
    (context: {
      sessionId: string;
      peerDeviceId: string;
      peerDeviceLabel: string;
      code: string;
      role: "host" | "guest";
      limits?: Limits;
    }) => {
      const store = window.sessionStorage;
      store.setItem("handitoff.sessionId", context.sessionId);
      store.setItem("handitoff.deviceId", registration.deviceId);
      store.setItem("handitoff.deviceLabel", registerLabelRef.current ?? registration.label);
      store.setItem("handitoff.peerDeviceId", context.peerDeviceId);
      store.setItem("handitoff.connectedPeerLabel", context.peerDeviceLabel);
      store.setItem("handitoff.connectedCode", context.code.toUpperCase());
      store.setItem("handitoff.role", context.role);
      if (context.limits !== undefined) {
        store.setItem("handitoff.sessionLimits", JSON.stringify(context.limits));
      } else {
        store.removeItem("handitoff.sessionLimits");
      }
    },
    [registration.deviceId, registration.label],
  );

  const enterSession = useCallback(
    (code: string) => {
      navigatingRef.current = true;
      navigate(`/s/${code}`);
    },
    [navigate],
  );

  useEffect(() => {
    unmountedRef.current = false;
    const config = loadPublicRuntimeConfig();
    const socket = new HanditoffWebSocketClient(config.wsUrl);
    socketRef.current = socket;

    const stopHeartbeat = () => {
      if (heartbeatRef.current !== undefined) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = undefined;
      }
    };

    const stopRegisterRetry = () => {
      if (registerRetryRef.current !== undefined) {
        window.clearTimeout(registerRetryRef.current);
        registerRetryRef.current = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (unmountedRef.current || navigatingRef.current || reconnectRef.current !== undefined) {
        return;
      }
      reconnectRef.current = window.setTimeout(() => {
        reconnectRef.current = undefined;
        socket.connect();
      }, RECONNECT_DELAY_MS);
    };

    // Send device:register and keep retrying until the backend acks it (a
    // device:list with thisDevice === true). The backend rejects a second live
    // socket for the same deviceId, so the retry covers the brief window where a
    // prior socket (StrictMode remount, an old tab) still holds the slot.
    const sendRegister = () => {
      stopRegisterRetry();
      try {
        socket.send({
          type: "device:register",
          deviceId: registration.deviceId,
          deviceLabel: registerLabelRef.current ?? registration.label,
          browser: registration.browser,
          os: registration.os,
          deviceType: registration.deviceType,
        });
      } catch {
        // The socket dropped mid-send; the status listener reconnects.
        return;
      }
      registerRetryRef.current = window.setTimeout(() => {
        if (!registeredRef.current) {
          sendRegister();
        }
      }, REGISTER_RETRY_DELAY_MS);
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        try {
          socket.send({ type: "device:heartbeat", deviceId: registration.deviceId });
        } catch {
          // Status listener handles reconnect.
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    socket.onStatus((status) => {
      if (status === "connected") {
        setOnline(true);
        registeredRef.current = false;
        stopHeartbeat();
        sendRegister();
        return;
      }
      setOnline(false);
      registeredRef.current = false;
      stopHeartbeat();
      stopRegisterRetry();
      scheduleReconnect();
    });

    socket.onMessage((message) => {
      if (message.type === "device:list") {
        setDevices(message.devices);
        // Track this device's authoritative label so reconnects re-register
        // under it rather than clobbering a rename.
        const mine = message.devices.find((device) => device.thisDevice);
        if (mine !== undefined) {
          registerLabelRef.current = mine.label;
        }
        // Our registration is confirmed only once the server reports this
        // browser as the live owner of its deviceId. Start heartbeating then.
        if (!registeredRef.current && mine !== undefined) {
          registeredRef.current = true;
          stopRegisterRetry();
          startHeartbeat();
        }
        return;
      }

      if (message.type === "account-handoff:request") {
        setIncoming({
          requestId: message.requestId,
          fromDeviceLabel: message.fromDeviceLabel,
          accepting: false,
        });
        return;
      }

      if (message.type === "account-handoff:started") {
        pendingHostRef.current = {
          sessionId: message.sessionId,
          publicCode: message.publicCode,
          ...(message.limits === undefined ? {} : { limits: message.limits }),
        };
        setOutgoing((previous) =>
          previous === undefined ? previous : { ...previous, status: "waiting" },
        );
        return;
      }

      if (message.type === "peer:connected") {
        // Host side: the target accepted and the session is paired.
        const pending = pendingHostRef.current;
        const current = outgoingRef.current;
        if (pending === undefined) {
          return;
        }
        storeSessionContext({
          sessionId: pending.sessionId,
          peerDeviceId: message.peerDeviceId,
          peerDeviceLabel: current?.targetLabel ?? "Paired device",
          code: pending.publicCode,
          role: "host",
          ...((message.limits ?? pending.limits) !== undefined
            ? { limits: message.limits ?? pending.limits }
            : {}),
        });
        pendingHostRef.current = undefined;
        enterSession(pending.publicCode);
        return;
      }

      if (message.type === "session:joined") {
        // Target side: we accepted and joined the host's session.
        storeSessionContext({
          sessionId: message.sessionId,
          peerDeviceId: message.peerDeviceId,
          peerDeviceLabel: message.peerDeviceLabel,
          code: message.sessionId,
          role: "guest",
          ...(message.limits === undefined ? {} : { limits: message.limits }),
        });
        setIncoming(undefined);
        enterSession(message.sessionId);
        return;
      }

      if (message.type === "account-handoff:rejected") {
        const current = outgoingRef.current;
        pendingHostRef.current = undefined;
        setOutgoing(undefined);
        setNotice(
          message.reason === "peer_disconnected"
            ? `${current?.targetLabel ?? "That device"} went offline before accepting.`
            : `${current?.targetLabel ?? "That device"} declined the handoff.`,
        );
        // A reject can also target the receiver if their request was withdrawn.
        setIncoming((previous) =>
          previous?.requestId === message.requestId ? undefined : previous,
        );
        return;
      }

      if (message.type === "error") {
        // Errors tied to a handoff the user started/received are worth showing.
        if (outgoingRef.current !== undefined || incomingRef.current !== undefined) {
          pendingHostRef.current = undefined;
          setOutgoing(undefined);
          setIncoming(undefined);
          setNotice(message.message);
          return;
        }
        // Otherwise it's presence plumbing (e.g. a registration race or a lost
        // slot). Don't surface it; recover quietly. If a retry isn't already
        // pending, schedule one — never re-register in a tight loop against a
        // socket that's still closing.
        registeredRef.current = false;
        stopHeartbeat();
        if (registerRetryRef.current === undefined) {
          sendRegister();
        }
      }
    });

    // Seed this device's existing label from REST before opening the socket, so
    // the first device:register re-uses the saved name instead of overwriting
    // it. Connect regardless of whether the lookup succeeds.
    const bootstrap = new AbortController();
    listDevices(registration.deviceId, { signal: bootstrap.signal })
      .then((list) => {
        if (unmountedRef.current) {
          return;
        }
        const mine = list.find((device) => device.id === registration.deviceId);
        if (mine !== undefined) {
          registerLabelRef.current = mine.label;
        }
        setDevices((current) => (current.length === 0 ? list : current));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!unmountedRef.current) {
          socket.connect();
        }
      });

    return () => {
      unmountedRef.current = true;
      registeredRef.current = false;
      bootstrap.abort();
      stopHeartbeat();
      stopRegisterRetry();
      if (reconnectRef.current !== undefined) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = undefined;
      }
      socket.close();
      socketRef.current = undefined;
    };
  }, [enterSession, registration, storeSessionContext]);

  // Auto-dismiss the transient notice.
  useEffect(() => {
    if (notice === undefined) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(undefined), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const startHandoff = useCallback(
    (target: AccountDevice) => {
      if (!target.online || target.thisDevice || outgoingRef.current !== undefined) {
        return;
      }
      setNotice(undefined);
      setOutgoing({ targetDeviceId: target.id, targetLabel: target.label, status: "requesting" });
      try {
        socketRef.current?.send({
          type: "account-handoff:start",
          deviceId: registration.deviceId,
          targetDeviceId: target.id,
          deviceLabel: registerLabelRef.current ?? registration.label,
        });
      } catch {
        setOutgoing(undefined);
        setNotice("Couldn't reach the signaling server. Try again.");
      }
    },
    [registration.deviceId, registration.label],
  );

  const cancelOutgoing = useCallback(() => {
    pendingHostRef.current = undefined;
    setOutgoing(undefined);
    // Dropping the socket lets the backend tear down the pending session and
    // notify the target; the status listener reconnects and re-registers.
    socketRef.current?.close();
  }, []);

  const acceptIncoming = useCallback(() => {
    setIncoming((previous) => {
      if (previous === undefined) {
        return previous;
      }
      try {
        socketRef.current?.send({
          type: "account-handoff:accept",
          requestId: previous.requestId,
          deviceId: registration.deviceId,
        });
        return { ...previous, accepting: true };
      } catch {
        setNotice("Couldn't reach the signaling server. Try again.");
        return undefined;
      }
    });
  }, [registration.deviceId]);

  const rejectIncoming = useCallback(() => {
    setIncoming((previous) => {
      if (previous !== undefined) {
        try {
          socketRef.current?.send({
            type: "account-handoff:reject",
            requestId: previous.requestId,
            deviceId: registration.deviceId,
          });
        } catch {
          // Best effort — the request expires server-side regardless.
        }
      }
      return undefined;
    });
  }, [registration.deviceId]);

  const renameDevice = useCallback(
    async (deviceId: string, label: string) => {
      const updated = await renameDeviceRequest(deviceId, label);
      // Keep future re-registrations of this device using the new name.
      if (deviceId === registration.deviceId) {
        registerLabelRef.current = updated.label;
      }
      setDevices((previous) =>
        previous.map((device) => (device.id === deviceId ? updated : device)),
      );
    },
    [registration.deviceId],
  );

  const removeDevice = useCallback(async (deviceId: string) => {
    await removeDeviceRequest(deviceId);
    setDevices((previous) => previous.filter((device) => device.id !== deviceId));
  }, []);

  const onlineTargets = useMemo(
    () => devices.filter((device) => device.online && !device.thisDevice),
    [devices],
  );

  const value: DevicesContextValue = {
    online,
    thisDeviceId: registration.deviceId,
    devices,
    onlineTargets,
    startHandoff,
    cancelOutgoing,
    outgoing,
    renameDevice,
    removeDevice,
  };

  return (
    <DevicesContext.Provider value={value}>
      {children}
      <HandoffModals
        incoming={incoming}
        outgoing={outgoing}
        notice={notice}
        onAccept={acceptIncoming}
        onReject={rejectIncoming}
        onCancelOutgoing={cancelOutgoing}
        onDismissNotice={() => setNotice(undefined)}
      />
    </DevicesContext.Provider>
  );
}

function HandoffModals({
  incoming,
  outgoing,
  notice,
  onAccept,
  onReject,
  onCancelOutgoing,
  onDismissNotice,
}: {
  incoming: IncomingHandoff | undefined;
  outgoing: OutgoingHandoff | undefined;
  notice: string | undefined;
  onAccept: () => void;
  onReject: () => void;
  onCancelOutgoing: () => void;
  onDismissNotice: () => void;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      {incoming !== undefined ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-50">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              Handoff request
            </p>
            <p className="text-base leading-snug text-zinc-200">
              <strong className="text-zinc-50">{incoming.fromDeviceLabel}</strong> wants to start a
              handoff with this device.
            </p>
            <div className="flex gap-2 pt-1">
              <Button type="button" onClick={onAccept} disabled={incoming.accepting}>
                {incoming.accepting ? "Connecting…" : "Accept"}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={onReject}
                disabled={incoming.accepting}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {outgoing !== undefined ? (
        <div className="fixed bottom-5 left-1/2 z-[65] flex w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-50 shadow-2xl shadow-black/40">
          <OnlineDot online />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-zinc-100">
              {outgoing.status === "waiting"
                ? `Waiting for ${outgoing.targetLabel} to accept…`
                : `Starting handoff with ${outgoing.targetLabel}…`}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Handoff request sent
            </span>
          </div>
          <Button variant="secondary" size="sm" type="button" onClick={onCancelOutgoing}>
            Cancel
          </Button>
        </div>
      ) : null}

      {notice !== undefined ? (
        <div className="fixed bottom-5 left-1/2 z-[65] flex w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-50 shadow-2xl shadow-black/40">
          <span className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-200">{notice}</span>
          <button
            type="button"
            onClick={onDismissNotice}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
