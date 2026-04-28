import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import type { ServerMessage } from "@handitoff/protocol";

import type { SignalingHub, SignalingSocket } from "./signaling.js";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function handleWebSocketUpgrade(hub: SignalingHub, request: IncomingMessage, socket: Socket): boolean {
  if (request.url !== "/ws") {
    return false;
  }

  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return true;
  }

  const accept = createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"),
  );

  hub.addSocket(new NodeWebSocketConnection(socket));
  return true;
}

class NodeWebSocketConnection implements SignalingSocket {
  public readonly id = globalThis.crypto.randomUUID();
  private messageHandler: ((raw: string) => void) | undefined;
  private closeHandler: (() => void) | undefined;
  private buffer = Buffer.alloc(0);
  private closed = false;

  public constructor(private readonly socket: Socket) {
    socket.on("data", (chunk) => this.read(chunk));
    socket.on("close", () => this.closeHandler?.());
    socket.on("error", () => this.close(1011, "socket_error"));
  }

  public send(message: ServerMessage): void {
    if (this.closed) {
      return;
    }
    this.socket.write(encodeTextFrame(JSON.stringify(message)));
  }

  public close(code = 1000, reason = ""): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.socket.end(encodeCloseFrame(code, reason));
  }

  public onMessage(handler: (raw: string) => void): void {
    this.messageHandler = handler;
  }

  public onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    for (;;) {
      const frame = decodeFrame(this.buffer);
      if (frame === undefined) {
        return;
      }

      this.buffer = this.buffer.subarray(frame.consumed);
      if (frame.opcode === 0x8) {
        this.close();
        return;
      }
      if (frame.opcode === 0x9) {
        this.socket.write(encodeFrame(0xA, frame.payload));
        continue;
      }
      if (frame.opcode === 0x1) {
        this.messageHandler?.(frame.payload.toString("utf8"));
      }
    }
  }
}

type DecodedFrame = {
  opcode: number;
  payload: Buffer;
  consumed: number;
};

function decodeFrame(buffer: Buffer): DecodedFrame | undefined {
  if (buffer.length < 2) {
    return undefined;
  }

  const firstByte = buffer.readUInt8(0);
  const secondByte = buffer.readUInt8(1);
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let length = secondByte & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) {
      return undefined;
    }
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    throw new Error("Large WebSocket frames are not supported.");
  }

  const maskOffset = offset;
  if (masked) {
    offset += 4;
  }
  if (buffer.length < offset + length) {
    return undefined;
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = payload.readUInt8(index) ^ mask.readUInt8(index % 4);
    }
  }

  return {
    opcode,
    payload,
    consumed: offset + length,
  };
}

function encodeTextFrame(value: string): Buffer {
  return encodeFrame(0x1, Buffer.from(value, "utf8"));
}

function encodeCloseFrame(code: number, reason: string): Buffer {
  const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
  payload.writeUInt16BE(code, 0);
  payload.write(reason, 2);
  return encodeFrame(0x8, payload);
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  if (payload.length > 65_535) {
    throw new RangeError("WebSocket payload is too large.");
  }

  const lengthBytes = payload.length < 126 ? 0 : 2;
  const header = Buffer.alloc(2 + lengthBytes);
  header[0] = 0x80 | opcode;
  if (payload.length < 126) {
    header[1] = payload.length;
  } else {
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  }

  return Buffer.concat([header, payload]);
}
