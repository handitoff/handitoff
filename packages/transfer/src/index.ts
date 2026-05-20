import {
  base64urlDecode,
  base64urlEncode,
  decryptAesGcm,
  encryptAesGcm,
  generateAesGcmIv,
  sha256,
} from "@handitoff/crypto";
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES as CONFIG_DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES,
} from "@handitoff/config";
import {
  validateTransferMessage,
  type FileCancelMessage,
  type FileChunkHeaderMessage,
  type FileCompleteMessage,
  type FileOfferItem,
  type FileOfferMessage,
  type TransferMessage,
} from "@handitoff/protocol";

export const DEFAULT_CHUNK_SIZE_BYTES = 128 * 1024;
export const DEFAULT_BUFFERED_AMOUNT_LOW_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const DEFAULT_BUFFERED_AMOUNT_PAUSE_THRESHOLD_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAX_HASHABLE_FILE_BYTES = DEFAULT_MAX_FILE_SIZE_BYTES;
export const DEFAULT_MAX_FILES_PER_TRANSFER = 25;
export const DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES = CONFIG_DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES;

export type FileIssue =
  | "file_too_large"
  | "too_many_files"
  | "transfer_too_large"
  | "unsupported_file"
  | "browser_limit"
  | "connection_lost"
  | "peer_disconnected"
  | "transfer_failed"
  | "cancelled"
  | "unknown";

export const RETRYABLE_FILE_ISSUES = [
  "connection_lost",
  "peer_disconnected",
  "transfer_failed",
  "unknown",
] as const satisfies readonly FileIssue[];

export function isRetryableFileIssue(issue: FileIssue): boolean {
  return RETRYABLE_FILE_ISSUES.includes(issue as (typeof RETRYABLE_FILE_ISSUES)[number]);
}

export class FileTransferError extends Error {
  public readonly issue: FileIssue;
  public readonly retryable: boolean;
  public readonly file?: Pick<File, "name" | "size" | "type">;

  public constructor(
    issue: FileIssue,
    message: string,
    options: { retryable?: boolean; file?: Pick<File, "name" | "size" | "type"> } = {},
  ) {
    super(message);
    this.name = "FileTransferError";
    this.issue = issue;
    this.retryable = options.retryable ?? isRetryableFileIssue(issue);
    if (options.file !== undefined) {
      this.file = options.file;
    }
  }
}

export type TransferDataChannel = {
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  send(data: string | ArrayBuffer | ArrayBufferView<ArrayBufferLike>): void;
  addEventListener(type: "bufferedamountlow", listener: () => void): void;
  removeEventListener(type: "bufferedamountlow", listener: () => void): void;
};

export type BackpressureOptions = {
  lowThresholdBytes?: number;
  pauseThresholdBytes?: number;
  pollIntervalMs?: number;
};

export type TransferFileStatus =
  | "offered"
  | "accepted"
  | "transferring"
  | "complete"
  | "rejected"
  | "canceled"
  | "failed";

export type TransferProgressSnapshot = {
  transferId: string;
  fileId?: string;
  direction: "incoming" | "outgoing";
  status: TransferFileStatus;
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
  name?: string;
  error?: string;
  issue?: FileIssue;
  retryable?: boolean;
  blob?: Blob;
  downloadUrl?: string;
};

export type TransferEvents = {
  onOffer?: (offer: FileOfferMessage) => boolean | Promise<boolean>;
  onProgress?: (snapshot: TransferProgressSnapshot) => void;
  onComplete?: (snapshot: TransferProgressSnapshot & { blob?: Blob; downloadUrl?: string }) => void;
  onError?: (snapshot: TransferProgressSnapshot) => void;
};

export type SendFilesOptions = {
  transferId?: string;
  chunkSizeBytes?: number;
  maxHashableFileBytes?: number;
  maxFilesPerTransfer?: number;
  maxTotalTransferSizeBytes?: number;
  signal?: AbortSignal;
};

export type TransferControllerOptions = {
  channel: TransferDataChannel;
  key: CryptoKey;
  events?: TransferEvents;
  backpressure?: BackpressureOptions;
  createObjectUrl?: (blob: Blob) => string;
  maxFilesPerTransfer?: number;
  maxFileSizeBytes?: number;
  maxTotalTransferSizeBytes?: number;
};

