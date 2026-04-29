import { describe, expect, it } from "vitest";

import { WebRtcPeer, type WebRtcPeerEvent } from "./webrtc-peer";

describe("WebRtcPeer", () => {
  it("constructs with configured ICE servers and creates a reliable files channel for the host", async () => {
    const events: WebRtcPeerEvent[] = [];
    const connection = new FakePeerConnection();
    const peer = new WebRtcPeer({
      role: "host",
      iceServers: [{ urls: "stun:example.test:3478" }],
      onEvent: (event) => events.push(event),
      peerConnectionFactory: (configuration) => {
        connection.configuration = configuration;
        return connection as unknown as RTCPeerConnection;
      },
    });

    await peer.startOffer();

    expect(connection.configuration).toEqual({ iceServers: [{ urls: "stun:example.test:3478" }] });
    expect(connection.createdChannel?.label).toBe("files");
    expect(connection.createdChannel?.options).toEqual({ ordered: true });
    expect(connection.createdChannel?.binaryType).toBe("arraybuffer");
    expect(connection.localDescription).toEqual({ type: "offer", sdp: "offer-sdp" });
    expect(events).toContainEqual({
      type: "local-description",
      description: { type: "offer", sdp: "offer-sdp" },
    });
  });

  it("queues ICE candidates until the remote description is set", async () => {
    const connection = new FakePeerConnection();
    const peer = new WebRtcPeer({
      role: "guest",
      iceServers: [],
      onEvent: () => undefined,
      peerConnectionFactory: () => connection as unknown as RTCPeerConnection,
    });

    await peer.addIceCandidate({ candidate: "candidate-before" });
    expect(connection.addedCandidates).toEqual([]);

    await peer.acceptOffer({ type: "offer", sdp: "remote-offer" });
    expect(connection.remoteDescription).toEqual({ type: "offer", sdp: "remote-offer" });
    expect(connection.addedCandidates).toEqual([{ candidate: "candidate-before" }]);
    expect(connection.localDescription).toEqual({ type: "answer", sdp: "answer-sdp" });
  });

  it("closes the data channel and peer connection during cleanup", async () => {
    const connection = new FakePeerConnection();
    const peer = new WebRtcPeer({
      role: "host",
      iceServers: [],
      onEvent: () => undefined,
      peerConnectionFactory: () => connection as unknown as RTCPeerConnection,
    });

    await peer.startOffer();
    peer.close();

    expect(connection.createdChannel?.closed).toBe(true);
    expect(connection.closed).toBe(true);
  });
});

class FakePeerConnection {
  public configuration: RTCConfiguration | undefined;
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public connectionState: RTCPeerConnectionState = "new";
  public iceConnectionState: RTCIceConnectionState = "new";
  public createdChannel: FakeDataChannel | undefined;
  public readonly addedCandidates: RTCIceCandidateInit[] = [];
  public closed = false;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public createDataChannel(label: string, options?: RTCDataChannelInit): FakeDataChannel {
    this.createdChannel = new FakeDataChannel(label, options);
    return this.createdChannel;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "offer-sdp" };
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "answer-sdp" };
  }

  public async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
  }

  public async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  public close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }
}

class FakeDataChannel {
  public binaryType: BinaryType = "blob";
  public readyState: RTCDataChannelState = "connecting";
  public closed = false;
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  public constructor(
    public readonly label: string,
    public readonly options?: RTCDataChannelInit,
  ) {}

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public send(): void {
    return;
  }

  public close(): void {
    this.closed = true;
    this.readyState = "closed";
  }
}
