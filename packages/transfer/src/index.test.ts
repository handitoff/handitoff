import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserTransferController,
  DEFAULT_CHUNK_SIZE_BYTES,
  DEFAULT_MAX_HASHABLE_FILE_BYTES,
  FileTransferError,
  calculateChunkCount,
  calculateOverallProgress,
  calculateProgress,
  getChunkRange,
  isRetryableFileIssue,
  normalizeFileMetadata,
  validateFilesForTransfer,
  waitForBackpressure,
  type TransferDataChannel,
  type TransferProgressSnapshot,
} from "./index.js";

class FakeChannel implements TransferDataChannel {
  public bufferedAmount = 0;
  public bufferedAmountLowThreshold = 0;
  public readonly sent: Array<string | ArrayBuffer | ArrayBufferView<ArrayBufferLike>> = [];
  private peer: FakeChannel | undefined;
  private readonly listeners = new Set<() => void>();

  public connect(peer: FakeChannel): void {
    this.peer = peer;
  }

  public send(data: string | ArrayBuffer | ArrayBufferView<ArrayBufferLike>): void {
    this.sent.push(data);
    this.peer?.onData?.(data);
  }

  public onData:
    | ((data: string | ArrayBuffer | ArrayBufferView<ArrayBufferLike>) => void)
    | undefined;

  public addEventListener(type: "bufferedamountlow", listener: () => void): void {
    if (type === "bufferedamountlow") {
      this.listeners.add(listener);
    }
  }

  public removeEventListener(type: "bufferedamountlow", listener: () => void): void {
    if (type === "bufferedamountlow") {
      this.listeners.delete(listener);
    }
  }

  public drainTo(amount: number): void {
    this.bufferedAmount = amount;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

describe("@handitoff/transfer", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", crypto);
  });

  it("normalizes metadata without leaking paths", () => {
    const metadata = normalizeFileMetadata({
      name: "C:\\Users\\me\\photo.png",
      size: 12,
      type: "",
      lastModified: 1,
    } as File);

    expect(metadata.name).toBe("photo.png");
    expect(metadata.mimeType).toBe("application/octet-stream");
    expect(metadata.size).toBe(12);
  });

  it("calculates chunk ranges and progress", () => {
    expect(DEFAULT_CHUNK_SIZE_BYTES).toBe(128 * 1024);
    expect(DEFAULT_MAX_HASHABLE_FILE_BYTES).toBe(1 * 1024 * 1024 * 1024);
    expect(calculateChunkCount(0)).toBe(1);
    expect(calculateChunkCount(DEFAULT_CHUNK_SIZE_BYTES + 1)).toBe(2);
    expect(getChunkRange(10, 1, 6)).toEqual({ offset: 6, end: 10, size: 4 });
    expect(calculateProgress(5, 10)).toBe(0.5);
    expect(
      calculateOverallProgress([
        { bytesTransferred: 5, totalBytes: 10 },
        { bytesTransferred: 10, totalBytes: 10 },
      ]),
    ).toBe(0.75);
  });

