import {
  MessageType,
  ChunkAckStatus,
  ErrorCode,
  CancelReason,
  type FileMetaMessage,
  type ChunkMessage,
  type ChunkAckMessage,
  type VerifyRequestMessage,
  type VerifyResponseMessage,
  type ErrorMessage,
  type CancelMessage,
  type ResumeMessage,
  type ResumeAckMessage,
  type BatchMetaMessage,
  type BatchEndMessage,
  type BatchMetaFileEntry,
  type DataChannelMessage,
} from './protocol.js';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export function encodeMessage(msg: DataChannelMessage): ArrayBuffer {
  switch (msg.type) {
    case MessageType.FILE_META:
      return encodeFileMeta(msg);
    case MessageType.CHUNK:
      return encodeChunk(msg);
    case MessageType.CHUNK_ACK:
      return encodeChunkAck(msg);
    case MessageType.VERIFY_REQUEST:
      return encodeVerifyRequest(msg);
    case MessageType.VERIFY_RESPONSE:
      return encodeVerifyResponse(msg);
    case MessageType.ERROR:
      return encodeError(msg);
    case MessageType.CANCEL:
      return encodeCancel(msg);
    case MessageType.RESUME:
      return encodeResume(msg);
    case MessageType.RESUME_ACK:
      return encodeResumeAck(msg);
    case MessageType.BATCH_META:
      return encodeBatchMeta(msg);
    case MessageType.BATCH_END:
      return encodeBatchEnd(msg);
  }
}

export function decodeMessage(buffer: ArrayBuffer): DataChannelMessage {
  const view = new DataView(buffer);
  if (buffer.byteLength < 5) {
    throw new ProtocolError('Message too short: minimum 5 bytes');
  }

  const type = view.getUint8(0) as MessageType;
  const payloadLength = view.getUint32(1, false);

  if (5 + payloadLength > buffer.byteLength) {
    throw new ProtocolError(
      `Payload length ${payloadLength} exceeds buffer size ${buffer.byteLength - 5}`,
    );
  }

  const payload = new Uint8Array(buffer, 5, payloadLength);

  switch (type) {
    case MessageType.FILE_META:
      return decodeFileMeta(payload);
    case MessageType.CHUNK:
      return decodeChunk(payload);
    case MessageType.CHUNK_ACK:
      return decodeChunkAck(payload);
    case MessageType.VERIFY_REQUEST:
      return decodeVerifyRequest(payload);
    case MessageType.VERIFY_RESPONSE:
      return decodeVerifyResponse(payload);
    case MessageType.ERROR:
      return decodeError(payload);
    case MessageType.CANCEL:
      return decodeCancel(payload);
    case MessageType.RESUME:
      return decodeResume(payload);
    case MessageType.RESUME_ACK:
      return decodeResumeAck(payload);
    case MessageType.BATCH_META:
      return decodeBatchMeta(payload);
    case MessageType.BATCH_END:
      return decodeBatchEnd(payload);
    default:
      throw new ProtocolError(`Unknown message type: ${type}`);
  }
}

function encodeFileMeta(msg: FileMetaMessage): ArrayBuffer {
  const nameBytes = TEXT_ENCODER.encode(msg.fileName);
  const mimeBytes = TEXT_ENCODER.encode(msg.mimeType);

  const totalSize =
    5 + // envelope
    4 + nameBytes.length + // file name length + data
    8 + // file size (uint64)
    2 + mimeBytes.length + // mime type length + data
    32 + // sha256 hash
    4 + // total chunks
    4; // chunk size

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset, MessageType.FILE_META);
  offset += 1;

  const payloadSize = totalSize - 5;
  view.setUint32(offset, payloadSize, false);
  offset += 4;

  view.setUint32(offset, nameBytes.length, false);
  offset += 4;
  new Uint8Array(buf, offset, nameBytes.length).set(nameBytes);
  offset += nameBytes.length;

  view.setBigUint64(offset, msg.fileSize, false);
  offset += 8;

  view.setUint16(offset, mimeBytes.length, false);
  offset += 2;
  new Uint8Array(buf, offset, mimeBytes.length).set(mimeBytes);
  offset += mimeBytes.length;

  new Uint8Array(buf, offset, 32).set(msg.sha256Hash);
  offset += 32;

  view.setUint32(offset, msg.totalChunks, false);
  offset += 4;

  view.setUint32(offset, msg.chunkSize, false);

  return buf;
}