type OutgoingTransfer = {
  transferId: string;
  files: File[];
  metadata: FileOfferItem[];
  accepted: boolean;
  started: boolean;
  canceled: boolean;
  chunkSizeBytes: number;
  maxHashableFileBytes: number;
  signal?: AbortSignal;
};

type IncomingFile = {
  metadata: FileOfferItem;
  expectedChunkIndex: number;
  receivedBytes: number;
  chunks: ArrayBuffer[];
  pendingHeader?: FileChunkHeaderMessage;
  status: TransferFileStatus;
};

type IncomingTransfer = {
  transferId: string;
  files: Map<string, IncomingFile>;
  totalSize: number;
  accepted: boolean;
  canceled: boolean;
};

export function createTransferId(): string {
  return createId("transfer");
}

export function createFileId(): string {
  return createId("file");
}

export function normalizeFileMetadata(
  file: Pick<File, "name" | "size" | "type" | "lastModified">,
): FileOfferItem {
  return {
    fileId: createFileId(),
    name: normalizeFileName(file.name),
    size: file.size,
    mimeType: file.type.trim() === "" ? "application/octet-stream" : file.type,
    lastModified: file.lastModified,
  };
}

export function createFileOffer(files: File[], transferId = createTransferId()): FileOfferMessage {
  const items = files.map((file) => normalizeFileMetadata(file));
  return {
    type: "file:offer",
    transferId,
    files: items,
    totalSize: items.reduce((total, file) => total + file.size, 0),
  };
}

export function validateFilesForTransfer(
  files: File[],
  options: {
    maxFileSizeBytes?: number;
    maxFilesPerTransfer?: number;
    maxTotalTransferSizeBytes?: number;
  } = {},
): void {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_HASHABLE_FILE_BYTES;
  const maxFilesPerTransfer = options.maxFilesPerTransfer ?? DEFAULT_MAX_FILES_PER_TRANSFER;
  const maxTotalTransferSizeBytes =
    options.maxTotalTransferSizeBytes ?? DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES;

  if (files.length > maxFilesPerTransfer) {
    throw new FileTransferError(
      "too_many_files",
      `This transfer has too many files. Choose ${maxFilesPerTransfer} files or fewer.`,
      { retryable: false },
    );
  }

  const totalSize = files.reduce((total, file) => total + file.size, 0);
  if (totalSize > maxTotalTransferSizeBytes) {
    throw new FileTransferError(
      "transfer_too_large",
      `This transfer is too large for the current limit. Choose files totaling less than ${formatFileSize(
        maxTotalTransferSizeBytes,
      )}.`,
      { retryable: false },
    );
  }

  for (const file of files) {
    if (file.size > maxFileSizeBytes) {
      throw new FileTransferError(
        "file_too_large",
        `This file is too large for the current limit. Remove it or choose a file smaller than ${formatFileSize(
          maxFileSizeBytes,
        )}.`,
        { retryable: false, file },
      );
    }
  }
}

function validateFileOfferForTransfer(
  offer: FileOfferMessage,
  options: {
    maxFileSizeBytes?: number;
    maxFilesPerTransfer?: number;
    maxTotalTransferSizeBytes?: number;
  } = {},
): void {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_HASHABLE_FILE_BYTES;
  const maxFilesPerTransfer = options.maxFilesPerTransfer ?? DEFAULT_MAX_FILES_PER_TRANSFER;
  const maxTotalTransferSizeBytes =
    options.maxTotalTransferSizeBytes ?? DEFAULT_MAX_TOTAL_TRANSFER_SIZE_BYTES;

  if (offer.files.length > maxFilesPerTransfer) {
    throw new FileTransferError(
      "too_many_files",
      `This transfer has too many files. Ask the sender to choose ${maxFilesPerTransfer} files or fewer.`,
      { retryable: false },
    );
  }

  if (offer.totalSize > maxTotalTransferSizeBytes) {
    throw new FileTransferError(
      "transfer_too_large",
      `This transfer is too large for the current limit. Ask the sender to choose files totaling less than ${formatFileSize(
        maxTotalTransferSizeBytes,
      )}.`,
      { retryable: false },
    );
  }

  for (const file of offer.files) {
    if (file.size > maxFileSizeBytes) {
      throw new FileTransferError(
        "file_too_large",
        `This file is too large for the current limit. Ask the sender to choose a file smaller than ${formatFileSize(
          maxFileSizeBytes,
        )}.`,
        { retryable: false },
      );
    }
  }
}