  it("validates file size before transfer state or offers are created", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const channel = new FakeChannel();
    const sender = new BrowserTransferController({ channel, key });
    const file = new File(["too-large"], "video.mp4");

    expect(() => validateFilesForTransfer([file], { maxFileSizeBytes: 1 })).toThrow(
      FileTransferError,
    );
    expect(() => sender.sendFiles([file], { maxHashableFileBytes: 1 })).toThrow(FileTransferError);
    expect(channel.sent).toHaveLength(0);
    await expect(sender.retryTransfer("transfer-missing")).rejects.toThrow(
      "Only failed outgoing transfers can be retried.",
    );
  });

  it("validates guest file count and total transfer size", () => {
    const files = Array.from(
      { length: 26 },
      (_, index) => ({ name: `${index}.txt`, size: 1, type: "text/plain" }) as File,
    );

    expect(() => validateFilesForTransfer(files, { maxFilesPerTransfer: 25 })).toThrow(
      FileTransferError,
    );
    expect(() =>
      validateFilesForTransfer(
        [
          { name: "a.bin", size: 6, type: "application/octet-stream" } as File,
          { name: "b.bin", size: 5, type: "application/octet-stream" } as File,
        ],
        { maxTotalTransferSizeBytes: 10 },
      ),
    ).toThrow(FileTransferError);
  });

  it("separates retryable transfer issues from local validation issues", () => {
    expect(isRetryableFileIssue("file_too_large")).toBe(false);
    expect(isRetryableFileIssue("too_many_files")).toBe(false);
    expect(isRetryableFileIssue("transfer_too_large")).toBe(false);
    expect(isRetryableFileIssue("unsupported_file")).toBe(false);
    expect(isRetryableFileIssue("browser_limit")).toBe(false);
    expect(isRetryableFileIssue("connection_lost")).toBe(true);
    expect(isRetryableFileIssue("peer_disconnected")).toBe(true);
    expect(isRetryableFileIssue("transfer_failed")).toBe(true);
  });

  it("waits for DataChannel backpressure to drain", async () => {
    const channel = new FakeChannel();
    channel.bufferedAmount = 20;
    const wait = waitForBackpressure(channel, {
      lowThresholdBytes: 4,
      pauseThresholdBytes: 8,
      pollIntervalMs: 1000,
    });

    await Promise.resolve();
    expect(channel.bufferedAmountLowThreshold).toBe(4);
    channel.drainTo(2);
    await expect(wait).resolves.toBeUndefined();
  });

  it("sends encrypted chunks and reconstructs received files", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const senderChannel = new FakeChannel();
    const receiverChannel = new FakeChannel();
    senderChannel.connect(receiverChannel);
    receiverChannel.connect(senderChannel);

    const receiverSnapshots: TransferProgressSnapshot[] = [];
    const senderSnapshots: TransferProgressSnapshot[] = [];
    const sender = new BrowserTransferController({
      channel: senderChannel,
      key,
      events: { onProgress: (snapshot) => senderSnapshots.push(snapshot) },
    });
    const receiver = new BrowserTransferController({
      channel: receiverChannel,
      key,
      createObjectUrl: () => "blob:test",
      events: { onProgress: (snapshot) => receiverSnapshots.push(snapshot) },
    });
    receiverChannel.onData = (data) => void receiver.handleData(data);
    senderChannel.onData = (data) => void sender.handleData(data);

    const files = [
      new File(["hello transfer"], "hello.txt", { type: "text/plain" }),
      new File(["second file"], "second.txt", { type: "text/plain" }),
    ];
    sender.sendFiles(files, { chunkSizeBytes: 5 });

    await vi.waitFor(() => {
      expect(receiverSnapshots.filter((snapshot) => snapshot.status === "complete")).toHaveLength(
        2,
      );
    });

    expect(senderChannel.sent.some((item) => item instanceof ArrayBuffer)).toBe(true);
    expect(senderSnapshots.some((snapshot) => snapshot.status === "complete")).toBe(true);
    const complete = receiverSnapshots.find((snapshot) => snapshot.status === "complete");
    expect(complete?.downloadUrl).toBe("blob:test");
  });

  it("does not reread the whole source file after chunked sending", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const senderChannel = new FakeChannel();
    const receiverChannel = new FakeChannel();
    senderChannel.connect(receiverChannel);
    receiverChannel.connect(senderChannel);

    const sender = new BrowserTransferController({ channel: senderChannel, key });
    const receiver = new BrowserTransferController({
      channel: receiverChannel,
      key,
      createObjectUrl: () => "blob:test",
    });
    receiverChannel.onData = (data) => void receiver.handleData(data);
    senderChannel.onData = (data) => void sender.handleData(data);

    const file = new File(["large enough for several chunks"], "video.mov");
    const wholeFileRead = vi.spyOn(file, "arrayBuffer");

    sender.sendFiles([file], { chunkSizeBytes: 5 });

    await vi.waitFor(() => {
      expect(
        senderChannel.sent.some(
          (item) => typeof item === "string" && item.includes("file:complete"),
        ),
      ).toBe(true);
    });

    expect(wholeFileRead).not.toHaveBeenCalled();
  });

  it("lets receivers reject offers cleanly", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const channel = new FakeChannel();
    const receiver = new BrowserTransferController({
      channel,
      key,
      events: { onOffer: () => false },
    });

    await receiver.handleData(
      JSON.stringify({
        type: "file:offer",
        transferId: "transfer-1",
        files: [{ fileId: "file-1", name: "a.txt", size: 1, mimeType: "text/plain" }],
        totalSize: 1,
      }),
    );

    expect(JSON.parse(channel.sent[0] as string)).toMatchObject({
      type: "file:reject",
      transferId: "transfer-1",
    });
  });

  it("rejects invalid metadata, malformed binary, and out-of-order chunks", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const channel = new FakeChannel();
    const receiver = new BrowserTransferController({ channel, key });

    await expect(
      receiver.handleData(JSON.stringify({ type: "file:offer", transferId: "bad", files: [] })),
    ).rejects.toThrow("totalSize");

    await expect(receiver.handleData(new ArrayBuffer(1))).rejects.toThrow("without a chunk header");

    await receiver.handleData(
      JSON.stringify({
        type: "file:offer",
        transferId: "transfer-1",
        files: [{ fileId: "file-1", name: "a.txt", size: 1, mimeType: "text/plain" }],
        totalSize: 1,
      }),
    );

    await expect(
      receiver.handleData(
        JSON.stringify({
          type: "file:chunk",
          transferId: "transfer-1",
          fileId: "file-1",
          chunkIndex: 1,
          offset: 0,
          plaintextSize: 1,
          encryptedSize: 17,
          iv: "AAAAAAAAAAAAAAAA",
        }),
      ),
    ).rejects.toThrow("out of order");
  });

  it("emits a file-level error when incoming chunks cannot be processed", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const channel = new FakeChannel();
    const errors: TransferProgressSnapshot[] = [];
    const receiver = new BrowserTransferController({
      channel,
      key,
      events: { onError: (snapshot) => errors.push(snapshot) },
    });

    await receiver.handleData(
      JSON.stringify({
        type: "file:offer",
        transferId: "transfer-1",
        files: [{ fileId: "file-1", name: "a.txt", size: 1, mimeType: "text/plain" }],
        totalSize: 1,
      }),
    );
    await receiver.handleData(
      JSON.stringify({
        type: "file:chunk",
        transferId: "transfer-1",
        fileId: "file-1",
        chunkIndex: 0,
        offset: 0,
        plaintextSize: 1,
        encryptedSize: 17,
        iv: "AAAAAAAAAAAAAAAA",
      }),
    );

    await expect(receiver.handleData(new ArrayBuffer(1))).rejects.toThrow(
      "Encrypted chunk size does not match its header.",
    );
    expect(errors[errors.length - 1]).toMatchObject({
      transferId: "transfer-1",
      fileId: "file-1",
      direction: "incoming",
      status: "failed",
      name: "a.txt",
      error: "Encrypted chunk size does not match its header.",
    });
  });

  it("does not create a synthetic file row for malformed transfer messages", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const channel = new FakeChannel();
    const errors: TransferProgressSnapshot[] = [];
    const receiver = new BrowserTransferController({
      channel,
      key,
      events: { onError: (snapshot) => errors.push(snapshot) },
    });

    await expect(
      receiver.handleData(JSON.stringify({ type: "file:offer", transferId: "bad", files: [] })),
    ).rejects.toThrow("totalSize");
    expect(errors).toHaveLength(0);
  });

  it("applies peer transfer errors to existing incoming file rows", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const channel = new FakeChannel();
    const errors: TransferProgressSnapshot[] = [];
    const receiver = new BrowserTransferController({
      channel,
      key,
      events: { onError: (snapshot) => errors.push(snapshot) },
    });

    await receiver.handleData(
      JSON.stringify({
        type: "file:offer",
        transferId: "transfer-1",
        files: [{ fileId: "file-1", name: "a.txt", size: 1, mimeType: "text/plain" }],
        totalSize: 1,
      }),
    );
    await receiver.handleData(
      JSON.stringify({
        type: "transfer:error",
        transferId: "transfer-1",
        code: "transfer_failed",
        message: "Sender lost the data channel.",
      }),
    );

    expect(errors[errors.length - 1]).toMatchObject({
      transferId: "transfer-1",
      fileId: "file-1",
      direction: "incoming",
      status: "failed",
      name: "a.txt",
      error: "Sender lost the data channel.",
    });
  });

  it("does not send oversized outgoing files to the peer", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const senderChannel = new FakeChannel();
    const receiverChannel = new FakeChannel();
    senderChannel.connect(receiverChannel);
    receiverChannel.connect(senderChannel);
    const sender = new BrowserTransferController({
      channel: senderChannel,
      key,
    });
    const receiver = new BrowserTransferController({ channel: receiverChannel, key });
    receiverChannel.onData = (data) => void receiver.handleData(data);
    senderChannel.onData = (data) => void sender.handleData(data);

    expect(() =>
      sender.sendFiles([new File(["too-large"], "video.mp4")], { maxHashableFileBytes: 1 }),
    ).toThrow(FileTransferError);
    expect(senderChannel.sent).toHaveLength(0);
  });

  it("cancels before encrypted sending continues", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const senderChannel = new FakeChannel();
    const receiverChannel = new FakeChannel();
    senderChannel.connect(receiverChannel);
    receiverChannel.connect(senderChannel);
    const errors: TransferProgressSnapshot[] = [];
    const sender = new BrowserTransferController({
      channel: senderChannel,
      key,
      events: { onError: (snapshot) => errors.push(snapshot) },
    });
    const receiver = new BrowserTransferController({ channel: receiverChannel, key });
    receiverChannel.onData = (data) => void receiver.handleData(data);
    senderChannel.onData = (data) => void sender.handleData(data);
    const abortController = new AbortController();
    abortController.abort();

    sender.sendFiles([new File(["stop"], "stop.txt")], { signal: abortController.signal });

    await vi.waitFor(() => {
      expect(errors.some((snapshot) => snapshot.status === "failed")).toBe(true);
    });
  });

  it("fails integrity verification with the wrong key", async () => {
    const senderKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const receiverKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const senderChannel = new FakeChannel();
    const receiverChannel = new FakeChannel();
    senderChannel.connect(receiverChannel);
    receiverChannel.connect(senderChannel);
    const errors: string[] = [];
    const sender = new BrowserTransferController({ channel: senderChannel, key: senderKey });
    const receiver = new BrowserTransferController({
      channel: receiverChannel,
      key: receiverKey,
      events: { onError: (snapshot) => errors.push(snapshot.error ?? "") },
    });
    receiverChannel.onData = (data) =>
      void receiver.handleData(data).catch((error: unknown) => {
        errors.push(error instanceof Error ? error.message : "failed");
      });
    senderChannel.onData = (data) => void sender.handleData(data);

    sender.sendFiles([new File(["secret"], "secret.txt")], { chunkSizeBytes: 3 });

    await vi.waitFor(() => {
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
