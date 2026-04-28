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
});