export function calculateChunkCount(
  fileSize: number,
  chunkSize = DEFAULT_CHUNK_SIZE_BYTES,
): number {
  assertPositiveChunkSize(chunkSize);
  return fileSize === 0 ? 1 : Math.ceil(fileSize / chunkSize);
}

export function getChunkRange(
  fileSize: number,
  chunkIndex: number,
  chunkSize = DEFAULT_CHUNK_SIZE_BYTES,
): { offset: number; end: number; size: number } {
  assertPositiveChunkSize(chunkSize);
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error("Chunk index must be a non-negative safe integer.");
  }
  const offset = chunkIndex * chunkSize;
  if (offset > fileSize || (fileSize === 0 && chunkIndex > 0)) {
    throw new Error("Chunk index is outside the file.");
  }
  const end = fileSize === 0 ? 0 : Math.min(offset + chunkSize, fileSize);
  return { offset, end, size: end - offset };
}

export function calculateProgress(bytesTransferred: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, bytesTransferred / totalBytes));
}

export function calculateOverallProgress(
  items: Array<{ bytesTransferred: number; totalBytes: number }>,
): number {
  const total = items.reduce((sum, item) => sum + item.totalBytes, 0);
  const transferred = items.reduce(
    (sum, item) => sum + Math.min(item.bytesTransferred, item.totalBytes),
    0,
  );
  return calculateProgress(transferred, total);
}