function decodeFileMeta(payload: Uint8Array): FileMetaMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  const nameLen = view.getUint32(offset, false);
  offset += 4;
  const fileName = TEXT_DECODER.decode(payload.slice(offset, offset + nameLen));
  offset += nameLen;

  const fileSize = view.getBigUint64(offset, false);
  offset += 8;

  const mimeLen = view.getUint16(offset, false);
  offset += 2;
  const mimeType = TEXT_DECODER.decode(payload.slice(offset, offset + mimeLen));
  offset += mimeLen;

  const sha256Hash = payload.slice(offset, offset + 32);
  offset += 32;

  const totalChunks = view.getUint32(offset, false);
  offset += 4;

  const chunkSize = view.getUint32(offset, false);

  return {
    type: MessageType.FILE_META,
    fileName,
    fileSize,
    mimeType,
    sha256Hash,
    totalChunks,
    chunkSize,
  };
}

function encodeChunk(msg: ChunkMessage): ArrayBuffer {
  const totalSize = 5 + 4 + 4 + msg.data.length;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.CHUNK);
  view.setUint32(1, 4 + 4 + msg.data.length, false);
  view.setUint32(5, msg.sequence, false);
  view.setUint32(9, msg.data.length, false);
  new Uint8Array(buf, 13).set(msg.data);

  return buf;
}

function decodeChunk(payload: Uint8Array): ChunkMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const sequence = view.getUint32(0, false);
  const dataLen = view.getUint32(4, false);
  const data = payload.slice(8, 8 + dataLen);

  return {
    type: MessageType.CHUNK,
    sequence,
    data,
  };
}

function encodeChunkAck(msg: ChunkAckMessage): ArrayBuffer {
  const totalSize = 5 + 4 + 1;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.CHUNK_ACK);
  view.setUint32(1, 5, false);
  view.setUint32(5, msg.sequence, false);
  view.setUint8(9, msg.status);

  return buf;
}

function decodeChunkAck(payload: Uint8Array): ChunkAckMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    type: MessageType.CHUNK_ACK,
    sequence: view.getUint32(0, false),
    status: view.getUint8(4) as ChunkAckStatus,
  };
}

function encodeVerifyRequest(msg: VerifyRequestMessage): ArrayBuffer {
  const totalSize = 5 + 32;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.VERIFY_REQUEST);
  view.setUint32(1, 32, false);
  new Uint8Array(buf, 5).set(msg.senderHash);

  return buf;
}

function decodeVerifyRequest(payload: Uint8Array): VerifyRequestMessage {
  return {
    type: MessageType.VERIFY_REQUEST,
    senderHash: payload.slice(0, 32),
  };
}

function encodeVerifyResponse(msg: VerifyResponseMessage): ArrayBuffer {
  const hashLen = msg.match ? 0 : 32;
  const totalSize = 5 + 1 + hashLen;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.VERIFY_RESPONSE);
  view.setUint32(1, 1 + hashLen, false);
  view.setUint8(5, msg.match ? 1 : 0);

  if (!msg.match && msg.receiverHash) {
    new Uint8Array(buf, 6).set(msg.receiverHash);
  }

  return buf;
}

function decodeVerifyResponse(payload: Uint8Array): VerifyResponseMessage {
  const match = payload[0] === 1;
  return {
    type: MessageType.VERIFY_RESPONSE,
    match,
    ...(match ? {} : { receiverHash: payload.slice(1, 33) }),
  };
}

function encodeError(msg: ErrorMessage): ArrayBuffer {
  const msgBytes = TEXT_ENCODER.encode(msg.message);
  const totalSize = 5 + 2 + 2 + msgBytes.length;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.ERROR);
  view.setUint32(1, 2 + 2 + msgBytes.length, false);
  view.setUint16(5, msg.code, false);
  view.setUint16(7, msgBytes.length, false);
  new Uint8Array(buf, 9).set(msgBytes);

  return buf;
}

function decodeError(payload: Uint8Array): ErrorMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const code = view.getUint16(0, false) as ErrorCode;
  const msgLen = view.getUint16(2, false);
  const message = TEXT_DECODER.decode(payload.slice(4, 4 + msgLen));

  return { type: MessageType.ERROR, code, message };
}

