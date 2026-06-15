import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeMessage, decodeMessage, ProtocolError } from '@p2p-share/shared';
import { MessageType, PROTOCOL_CONSTANTS } from '@p2p-share/shared';
import type {
  DataChannelMessage,
  FileMetaMessage,
  BatchMetaMessage,
  BatchEndMessage,
} from '@p2p-share/shared';
import { FileChunker } from '../services/file-chunker.js';
import { computeSHA256, computeSHA256FromChunks, areHashesEqual } from '../services/sha256.js';
import { reassembleFile, triggerDownload } from '../services/file-download.js';
import { encryptChunk, decryptChunk } from '../services/encryption.js';
import { getEncryptionKey } from '../services/data-channel-registry.js';
import {
  saveCheckpoint,
  deleteCheckpoint,
  getCheckpoint,
  saveChunk,
  loadAllChunks,
  deleteRoomChunks,
} from '../services/checkpoint-store.js';
import { useTransferStore } from '../stores/transferStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useHistoryStore } from '../stores/historyStore.js';
import { saveHistoryEntry } from '../services/history-store.js';

interface UseFileTransferOptions {
  dataChannel: RTCDataChannel | null;
  roomId?: string;
}

export function useFileTransfer({ dataChannel, roomId = '' }: UseFileTransferOptions) {
  const [error, setError] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [receivedFileMeta, setReceivedFileMeta] = useState<FileMetaMessage | null>(null);

  const chunkerRef = useRef<FileChunker | null>(null);
  const inFlightRef = useRef<Set<number>>(new Set());
  const windowSizeRef = useRef(PROTOCOL_CONSTANTS.MIN_WINDOW_SIZE);
  const cancelledRef = useRef(false);
  const metaAckResolveRef = useRef<((value: boolean) => void) | null>(null);
  const verifyResolveRef = useRef<((value: boolean) => void) | null>(null);
  const resumeResolveRef = useRef<((value: number) => void) | null>(null);
  const fileMetaRef = useRef<FileMetaMessage | null>(null);
  const chunkCountRef = useRef(0);
  const roomIdRef = useRef('');
  const lastSpeedUpdateRef = useRef(0);
  const batchModeRef = useRef(false);

  const transferStore = useTransferStore();
  const addNotification = useUIStore((s) => s.addNotification);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const sendMessage = useCallback(
    (msg: ArrayBuffer) => {
      if (dataChannel?.readyState !== 'open') return false;
      if (dataChannel.bufferedAmount > PROTOCOL_CONSTANTS.MAX_BUFFERED_AMOUNT) return false;
      try {
        dataChannel.send(msg);
        return true;
      } catch {
        return false;
      }
    },
    [dataChannel],
  );

  const waitForBufferedAmountLow = useCallback(() => {
    if (!dataChannel || dataChannel.bufferedAmount <= PROTOCOL_CONSTANTS.MAX_BUFFERED_AMOUNT) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const handler = () => {
        dataChannel.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      dataChannel.addEventListener('bufferedamountlow', handler);
    });
  }, [dataChannel]);

  async function sendSingleFile(
    file: File,
    fileIndex: number,
    totalFiles: number,
  ): Promise<boolean> {
    transferStore.setCurrentFileIndex(fileIndex);
    transferStore.setTransferPhase('hashing');

    const fileBuffer = await file.arrayBuffer();
    const fileHash = await computeSHA256(fileBuffer);
    const fileHashHex = Array.from(fileHash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const chunker = new FileChunker(file);
    chunkerRef.current = chunker;

    const totalChunks = chunker.getTotalChunks();
    const chunkSize = chunker.getChunkSize();

    transferStore.setFileMetadata({
      fileName: chunker.getFileName(),
      fileSize: chunker.getFileSize(),
      fileType: chunker.getFileType(),
    });
    transferStore.setSha256Hash(fileHashHex);
    transferStore.setTransferPhase('meta');
    transferStore.setProgress({ totalChunks, chunkSizeBytes: chunkSize });

    const metaMsg: FileMetaMessage = {
      type: MessageType.FILE_META,
      fileName: chunker.getFileName(),
      fileSize: BigInt(chunker.getFileSize()),
      mimeType: chunker.getFileType(),
      sha256Hash: fileHash,
      totalChunks,
      chunkSize,
    };
    fileMetaRef.current = metaMsg;

    dataChannel!.send(encodeMessage(metaMsg));

    const metaAck = await new Promise<boolean>((resolve) => {
      metaAckResolveRef.current = resolve;
      setTimeout(() => resolve(false), PROTOCOL_CONSTANTS.META_ACK_TIMEOUT_MS);
    });

    if (!metaAck) {
      setError('File metadata not acknowledged');
      return false;
    }

    if (roomId) {
      await saveCheckpoint(roomId, {
        role: 'sender',
        fileName: chunker.getFileName(),
        fileSize: chunker.getFileSize(),
        totalChunks,
        lastSentChunk: 0,
        lastReceivedChunk: 0,
        lastAcknowledgedChunk: 0,
        totalBytesSent: 0,
        timestamp: Date.now(),
      });
    }

    transferStore.setTransferPhase('transferring');
    inFlightRef.current.clear();
    windowSizeRef.current = PROTOCOL_CONSTANTS.MIN_WINDOW_SIZE;

    if (roomId && fileIndex === 0) {
      const cp = await getCheckpoint(roomId);
      if (cp && cp.lastAcknowledgedChunk > 0) {
        dataChannel!.send(
          encodeMessage({
            type: MessageType.RESUME,
            lastAcknowledgedChunk: cp.lastAcknowledgedChunk,
          }),
        );

        const theirLastReceived = await new Promise<number>((resolve) => {
          resumeResolveRef.current = resolve;
          setTimeout(() => resolve(-1), 5000);
        });

        if (theirLastReceived >= 0) {
          const resumePoint = Math.min(cp.lastAcknowledgedChunk, theirLastReceived);
          if (resumePoint > 0) {
            chunker.seek(resumePoint + 1);
            const skippedBytes = (resumePoint + 1) * chunkSize;
            transferStore.setProgress({
              chunksSent: resumePoint + 1,
              chunksAcknowledged: cp.lastAcknowledgedChunk,
              bytesTransferred: skippedBytes,
              lastAcknowledgedChunk: cp.lastAcknowledgedChunk,
            });
            inFlightRef.current.clear();
          }
        }
      }
    }

    chunkCountRef.current = 0;
    lastSpeedUpdateRef.current = Date.now();
    while (!cancelledRef.current) {
      const chunk = await chunker.readNextChunk();
      if (!chunk) break;

      const key = getEncryptionKey();
      const chunkData = key ? await encryptChunk(chunk.data, key, chunk.sequence) : chunk.data;

      const encoded = encodeMessage({
        type: MessageType.CHUNK,
        sequence: chunk.sequence,
        data: chunkData,
      });

      await waitForBufferedAmountLow();

      while (inFlightRef.current.size >= windowSizeRef.current && !cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (cancelledRef.current) break;

      if (sendMessage(encoded)) {
        inFlightRef.current.add(chunk.sequence);
        transferStore.incrementChunksSent();
        const now = Date.now();
        transferStore.updateSpeed(chunk.data.length, now - lastSpeedUpdateRef.current);
        lastSpeedUpdateRef.current = now;
        transferStore.setProgress({ lastAcknowledgedChunk: -1 });
        if (roomId && chunk.sequence % 10 === 0) {
          const p = transferStore;
          saveCheckpoint(roomId, {
            role: 'sender',
            fileName: chunker.getFileName(),
            fileSize: chunker.getFileSize(),
            totalChunks,
            lastSentChunk: chunk.sequence,
            lastReceivedChunk: 0,
            lastAcknowledgedChunk: p.lastAcknowledgedChunk,
            totalBytesSent: p.bytesTransferred,
            timestamp: Date.now(),
          });
        }
      }
    }

    if (cancelledRef.current) return false;

    while (inFlightRef.current.size > 0 && !cancelledRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (cancelledRef.current) return false;

    transferStore.setTransferPhase('verifying');

    dataChannel!.send(
      encodeMessage({
        type: MessageType.VERIFY_REQUEST,
        senderHash: fileHash,
      }),
    );

    const verifyResult = await new Promise<boolean>((resolve) => {
      verifyResolveRef.current = (match: boolean) => resolve(match);
      setTimeout(() => resolve(false), PROTOCOL_CONSTANTS.VERIFY_TIMEOUT_MS);
    });

    if (verifyResult) {
      transferStore.markBatchFileTransferred(fileIndex);
      const meta = fileMetaRef.current;
      if (meta && roomIdRef.current) {
        saveHistoryEntry({
          id: crypto.randomUUID(),
          roomId: roomIdRef.current,
          role: 'sender',
          fileName: meta.fileName,
          fileSize: Number(meta.fileSize),
          fileType: meta.mimeType,
          totalChunks: meta.totalChunks,
          chunksTransferred: transferStore.chunksAcknowledged,
          status: 'completed',
          sha256Hash: fileHashHex,
          speedAvgBps: transferStore.averageSpeedBps,
          startedAt: Date.now(),
          completedAt: Date.now(),
        });
      }
      return true;
    }

    transferStore.setTransferPhase('error');
    transferStore.setTransferError('File verification failed');
    setError('File verification failed');
    if (roomIdRef.current) {
      const meta = fileMetaRef.current;
      saveHistoryEntry({
        id: crypto.randomUUID(),
        roomId: roomIdRef.current,
        role: 'sender',
        fileName: meta?.fileName || chunker.getFileName() || 'unknown',
        fileSize: Number(meta?.fileSize || BigInt(chunker.getFileSize() || 0)),
        fileType: meta?.mimeType || 'application/octet-stream',
        totalChunks,
        chunksTransferred: transferStore.chunksAcknowledged,
        status: 'error',
        sha256Hash: fileHashHex,
        speedAvgBps: transferStore.averageSpeedBps,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
    }
    return false;
  }

  const sendFiles = useCallback(
    async (files: File[]) => {
      if (!dataChannel || dataChannel.readyState !== 'open') {
        setError('DataChannel not open');
        return;
      }

      cancelledRef.current = false;
      setIsTransferring(true);
      setError(null);
      transferStore.setBatchFiles(
        files.map((f) => ({ name: f.name, size: f.size, type: f.type, transferred: false })),
      );

      const batchMeta: BatchMetaMessage = {
        type: MessageType.BATCH_META,
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      };
      dataChannel.send(encodeMessage(batchMeta));

      for (let i = 0; i < files.length; i++) {
        if (cancelledRef.current) break;
        if (i > 0) {
          transferStore.resetFileProgress();
        }
        const ok = await sendSingleFile(files[i], i, files.length);
        if (!ok) {
          setIsTransferring(false);
          return;
        }
      }

      if (cancelledRef.current) {
        setIsTransferring(false);
        return;
      }

      dataChannel.send(encodeMessage({ type: MessageType.BATCH_END }));

      transferStore.setTransferPhase('complete');
      const fileCount = files.length;
      addNotification({
        type: 'success',
        title: fileCount > 1 ? `${fileCount} files transferred` : 'Transfer complete',
        durationMs: 5000,
      });
      setIsTransferring(false);
      if (roomIdRef.current) {
        deleteCheckpoint(roomIdRef.current);
        deleteRoomChunks(roomIdRef.current);
      }
    },
    [dataChannel, transferStore, addNotification, sendMessage, waitForBufferedAmountLow],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    chunkerRef.current?.abort();
    if (dataChannel?.readyState === 'open') {
      try {
        dataChannel.send(
          encodeMessage({
            type: MessageType.CANCEL,
            reason: 0x0001,
            message: 'User cancelled transfer',
          }),
        );
      } catch {
        /* ignore */
      }
    }
    const meta = fileMetaRef.current;
    transferStore.setTransferPhase('cancelled');
    setIsTransferring(false);
    if (roomIdRef.current) {
      saveHistoryEntry({
        id: crypto.randomUUID(),
        roomId: roomIdRef.current,
        role: 'sender',
        fileName: meta?.fileName || chunkerRef.current?.getFileName() || 'unknown',
        fileSize: Number(meta?.fileSize || BigInt(chunkerRef.current?.getFileSize() || 0)),
        fileType: meta?.mimeType || 'application/octet-stream',
        totalChunks: meta?.totalChunks || chunkerRef.current?.getTotalChunks() || 0,
        chunksTransferred: transferStore.chunksAcknowledged,
        status: 'cancelled',
        sha256Hash: transferStore.sha256Hash,
        speedAvgBps: transferStore.averageSpeedBps,
        startedAt:
          Date.now() -
          (transferStore.averageSpeedBps > 0
            ? (transferStore.bytesTransferred / transferStore.averageSpeedBps) * 1000
            : 0),
        completedAt: Date.now(),
      });
      deleteCheckpoint(roomIdRef.current);
      deleteRoomChunks(roomIdRef.current);
    }
  }, [dataChannel, transferStore]);

  const receivedChunksRef = useRef<Map<number, Uint8Array>>(new Map());
  useEffect(() => {
    if (!dataChannel) return;

    dataChannel.binaryType = 'arraybuffer';

    const handleClose = () => {
      cancelledRef.current = true;
      setError('Connection closed');
      transferStore.setTransferPhase('error');
      transferStore.setTransferError('Connection closed');
      setIsTransferring(false);
    };

    const handleError = () => {
      cancelledRef.current = true;
      setError('Connection error');
      transferStore.setTransferPhase('error');
      transferStore.setTransferError('Connection error');
      setIsTransferring(false);
    };

    dataChannel.addEventListener('close', handleClose);
    dataChannel.addEventListener('error', handleError);

    const handleMessage = async (event: MessageEvent) => {
      console.log('[MESSAGE RECEIVED]');

      if (!(event.data instanceof ArrayBuffer)) return;

      let msg: DataChannelMessage;
      try {
        msg = decodeMessage(event.data);

        console.log('[TYPE]', msg.type);
      } catch (err) {
        console.error(err);
        return;
      }

      switch (msg.type) {
        case MessageType.BATCH_META: {
          batchModeRef.current = true;
          transferStore.setBatchFiles(
            msg.files.map((f) => ({
              name: f.name,
              size: f.size,
              type: f.type,
              transferred: false,
            })),
          );
          break;
        }

        case MessageType.BATCH_END: {
          if (batchModeRef.current) {
            transferStore.setTransferPhase('complete');
            addNotification({
              type: 'success',
              title: `All ${transferStore.batchFiles.length} files received`,
              durationMs: 5000,
            });
          }
          batchModeRef.current = false;
          break;
        }

        case MessageType.FILE_META: {
          fileMetaRef.current = msg;
          setReceivedFileMeta(msg);
          transferStore.setFileMetadata({
            fileName: msg.fileName,
            fileSize: Number(msg.fileSize),
            fileType: msg.mimeType,
          });

          transferStore.setProgress({
            totalChunks: msg.totalChunks,
            chunkSizeBytes: msg.chunkSize,
            chunksReceived: 0,
          });
          lastSpeedUpdateRef.current = Date.now();
          if (roomIdRef.current) {
            const cp = await getCheckpoint(roomIdRef.current);
            if (cp && cp.lastReceivedChunk > 0) {
              const stored = await loadAllChunks(roomIdRef.current);
              for (const [seq, data] of stored) {
                receivedChunksRef.current.set(seq, data);
              }
              const ackedChunks = cp.lastReceivedChunk + 1;
              const chunkSize = msg.chunkSize || transferStore.chunkSizeBytes;
              transferStore.setProgress({
                chunksReceived: ackedChunks,
                lastAcknowledgedChunk: cp.lastReceivedChunk,
                bytesTransferred: ackedChunks * chunkSize,
              });
              transferStore.setFileMetadata({
                fileName: msg.fileName,
                fileSize: Number(msg.fileSize),
                fileType: msg.mimeType,
              });
              chunkCountRef.current = ackedChunks;
            }
          }
          dataChannel.send(
            encodeMessage({
              type: MessageType.CHUNK_ACK,
              sequence: 0,
              status: 0x00,
            }),
          );
          break;
        }

        case MessageType.RESUME: {
          const rid = roomIdRef.current;
          if (rid) {
            const cp = await getCheckpoint(rid);
            const lastReceived = cp ? cp.lastReceivedChunk : 0;
            if (lastReceived > 0) {
              const stored = await loadAllChunks(rid);
              for (const [seq, data] of stored) {
                receivedChunksRef.current.set(seq, data);
              }
              chunkCountRef.current = lastReceived + 1;
              transferStore.setProgress({
                chunksReceived: lastReceived + 1,
                lastAcknowledgedChunk: lastReceived,
              });
            }
            dataChannel.send(
              encodeMessage({
                type: MessageType.RESUME_ACK,
                lastReceivedChunk: lastReceived,
              }),
            );
          } else {
            dataChannel.send(
              encodeMessage({
                type: MessageType.RESUME_ACK,
                lastReceivedChunk: 0,
              }),
            );
          }
          break;
        }

        case MessageType.CHUNK: {
          receivedChunksRef.current.set(msg.sequence, msg.data);
          console.log('[CHUNK RECEIVED]', msg.sequence, 'total=', receivedChunksRef.current.size);
          transferStore.incrementChunksReceived();
          const now = Date.now();
          transferStore.updateSpeed(msg.data.length, now - lastSpeedUpdateRef.current);
          lastSpeedUpdateRef.current = now;
          chunkCountRef.current++;
          if (roomIdRef.current) {
            saveChunk(roomIdRef.current, msg.sequence, msg.data);
            if (chunkCountRef.current % 10 === 0) {
              const meta = fileMetaRef.current;
              saveCheckpoint(roomIdRef.current, {
                role: 'receiver',
                fileName: meta?.fileName || '',
                fileSize: Number(meta?.fileSize || BigInt(0)),
                totalChunks: meta?.totalChunks || 0,
                lastSentChunk: 0,
                lastReceivedChunk: msg.sequence,
                lastAcknowledgedChunk: 0,
                totalBytesSent: 0,
                timestamp: Date.now(),
              });
            }
          }
          dataChannel.send(
            encodeMessage({
              type: MessageType.CHUNK_ACK,
              sequence: msg.sequence,
              status: 0x00,
            }),
          );
          break;
        }

        case MessageType.CHUNK_ACK: {
          console.log('[ACK]', msg.sequence);
          inFlightRef.current.delete(msg.sequence);
          transferStore.incrementChunksAcknowledged();
          transferStore.setProgress({ lastAcknowledgedChunk: msg.sequence });
          if (msg.sequence === 0 && metaAckResolveRef.current) {
            metaAckResolveRef.current(true);
            metaAckResolveRef.current = null;
          }
          break;
        }

        case MessageType.RESUME_ACK: {
          if (resumeResolveRef.current) {
            resumeResolveRef.current(msg.lastReceivedChunk);
            resumeResolveRef.current = null;
          }
          break;
        }

        case MessageType.VERIFY_REQUEST: {
          const meta = fileMetaRef.current;
          console.log('[VERIFY REQUEST]');
          console.log(
            'senderHash=',
            Array.from(msg.senderHash)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(''),
          );
          console.log('receivedChunks=', receivedChunksRef.current.size);
          console.log('expectedChunks=', meta?.totalChunks);
          const key = getEncryptionKey();
          let match = false;
          if (meta) {
            const allChunks: Uint8Array[] = [];
            for (let i = 0; i < meta.totalChunks; i++) {
              const raw = receivedChunksRef.current.get(i);
              if (raw) {
                const decrypted = key ? await decryptChunk(raw, key, i) : raw;
                allChunks.push(decrypted);
              }
            }
            if (allChunks.length === meta.totalChunks) {
              const receiverHash = await computeSHA256FromChunks(allChunks);
              console.log(
                'receiverHash=',
                Array.from(receiverHash)
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join(''),
              );

              console.log(
                'senderHash=',
                Array.from(msg.senderHash)
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join(''),
              );
              match = areHashesEqual(receiverHash, msg.senderHash);
              console.log('[VERIFY RESULT]', match);
              if (match) {
                if (!batchModeRef.current) {
                  transferStore.setTransferPhase('complete');
                }
                const decryptedChunks = new Map<number, Uint8Array>();
                for (let i = 0; i < meta.totalChunks; i++) {
                  decryptedChunks.set(i, allChunks[i]);
                }
                const blob = reassembleFile(decryptedChunks, meta.totalChunks, meta.mimeType);
                triggerDownload(blob, meta.fileName);
                transferStore.setPreviewUrl(URL.createObjectURL(blob));
                addNotification({
                  type: 'success',
                  title: `Downloaded: ${meta.fileName}`,
                  durationMs: 5000,
                });
                if (roomIdRef.current) {
                  saveHistoryEntry({
                    id: crypto.randomUUID(),
                    roomId: roomIdRef.current,
                    role: 'receiver',
                    fileName: meta.fileName,
                    fileSize: Number(meta.fileSize),
                    fileType: meta.mimeType,
                    totalChunks: meta.totalChunks,
                    chunksTransferred: meta.totalChunks,
                    status: 'completed',
                    sha256Hash:
                      transferStore.sha256Hash ||
                      Array.from(msg.senderHash)
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join(''),
                    speedAvgBps: transferStore.averageSpeedBps,
                    startedAt:
                      Date.now() -
                      (transferStore.averageSpeedBps > 0
                        ? (transferStore.bytesTransferred / transferStore.averageSpeedBps) * 1000
                        : 0),
                    completedAt: Date.now(),
                  });
                }
              } else {
                transferStore.setReceiverHash(
                  Array.from(receiverHash)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(''),
                );
                transferStore.setTransferPhase('error');
                transferStore.setTransferError('Hash mismatch');
                batchModeRef.current = false;
              }
            }
          }
          dataChannel.send(
            encodeMessage({
              type: MessageType.VERIFY_RESPONSE,
              match,
            }),
          );
          if (roomIdRef.current) {
            deleteRoomChunks(roomIdRef.current);
            deleteCheckpoint(roomIdRef.current);
          }
          break;
        }

        case MessageType.VERIFY_RESPONSE: {
          console.log('[VERIFY RESPONSE]', msg.match);

          if (verifyResolveRef.current) {
            verifyResolveRef.current(msg.match);
            verifyResolveRef.current = null;
          }
          break;
        }

        case MessageType.CANCEL: {
          const meta = fileMetaRef.current;
          transferStore.setTransferPhase('cancelled');
          setIsTransferring(false);
          if (roomIdRef.current) {
            saveHistoryEntry({
              id: crypto.randomUUID(),
              roomId: roomIdRef.current,
              role: 'receiver',
              fileName: meta?.fileName || 'unknown',
              fileSize: Number(meta?.fileSize || BigInt(0)),
              fileType: meta?.mimeType || 'application/octet-stream',
              totalChunks: meta?.totalChunks || 0,
              chunksTransferred: chunkCountRef.current,
              status: 'cancelled',
              sha256Hash: null,
              speedAvgBps: transferStore.averageSpeedBps,
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
            deleteRoomChunks(roomIdRef.current);
            deleteCheckpoint(roomIdRef.current);
          }
          break;
        }

        case MessageType.ERROR: {
          const errorMeta = fileMetaRef.current;
          setError(msg.message);
          transferStore.setTransferError(msg.message);
          transferStore.setTransferPhase('error');
          setIsTransferring(false);
          if (roomIdRef.current) {
            saveHistoryEntry({
              id: crypto.randomUUID(),
              roomId: roomIdRef.current,
              role: 'receiver',
              fileName: errorMeta?.fileName || 'unknown',
              fileSize: Number(errorMeta?.fileSize || BigInt(0)),
              fileType: errorMeta?.mimeType || 'application/octet-stream',
              totalChunks: errorMeta?.totalChunks || 0,
              chunksTransferred: chunkCountRef.current,
              status: 'error',
              sha256Hash: null,
              speedAvgBps: transferStore.averageSpeedBps,
              startedAt: Date.now(),
              completedAt: Date.now(),
            });
            deleteRoomChunks(roomIdRef.current);
            deleteCheckpoint(roomIdRef.current);
          }
          break;
        }
      }
    };

    dataChannel.addEventListener('message', handleMessage);
    return () => {
      dataChannel.removeEventListener('message', handleMessage);
      dataChannel.removeEventListener('close', handleClose);
      dataChannel.removeEventListener('error', handleError);
    };
  }, [dataChannel, transferStore, addNotification]);

  return {
    sendFiles,
    cancel,
    isTransferring,
    error,
    receivedFileMeta,
  };
}