export async function waitForBackpressure(
  channel: TransferDataChannel,
  options: BackpressureOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  const lowThreshold = options.lowThresholdBytes ?? DEFAULT_BUFFERED_AMOUNT_LOW_THRESHOLD_BYTES;
  const pauseThreshold =
    options.pauseThresholdBytes ?? DEFAULT_BUFFERED_AMOUNT_PAUSE_THRESHOLD_BYTES;
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  channel.bufferedAmountLowThreshold = lowThreshold;

  while (channel.bufferedAmount > pauseThreshold) {
    throwIfAborted(signal);
    await new Promise<void>((resolve, reject) => {
      function cleanup() {
        globalThis.clearTimeout(timeout);
        channel.removeEventListener("bufferedamountlow", onLow);
        signal?.removeEventListener("abort", onAbort);
      }
      const done = () => {
        cleanup();
        resolve();
      };
      const onLow = () => done();
      const onAbort = () => {
        cleanup();
        reject(new DOMException("Transfer canceled.", "AbortError"));
      };
      const timeout = globalThis.setTimeout(done, pollIntervalMs);
      channel.addEventListener("bufferedamountlow", onLow);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

export class BrowserTransferController {
  private readonly outgoing = new Map<string, OutgoingTransfer>();
  private readonly incoming = new Map<string, IncomingTransfer>();
  private incomingQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly options: TransferControllerOptions) {}

  public sendFiles(files: File[], options: SendFilesOptions = {}): string {
    if (files.length === 0) {
      throw new Error("At least one file is required.");
    }
    const maxHashableFileBytes = options.maxHashableFileBytes ?? DEFAULT_MAX_HASHABLE_FILE_BYTES;
    const maxFilesPerTransfer = options.maxFilesPerTransfer ?? this.options.maxFilesPerTransfer;
    const maxTotalTransferSizeBytes =
      options.maxTotalTransferSizeBytes ?? this.options.maxTotalTransferSizeBytes;
    validateFilesForTransfer(files, {
      maxFileSizeBytes: maxHashableFileBytes,
      ...(maxFilesPerTransfer === undefined ? {} : { maxFilesPerTransfer }),
      ...(maxTotalTransferSizeBytes === undefined ? {} : { maxTotalTransferSizeBytes }),
    });
    const transferId = options.transferId ?? createTransferId();
    const metadata = files.map((file) => normalizeFileMetadata(file));
    const totalSize = metadata.reduce((total, file) => total + file.size, 0);
    const outgoing: OutgoingTransfer = {
      transferId,
      files,
      metadata,
      accepted: false,
      started: false,
      canceled: false,
      chunkSizeBytes: options.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES,
      maxHashableFileBytes,
    };
    if (options.signal !== undefined) {
      outgoing.signal = options.signal;
    }
    this.outgoing.set(transferId, outgoing);
    this.sendJson({ type: "file:offer", transferId, files: metadata, totalSize });
    for (const file of metadata) {
      this.emitProgress({
        transferId,
        fileId: file.fileId,
        direction: "outgoing",
        status: "offered",
        bytesTransferred: 0,
        totalBytes: file.size,
        progress: 0,
        name: file.name,
      });
    }
    return transferId;
  }

  public cancelTransfer(transferId: string, fileId?: string): void {
    const outgoing = this.outgoing.get(transferId);
    if (outgoing !== undefined) {
      outgoing.canceled = true;
    }
    const incoming = this.incoming.get(transferId);
    if (incoming !== undefined) {
      incoming.canceled = true;
    }
    this.sendJson(
      fileId === undefined
        ? { type: "file:cancel", transferId }
        : { type: "file:cancel", transferId, fileId },
    );
  }

  public async retryTransfer(transferId: string): Promise<string> {
    const failed = this.outgoing.get(transferId);
    if (failed === undefined) {
      throw new Error("Only failed outgoing transfers can be retried.");
    }
    return this.sendFiles(failed.files, {
      chunkSizeBytes: failed.chunkSizeBytes,
      maxHashableFileBytes: failed.maxHashableFileBytes,
    });
  }

  public handleData(data: unknown): Promise<void> {
    const next = this.incomingQueue
      .then(() => this.handleDataInOrder(data))
      .catch((error) => {
        this.emitIncomingFailure(error);
        throw error;
      });
    this.incomingQueue = next.catch(() => undefined);
    return next;
  }

  private async handleDataInOrder(data: unknown): Promise<void> {
    if (typeof data === "string") {
      await this.handleTextMessage(data);
      return;
    }
    if (data instanceof ArrayBuffer) {
      await this.handleBinaryMessage(data);
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const copy = new Uint8Array(source.byteLength);
      copy.set(source);
      await this.handleBinaryMessage(copy.buffer);
      return;
    }
    throw new Error("Unsupported DataChannel payload.");
  }

  private async handleTextMessage(data: string): Promise<void> {
    const parsed = JSON.parse(data) as unknown;
    const validation = validateTransferMessage(parsed);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }
    const message = validation.value;
    switch (message.type) {
      case "file:offer":
        await this.handleOffer(message);
        break;
      case "file:accept":
        await this.handleAccept(message.transferId);
        break;
      case "file:reject":
        this.markRejected(message.transferId, message.reason ?? "The receiver rejected the files.");
        break;
      case "file:chunk":
        this.handleChunkHeader(message);
        break;
      case "file:complete":
        await this.handleComplete(message);
        break;
      case "file:cancel":
        this.handleCancel(message);
        break;
      case "transfer:error":
        this.emitPeerTransferError(message.transferId, message.code, message.message, message.fileId);
        break;
    }
  }

  private async handleOffer(message: FileOfferMessage): Promise<void> {
    try {
      validateFileOfferForTransfer(message, {
        ...(this.options.maxFileSizeBytes === undefined
          ? {}
          : { maxFileSizeBytes: this.options.maxFileSizeBytes }),
        ...(this.options.maxFilesPerTransfer === undefined
          ? {}
          : { maxFilesPerTransfer: this.options.maxFilesPerTransfer }),
        ...(this.options.maxTotalTransferSizeBytes === undefined
          ? {}
          : { maxTotalTransferSizeBytes: this.options.maxTotalTransferSizeBytes }),
      });
    } catch (error) {
      const normalized = toFileTransferError(error);
      this.sendJson({
        type: "file:reject",
        transferId: message.transferId,
        reason: normalized.message,
      });
      this.options.events?.onError?.({
        transferId: message.transferId,
        direction: "incoming",
        status: "failed",
        bytesTransferred: 0,
        totalBytes: message.totalSize,
        progress: 0,
        name: "Incoming transfer",
        error: normalized.message,
        issue: normalized.issue,
        retryable: normalized.retryable,
      });
      return;
    }

    const accepted = (await this.options.events?.onOffer?.(message)) ?? true;
    if (!accepted) {
      this.sendJson({ type: "file:reject", transferId: message.transferId, reason: "Rejected." });
      return;
    }
    const transfer: IncomingTransfer = {
      transferId: message.transferId,
      files: new Map(),
      totalSize: message.totalSize,
      accepted: true,
      canceled: false,
    };
    for (const file of message.files) {
      transfer.files.set(file.fileId, {
        metadata: file,
        expectedChunkIndex: 0,
        receivedBytes: 0,
        chunks: [],
        status: "accepted",
      });
      this.emitProgress({
        transferId: message.transferId,
        fileId: file.fileId,
        direction: "incoming",
        status: "accepted",
        bytesTransferred: 0,
        totalBytes: file.size,
        progress: 0,
        name: file.name,
      });
    }
    this.incoming.set(message.transferId, transfer);
    this.sendJson({ type: "file:accept", transferId: message.transferId });
  }

  private async handleAccept(transferId: string): Promise<void> {
    const transfer = this.outgoing.get(transferId);
    if (transfer === undefined || transfer.started) {
      return;
    }
    transfer.accepted = true;
    transfer.started = true;
    for (const [index, file] of transfer.files.entries()) {
      const metadata = transfer.metadata[index];
      if (metadata === undefined) {
        this.emitOutgoingFileError(
          transfer,
          undefined,
          new FileTransferError("transfer_failed", "File metadata is missing."),
        );
        continue;
      }
      try {
        await this.sendOneFile(transfer, file, metadata);
      } catch (error) {
        const normalized = toFileTransferError(error);
        try {
          this.sendJson({
            type: "transfer:error",
            transferId,
            fileId: metadata.fileId,
            code: normalized.issue,
            message: normalized.message,
          });
        } catch {
          // The local UI still needs the original transfer failure even if the peer channel is gone.
        }
        this.emitOutgoingFileError(transfer, metadata, normalized);
      }
    }
  }

  private async sendOneFile(
    transfer: OutgoingTransfer,
    file: File,
    metadata: FileOfferItem,
  ): Promise<void> {
    if (file.size > transfer.maxHashableFileBytes) {
      throw new FileTransferError(
        "file_too_large",
        `This file is too large for the current limit. Remove it or choose a file smaller than ${formatFileSize(
          transfer.maxHashableFileBytes,
        )}.`,
        { retryable: false, file },
      );
    }
    const chunkCount = calculateChunkCount(file.size, transfer.chunkSizeBytes);
    let bytesSent = 0;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      throwIfAborted(transfer.signal);
      if (transfer.canceled) {
        throw new FileTransferError("cancelled", "Transfer cancelled.", { retryable: false, file });
      }
      const range = getChunkRange(file.size, chunkIndex, transfer.chunkSizeBytes);
      const plaintext = await file.slice(range.offset, range.end).arrayBuffer();
      const iv = generateAesGcmIv();
      const encrypted = await encryptAesGcm(this.options.key, plaintext, iv);
      const header: FileChunkHeaderMessage = {
        type: "file:chunk",
        transferId: transfer.transferId,
        fileId: metadata.fileId,
        chunkIndex,
        offset: range.offset,
        plaintextSize: plaintext.byteLength,
        encryptedSize: encrypted.byteLength,
        iv: base64urlEncode(iv),
      };
      this.sendJson(header);
      this.sendChannelData(
        encrypted,
        `The browser data channel closed while sending ${metadata.name}. The paired device may have gone offline, locked, or changed networks.`,
      );
      bytesSent += plaintext.byteLength;
      this.emitProgress({
        transferId: transfer.transferId,
        fileId: metadata.fileId,
        direction: "outgoing",
        status: "transferring",
        bytesTransferred: bytesSent,
        totalBytes: metadata.size,
        progress: calculateProgress(bytesSent, metadata.size),
        name: metadata.name,
      });
      await waitForBackpressure(this.options.channel, this.options.backpressure, transfer.signal);
    }
    const digest = base64urlEncode(await sha256(await file.arrayBuffer()));
    this.sendJson({
      type: "file:complete",
      transferId: transfer.transferId,
      fileId: metadata.fileId,
      sha256: digest,
    });
    this.emitComplete({
      transferId: transfer.transferId,
      fileId: metadata.fileId,
      direction: "outgoing",
      status: "complete",
      bytesTransferred: metadata.size,
      totalBytes: metadata.size,
      progress: 1,
      name: metadata.name,
    });
  }

  private handleChunkHeader(message: FileChunkHeaderMessage): void {
    const transfer = this.incoming.get(message.transferId);
    const incoming = transfer?.files.get(message.fileId);
    if (transfer === undefined || incoming === undefined || transfer.canceled) {
      throw new Error("Received chunk for an unknown or canceled transfer.");
    }
    if (message.chunkIndex !== incoming.expectedChunkIndex) {
      throw new Error("Received file chunks out of order.");
    }
    if (message.offset !== incoming.receivedBytes) {
      throw new Error("Received file chunk at the wrong offset.");
    }
    incoming.pendingHeader = message;
  }

  private async handleBinaryMessage(data: ArrayBuffer): Promise<void> {
    const pending = findPendingIncomingFile(this.incoming);
    if (pending === undefined) {
      throw new Error("Received binary data without a chunk header.");
    }
    const { transfer, file } = pending;
    const header = file.pendingHeader;
    if (header === undefined) {
      throw new Error("Received binary data without a chunk header.");
    }
    if (data.byteLength !== header.encryptedSize) {
      throw new Error("Encrypted chunk size does not match its header.");
    }
    const plaintext = await decryptAesGcm(this.options.key, data, base64urlDecode(header.iv));
    if (plaintext.byteLength !== header.plaintextSize) {
      throw new Error("Plaintext chunk size does not match its header.");
    }
    delete file.pendingHeader;
    file.expectedChunkIndex += 1;
    file.receivedBytes += plaintext.byteLength;
    file.status = "transferring";
    file.chunks.push(plaintext);
    this.emitProgress({
      transferId: transfer.transferId,
      fileId: file.metadata.fileId,
      direction: "incoming",
      status: "transferring",
      bytesTransferred: file.receivedBytes,
      totalBytes: file.metadata.size,
      progress: calculateProgress(file.receivedBytes, file.metadata.size),
      name: file.metadata.name,
    });
  }

  private async handleComplete(message: FileCompleteMessage): Promise<void> {
    const transfer = this.incoming.get(message.transferId);
    const file = transfer?.files.get(message.fileId);
    if (transfer === undefined || file === undefined) {
      throw new Error("Received completion for an unknown file.");
    }
    if (file.receivedBytes !== file.metadata.size) {
      throw new Error("Received file completed before all bytes arrived.");
    }
    const blob = new Blob(file.chunks, { type: file.metadata.mimeType });
    const digest = base64urlEncode(await sha256(await blob.arrayBuffer()));
    if (digest !== message.sha256) {
      file.status = "failed";
      throw new Error("Received file failed integrity verification.");
    }
    file.status = "complete";
    const downloadUrl = this.options.createObjectUrl?.(blob);
    this.emitComplete({
      transferId: message.transferId,
      fileId: message.fileId,
      direction: "incoming",
      status: "complete",
      bytesTransferred: file.metadata.size,
      totalBytes: file.metadata.size,
      progress: 1,
      name: file.metadata.name,
      blob,
      ...(downloadUrl === undefined ? {} : { downloadUrl }),
    });
  }

  private handleCancel(message: FileCancelMessage): void {
    const outgoing = this.outgoing.get(message.transferId);
    if (outgoing !== undefined) {
      outgoing.canceled = true;
    }
    const incoming = this.incoming.get(message.transferId);
    if (incoming !== undefined) {
      incoming.canceled = true;
    }
    const targetFiles =
      message.fileId === undefined
        ? [
            ...(outgoing?.metadata ?? []),
            ...(incoming === undefined ? [] : Array.from(incoming.files.values()).map((file) => file.metadata)),
          ]
        : [
            outgoing?.metadata.find((file) => file.fileId === message.fileId),
            incoming?.files.get(message.fileId)?.metadata,
          ].filter((file): file is FileOfferItem => file !== undefined);
    for (const file of targetFiles) {
      this.emitProgress({
        transferId: message.transferId,
        fileId: file.fileId,
        direction: incoming === undefined ? "outgoing" : "incoming",
        status: "canceled",
        bytesTransferred: 0,
        totalBytes: file.size,
        progress: 0,
        name: file.name,
        issue: "cancelled",
        retryable: false,
      });
    }
    if (targetFiles.length > 0) {
      return;
    }
    this.emitProgress({
      transferId: message.transferId,
      direction: "incoming",
      status: "canceled",
      bytesTransferred: 0,
      totalBytes: 0,
      progress: 0,
      issue: "cancelled",
      retryable: false,
      ...(message.fileId === undefined ? {} : { fileId: message.fileId }),
    });
  }

  private markRejected(transferId: string, reason: string): void {
    const transfer = this.outgoing.get(transferId);
    for (const file of transfer?.metadata ?? []) {
      this.emitError({
        transferId,
        fileId: file.fileId,
        direction: "outgoing",
        status: "rejected",
        bytesTransferred: 0,
        totalBytes: file.size,
        progress: 0,
        name: file.name,
        error: reason,
        issue: "cancelled",
        retryable: false,
      });
    }
  }

  private sendJson(message: TransferMessage): void {
    this.sendChannelData(
      JSON.stringify(message),
      "The browser data channel closed while sending transfer metadata.",
    );
  }

  private sendChannelData(
    data: string | ArrayBuffer | ArrayBufferView<ArrayBufferLike>,
    failureMessage: string,
  ): void {
    try {
      this.options.channel.send(data);
    } catch (error) {
      if (
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "InvalidStateError"
      ) {
        throw new Error(failureMessage);
      }
      if (error instanceof Error && /closed|closing|not open|invalidstate/i.test(error.message)) {
        throw new Error(failureMessage);
      }
      throw error;
    }
  }

  private emitProgress(snapshot: TransferProgressSnapshot): void {
    this.options.events?.onProgress?.(snapshot);
  }

  private emitComplete(
    snapshot: TransferProgressSnapshot & { blob?: Blob; downloadUrl?: string },
  ): void {
    this.options.events?.onComplete?.(snapshot);
    this.options.events?.onProgress?.(snapshot);
  }

  private emitError(snapshot: TransferProgressSnapshot): void {
    this.options.events?.onError?.(snapshot);
    this.options.events?.onProgress?.(snapshot);
  }

  private emitOutgoingFileError(
    transfer: OutgoingTransfer,
    metadata: FileOfferItem | undefined,
    error: FileTransferError,
  ): void {
    this.emitError({
      transferId: transfer.transferId,
      direction: "outgoing",
      status: "failed",
      bytesTransferred: 0,
      totalBytes: metadata?.size ?? 0,
      progress: 0,
      error: error.message,
      issue: error.issue,
      retryable: error.retryable,
      ...(metadata === undefined
        ? {}
        : {
            fileId: metadata.fileId,
            name: metadata.name,
          }),
    });
  }

  private emitIncomingFailure(error: unknown): void {
    const normalized = toFileTransferError(error);
    const pending = findActiveIncomingFile(this.incoming);
    if (pending === undefined) {
      return;
    }
    const { transfer, file } = pending;
    file.status = "failed";
    this.emitError({
      transferId: transfer.transferId,
      fileId: file.metadata.fileId,
      direction: "incoming",
      status: "failed",
      bytesTransferred: file.receivedBytes,
      totalBytes: file.metadata.size,
      progress: calculateProgress(file.receivedBytes, file.metadata.size),
      name: file.metadata.name,
      error: normalized.message,
      issue: normalized.issue,
      retryable: normalized.retryable,
    });
  }

  private emitPeerTransferError(
    transferId: string,
    code: string,
    message: string,
    fileId?: string,
  ): void {
    const transfer = this.incoming.get(transferId);
    if (transfer === undefined) {
      return;
    }
    const files =
      fileId === undefined
        ? Array.from(transfer.files.values())
        : [transfer.files.get(fileId)].filter((file): file is IncomingFile => file !== undefined);
    for (const file of files) {
      file.status = "failed";
      this.emitError({
        transferId,
        fileId: file.metadata.fileId,
        direction: "incoming",
        status: "failed",
        bytesTransferred: file.receivedBytes,
        totalBytes: file.metadata.size,
        progress: calculateProgress(file.receivedBytes, file.metadata.size),
        name: file.metadata.name,
        error: message,
        issue: normalizeFileIssueCode(code),
        retryable: isRetryableFileIssue(normalizeFileIssueCode(code)),
      });
    }
  }
}

function findPendingIncomingFile(
  transfers: Map<string, IncomingTransfer>,
): { transfer: IncomingTransfer; file: IncomingFile } | undefined {
  for (const transfer of transfers.values()) {
    for (const file of transfer.files.values()) {
      if (file.pendingHeader !== undefined) {
        return { transfer, file };
      }
    }
  }
  return undefined;
}

function findActiveIncomingFile(
  transfers: Map<string, IncomingTransfer>,
): { transfer: IncomingTransfer; file: IncomingFile } | undefined {
  const pending = findPendingIncomingFile(transfers);
  if (pending !== undefined) {
    return pending;
  }
  for (const transfer of transfers.values()) {
    for (const file of transfer.files.values()) {
      if (file.status === "accepted" || file.status === "transferring") {
        return { transfer, file };
      }
    }
  }
  return undefined;
}

function normalizeTransferError(error: unknown): string {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "OperationError"
  ) {
    return "Could not decrypt this file chunk. The secure session keys did not match or the data was corrupted in transit.";
  }
  if (error instanceof Error) {
    if (/without a chunk header/i.test(error.message)) {
      return "Received file data out of sequence. The browser connection delivered an unexpected transfer chunk.";
    }
    if (/out of order|wrong offset/i.test(error.message)) {
      return "Received file chunks out of order. The transfer stream became inconsistent.";
    }
    if (/integrity verification/i.test(error.message)) {
      return "The received file did not pass integrity verification. The file was incomplete or corrupted.";
    }
    if (/completed before all bytes/i.test(error.message)) {
      return "The sender marked the file complete before all bytes arrived.";
    }
    return error.message;
  }
  return "Transfer failed while reading data from the paired browser.";
}