function encodeCancel(msg: CancelMessage): ArrayBuffer {
  const msgBytes = TEXT_ENCODER.encode(msg.message);
  const totalSize = 5 + 2 + 2 + msgBytes.length;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.CANCEL);
  view.setUint32(1, 2 + 2 + msgBytes.length, false);
  view.setUint16(5, msg.reason, false);
  view.setUint16(7, msgBytes.length, false);
  new Uint8Array(buf, 9).set(msgBytes);

  return buf;
}

function decodeCancel(payload: Uint8Array): CancelMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const reason = view.getUint16(0, false) as CancelReason;
  const msgLen = view.getUint16(2, false);
  const message = TEXT_DECODER.decode(payload.slice(4, 4 + msgLen));

  return { type: MessageType.CANCEL, reason, message };
}

function encodeResume(msg: ResumeMessage): ArrayBuffer {
  const totalSize = 5 + 4;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.RESUME);
  view.setUint32(1, 4, false);
  view.setUint32(5, msg.lastAcknowledgedChunk, false);

  return buf;
}

function decodeResume(payload: Uint8Array): ResumeMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    type: MessageType.RESUME,
    lastAcknowledgedChunk: view.getUint32(0, false),
  };
}

function encodeResumeAck(msg: ResumeAckMessage): ArrayBuffer {
  const totalSize = 5 + 4;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.RESUME_ACK);
  view.setUint32(1, 4, false);
  view.setUint32(5, msg.lastReceivedChunk, false);

  return buf;
}

function decodeResumeAck(payload: Uint8Array): ResumeAckMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    type: MessageType.RESUME_ACK,
    lastReceivedChunk: view.getUint32(0, false),
  };
}

function encodeBatchMeta(msg: BatchMetaMessage): ArrayBuffer {
  let namesSize = 0;
  const nameBytesList = msg.files.map((f) => {
    const b = TEXT_ENCODER.encode(f.name);
    namesSize += 4 + b.length + 8 + 2 + TEXT_ENCODER.encode(f.type).length;
    return b;
  });
  const typeBytesList = msg.files.map((f) => TEXT_ENCODER.encode(f.type));

  let payloadSize = 4;
  for (let i = 0; i < msg.files.length; i++) {
    payloadSize += 4 + nameBytesList[i].length + 8 + 2 + typeBytesList[i].length;
  }

  const totalSize = 5 + payloadSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint8(0, MessageType.BATCH_META);
  view.setUint32(1, payloadSize, false);

  let offset = 5;
  view.setUint32(offset, msg.files.length, false);
  offset += 4;

  for (let i = 0; i < msg.files.length; i++) {
    const nb = nameBytesList[i];
    const tb = typeBytesList[i];
    view.setUint32(offset, nb.length, false);
    offset += 4;
    new Uint8Array(buf, offset, nb.length).set(nb);
    offset += nb.length;
    view.setBigUint64(offset, BigInt(msg.files[i].size), false);
    offset += 8;
    view.setUint16(offset, tb.length, false);
    offset += 2;
    new Uint8Array(buf, offset, tb.length).set(tb);
    offset += tb.length;
  }

  return buf;
}

function decodeBatchMeta(payload: Uint8Array): BatchMetaMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  const fileCount = view.getUint32(offset, false);
  offset += 4;

  const files: BatchMetaFileEntry[] = [];
  for (let i = 0; i < fileCount; i++) {
    const nameLen = view.getUint32(offset, false);
    offset += 4;
    const name = TEXT_DECODER.decode(payload.slice(offset, offset + nameLen));
    offset += nameLen;
    const size = Number(view.getBigUint64(offset, false));
    offset += 8;
    const typeLen = view.getUint16(offset, false);
    offset += 2;
    const type = TEXT_DECODER.decode(payload.slice(offset, offset + typeLen));
    offset += typeLen;
    files.push({ name, size, type });
  }

  return { type: MessageType.BATCH_META, files };
}

function encodeBatchEnd(_msg: BatchEndMessage): ArrayBuffer {
  const totalSize = 5;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  view.setUint8(0, MessageType.BATCH_END);
  view.setUint32(1, 0, false);
  return buf;
}

function decodeBatchEnd(_payload: Uint8Array): BatchEndMessage {
  return { type: MessageType.BATCH_END };
}

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function readUint32(buf: ArrayBuffer, offset: number): number {
  return new DataView(buf).getUint32(offset, false);
}

export function writeUint32(buf: ArrayBuffer, offset: number, value: number): void {
  new DataView(buf).setUint32(offset, value, false);
}
