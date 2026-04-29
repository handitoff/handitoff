export type WebRtcPeerRole = "host" | "guest";

export type WebRtcPeerEvent =
  | { type: "connection-state"; state: RTCPeerConnectionState | RTCIceConnectionState }
  | { type: "local-description"; description: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit }
  | { type: "data-channel-open" }
  | { type: "data-channel-close" }
  | { type: "data-channel-error"; message: string }
  | { type: "data-channel-message"; data: unknown }
  | { type: "failed"; message: string };

export type WebRtcPeerOptions = {
  role: WebRtcPeerRole;
  iceServers: RTCIceServer[];
  onEvent: (event: WebRtcPeerEvent) => void;
  peerConnectionFactory?: (configuration: RTCConfiguration) => RTCPeerConnection;
};

export class WebRtcPeer {
  private readonly peerConnection: RTCPeerConnection;
  private dataChannel: RTCDataChannel | undefined;
  private readonly queuedCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  public constructor(private readonly options: WebRtcPeerOptions) {
    this.peerConnection = (
      options.peerConnectionFactory ?? ((configuration) => new RTCPeerConnection(configuration))
    )({
      iceServers: options.iceServers,
    });
    this.peerConnection.addEventListener("connectionstatechange", () =>
      this.handleConnectionState(),
    );
    this.peerConnection.addEventListener("iceconnectionstatechange", () =>
      this.handleIceConnectionState(),
    );
    this.peerConnection.addEventListener("icecandidate", (event) => {
      if (event.candidate !== null) {
        this.options.onEvent({ type: "ice-candidate", candidate: event.candidate.toJSON() });
      }
    });
    this.peerConnection.addEventListener("datachannel", (event) =>
      this.attachDataChannel(event.channel),
    );
  }

  public async startOffer(): Promise<void> {
    this.ensureOpen();
    if (this.options.role !== "host") {
      return;
    }
    this.attachDataChannel(this.peerConnection.createDataChannel("files", { ordered: true }));
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.options.onEvent({ type: "local-description", description: offer });
  }

  public async acceptOffer(description: RTCSessionDescriptionInit): Promise<void> {
    this.ensureOpen();
    await this.peerConnection.setRemoteDescription(description);
    await this.flushQueuedCandidates();
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    this.options.onEvent({ type: "local-description", description: answer });
  }

  public async acceptAnswer(description: RTCSessionDescriptionInit): Promise<void> {
    this.ensureOpen();
    await this.peerConnection.setRemoteDescription(description);
    await this.flushQueuedCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.ensureOpen();
    if (this.peerConnection.remoteDescription === null) {
      this.queuedCandidates.push(candidate);
      return;
    }
    await this.peerConnection.addIceCandidate(candidate);
  }

  public sendJson(value: unknown): void {
    if (this.dataChannel?.readyState !== "open") {
      throw new Error("DataChannel is not open.");
    }
    this.dataChannel.send(JSON.stringify(value));
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.queuedCandidates.length = 0;
    this.detachDataChannel();
    this.peerConnection.close();
  }

  private async flushQueuedCandidates(): Promise<void> {
    while (this.queuedCandidates.length > 0) {
      const candidate = this.queuedCandidates.shift();
      if (candidate !== undefined) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    }
  }

  private attachDataChannel(channel: RTCDataChannel): void {
    this.detachDataChannel();
    this.dataChannel = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      this.options.onEvent({ type: "data-channel-open" });
    });
    channel.addEventListener("close", () => {
      this.options.onEvent({ type: "data-channel-close" });
    });
    channel.addEventListener("error", () => {
      this.options.onEvent({ type: "data-channel-error", message: "DataChannel failed." });
    });
    channel.addEventListener("message", (event) => {
      this.options.onEvent({ type: "data-channel-message", data: event.data });
    });
  }

  private detachDataChannel(): void {
    if (this.dataChannel !== undefined) {
      this.dataChannel.close();
      this.dataChannel = undefined;
    }
  }

  private handleConnectionState(): void {
    const state = this.peerConnection.connectionState;
    this.options.onEvent({ type: "connection-state", state });
    if (state === "failed") {
      this.options.onEvent({ type: "failed", message: "The direct browser connection was lost." });
    }
  }

  private handleIceConnectionState(): void {
    const state = this.peerConnection.iceConnectionState;
    this.options.onEvent({ type: "connection-state", state });
    if (state === "failed") {
      this.options.onEvent({
        type: "failed",
        message: "The browser transfer could not connect directly.",
      });
    }
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("WebRTC peer is closed.");
    }
  }
}
