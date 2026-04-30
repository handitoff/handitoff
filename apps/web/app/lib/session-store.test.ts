import { describe, expect, it } from "vitest";

import { initialClientSessionState, reduceClientSessionState } from "./session-store";

describe("reduceClientSessionState", () => {
  it("creates explicit host session transitions", () => {
    const creating = reduceClientSessionState(initialClientSessionState, {
      type: "session:create-start",
      deviceId: "host-1",
      deviceLabel: "MacBook",
    });
    expect(creating.connection).toBe("creating");

    const waiting = reduceClientSessionState(creating, {
      type: "session:created",
      sessionId: "session-1",
      publicCode: "ABC234",
    });
    expect(waiting).toMatchObject({
      connection: "waiting",
      sessionId: "session-1",
      publicCode: "ABC234",
    });
  });

  it("ignores invalid pairing transitions", () => {
    const paired = reduceClientSessionState(initialClientSessionState, {
      type: "session:paired",
      sessionId: "session-1",
      peerDeviceId: "guest-1",
      peerDeviceLabel: "iPhone",
    });

    expect(paired).toBe(initialClientSessionState);
  });

  it("tracks transfers by direction without persistence", () => {
    const state = reduceClientSessionState(initialClientSessionState, {
      type: "transfer:upsert",
      item: {
        id: "file-1",
        name: "design.pdf",
        size: 42,
        progress: 0.5,
        direction: "outgoing",
      },
    });

    expect(state.transfer.outgoing).toHaveLength(1);
    expect(state.transfer.incoming).toHaveLength(0);
  });

  it("tracks secure transfer readiness separately from WebRTC connectivity", () => {
    const paired = reduceClientSessionState(
      {
        ...initialClientSessionState,
        connection: "paired",
      },
      { type: "webrtc:connected" },
    );
    const channelOpen = reduceClientSessionState(paired, { type: "data-channel:open" });
    const exchanging = reduceClientSessionState(channelOpen, { type: "crypto:exchanging" });
    const ready = reduceClientSessionState(exchanging, { type: "crypto:ready" });

    expect(channelOpen).toMatchObject({ webrtc: "connected", dataChannel: "open", crypto: "idle" });
    expect(exchanging.crypto).toBe("exchanging");
    expect(ready.crypto).toBe("ready");
    expect(reduceClientSessionState(ready, { type: "data-channel:closed" }).crypto).toBe("idle");
  });

  it("tracks host approval prompt state", () => {
    const waiting = reduceClientSessionState(
      reduceClientSessionState(initialClientSessionState, {
        type: "session:create-start",
        deviceId: "host-1",
        deviceLabel: "MacBook",
      }),
      {
        type: "session:created",
        sessionId: "session-1",
        publicCode: "ABC234",
      },
    );

    const prompted = reduceClientSessionState(waiting, {
      type: "session:join-request-received",
      sessionId: "session-1",
      peerDeviceId: "guest-1",
      peerDeviceLabel: "iPhone",
    });

    expect(prompted).toMatchObject({
      connection: "waiting",
      pendingPeerDeviceId: "guest-1",
      pendingPeerDeviceLabel: "iPhone",
    });

    const paired = reduceClientSessionState(prompted, {
      type: "session:paired",
      sessionId: "session-1",
      peerDeviceId: "guest-1",
      peerDeviceLabel: "iPhone",
    });

    expect(paired).toMatchObject({
      connection: "paired",
      peerDeviceLabel: "iPhone",
    });
    expect(paired.pendingPeerDeviceId).toBeUndefined();
  });

  it("does not turn a created session into a creation error when the socket disconnects", () => {
    const waiting = reduceClientSessionState(
      reduceClientSessionState(initialClientSessionState, {
        type: "session:create-start",
        deviceId: "host-1",
        deviceLabel: "MacBook",
      }),
      {
        type: "session:created",
        sessionId: "session-1",
        publicCode: "ABC234",
      },
    );

    expect(reduceClientSessionState(waiting, { type: "socket:disconnected" })).toMatchObject({
      connection: "waiting",
      sessionId: "session-1",
      publicCode: "ABC234",
      websocket: "disconnected",
    });
  });

  it("tracks rejected and expired pairing states", () => {
    const joining = reduceClientSessionState(initialClientSessionState, {
      type: "session:join-start",
      publicCode: "ABC234",
      deviceId: "guest-1",
      deviceLabel: "iPhone",
    });

    expect(
      reduceClientSessionState(joining, { type: "session:rejected", message: "Rejected." }),
    ).toMatchObject({
      connection: "rejected",
      error: "Rejected.",
    });
    expect(reduceClientSessionState(joining, { type: "session:expired" })).toMatchObject({
      connection: "expired",
    });
  });
});
