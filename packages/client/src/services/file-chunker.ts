import { DEFAULT_CHUNK_SIZE } from '@p2p-share/shared';

export interface ChunkResult {
  data: Uint8Array;
  sequence: number;
  isLast: boolean;
}

export interface ChunkProgress {
  bytesRead: number;
  totalBytes: number;
  currentChunk: number;
  totalChunks: number;
  percent: number;
}

export class FileChunker {
  private file: File;
  private chunkSize: number;
  private offset: number;
  private sequence: number;
  private totalChunks: number;
  private aborted: boolean;

  constructor(file: File, chunkSize: number = DEFAULT_CHUNK_SIZE) {
    this.file = file;
    this.chunkSize = Math.min(chunkSize, 256 * 1024);
    this.offset = 0;
    this.sequence = 0;
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    this.aborted = false;
  }

  getTotalChunks(): number {
    return this.totalChunks;
  }

  getChunkSize(): number {
    return this.chunkSize;
  }

  getFileName(): string {
    return this.file.name;
  }

  getFileSize(): number {
    return this.file.size;
  }

  getFileType(): string {
    return this.file.type || 'application/octet-stream';
  }

  abort(): void {
    this.aborted = true;
  }

  readNextChunk(): Promise<ChunkResult | null> {
    if (this.aborted || this.offset >= this.file.size) {
      return Promise.resolve(null);
    }

    const end = Math.min(this.offset + this.chunkSize, this.file.size);
    const slice = this.file.slice(this.offset, end);
    const sequence = this.sequence;
    const isLast = end >= this.file.size;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const data = new Uint8Array(arrayBuffer);
        this.offset = end;
        this.sequence++;
        resolve({ data, sequence, isLast });
      };

      reader.onerror = () => {
        reject(new Error(`Failed to read chunk at offset ${this.offset}: ${reader.error?.message || 'Unknown error'}`));
      };

      reader.readAsArrayBuffer(slice);
    });
  }

  getCurrentSequence(): number {
    return this.sequence;
  }

  seek(chunkIndex: number): void {
    if (chunkIndex < 0) chunkIndex = 0;
    if (chunkIndex > this.totalChunks) chunkIndex = this.totalChunks;
    this.sequence = chunkIndex;
    this.offset = chunkIndex * this.chunkSize;
  }

  getProgress(): ChunkProgress {
    return {
      bytesRead: this.offset,
      totalBytes: this.file.size,
      currentChunk: this.sequence,
      totalChunks: this.totalChunks,
      percent: this.file.size > 0 ? (this.offset / this.file.size) * 100 : 0,
    };
  }

  async readAllChunks(onProgress?: (progress: ChunkProgress) => void): Promise<ChunkResult[]> {
    const chunks: ChunkResult[] = [];

    while (true) {
      const chunk = await this.readNextChunk();
      if (!chunk) break;
      chunks.push(chunk);
      if (onProgress) {
        onProgress(this.getProgress());
      }
    }

    return chunks;
  }
}

export function calculateTotalChunks(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize);
}
