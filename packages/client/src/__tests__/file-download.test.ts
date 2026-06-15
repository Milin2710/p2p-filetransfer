import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { reassembleFile, triggerDownload, openFileInNewTab } from '../services/file-download.js';

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
  URL.revokeObjectURL = vi.fn();
});

describe('reassembleFile', () => {
  it('should reassemble chunks in order', () => {
    const chunks = new Map([
      [0, new Uint8Array([1, 2, 3])],
      [1, new Uint8Array([4, 5, 6])],
      [2, new Uint8Array([7, 8, 9])],
    ]);

    const blob = reassembleFile(chunks, 3, 'application/octet-stream');
    expect(blob.size).toBe(9);
    expect(blob.type).toBe('application/octet-stream');
  });

  it('should handle missing chunks (gaps)', () => {
    const chunks = new Map([
      [0, new Uint8Array([1, 2])],
      [2, new Uint8Array([5, 6])],
    ]);

    const blob = reassembleFile(chunks, 3, 'text/plain');
    expect(blob.size).toBe(4);
  });

  it('should handle empty chunk map', () => {
    const blob = reassembleFile(new Map(), 0, '');
    expect(blob.size).toBe(0);
    expect(blob.type).toBe('application/octet-stream');
  });

  it('should use provided mime type', () => {
    const chunks = new Map([[0, new Uint8Array([1])]]);
    const blob = reassembleFile(chunks, 1, 'image/png');
    expect(blob.type).toBe('image/png');
  });
});

describe('triggerDownload', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should create an anchor element and trigger click', () => {
    const blob = new Blob(['test data'], { type: 'text/plain' });
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    triggerDownload(blob, 'test.txt');

    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);

    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('test.txt');
    expect(anchor.style.display).toBe('none');

    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});

describe('openFileInNewTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should call window.open with blob URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const blob = new Blob(['test'], { type: 'text/plain' });

    openFileInNewTab(blob, 'test.txt');

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('blob:'), '_blank');
    openSpy.mockRestore();
  });
});
