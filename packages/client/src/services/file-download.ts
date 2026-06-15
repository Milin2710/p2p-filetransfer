export function reassembleFile(
  chunks: Map<number, Uint8Array>,
  totalChunks: number,
  mimeType: string,
): Blob {
    const parts: BlobPart[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks.get(i);
    if (chunk) {
      parts.push(chunk.buffer as ArrayBuffer);
    }
  }
  return new Blob(parts, { type: mimeType || 'application/octet-stream' });
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function openFileInNewTab(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