function toFileTransferError(error: unknown): FileTransferError {
  if (error instanceof FileTransferError) {
    return error;
  }
  const message = normalizeTransferError(error);
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return new FileTransferError("cancelled", "Transfer cancelled.", { retryable: false });
  }
  if (/closed|offline|locked|changed networks|connection|data channel/i.test(message)) {
    return new FileTransferError("connection_lost", message);
  }
  if (/peer|paired device/i.test(message)) {
    return new FileTransferError("peer_disconnected", message);
  }
  if (/too large|limit/i.test(message)) {
    return new FileTransferError("file_too_large", message, { retryable: false });
  }
  return new FileTransferError("transfer_failed", message);
}

function normalizeFileIssueCode(codeOrMessage: string): FileIssue {
  if (isFileIssue(codeOrMessage)) {
    return codeOrMessage;
  }
  if (/too large|limit/i.test(codeOrMessage)) {
    return "file_too_large";
  }
  if (/peer|other device|paired device/i.test(codeOrMessage)) {
    return "peer_disconnected";
  }
  if (/closed|offline|locked|network|connection/i.test(codeOrMessage)) {
    return "connection_lost";
  }
  if (/cancel/i.test(codeOrMessage)) {
    return "cancelled";
  }
  return "transfer_failed";
}

function isFileIssue(value: string): value is FileIssue {
  return (
    value === "file_too_large" ||
    value === "unsupported_file" ||
    value === "browser_limit" ||
    value === "connection_lost" ||
    value === "peer_disconnected" ||
    value === "transfer_failed" ||
    value === "cancelled" ||
    value === "unknown"
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function normalizeFileName(name: string): string {
  const trimmed = name.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  return trimmed === "" ? "unnamed-file" : trimmed.slice(0, 255);
}

function createId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${base64urlEncode(bytes)}`;
}

function assertPositiveChunkSize(chunkSize: number): void {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("Chunk size must be a positive safe integer.");
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException("Transfer canceled.", "AbortError");
  }
}
