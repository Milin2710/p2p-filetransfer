import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatFileSize } from '@p2p-share/shared';
import { connectSocket } from '../services/socket';
import { useRoomStore } from '../stores/roomStore';
import { setActiveFile, setActiveFiles, setEncryptionKey } from '../services/data-channel-registry';
import { generateEncryptionKey, exportKey } from '../services/encryption';

function Landing() {
  const navigate = useNavigate();
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setRoomPhase } = useRoomStore();

  const handleFiles = useCallback((files: FileList) => {
    setCreateError(null);
    if (files.length > 0) {
      setSelectedFiles(prev => {
        const existing = new Set(prev.map(f => f.name + f.size));
        const newFiles = Array.from(files).filter(f => !existing.has(f.name + f.size));
        return [...prev, ...newFiles];
      });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const items = e.dataTransfer.items;
    if (items) {
      const filePromises: Promise<File[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() ?? null;
        if (entry?.isDirectory) {
          filePromises.push(traverseDirectory(entry as FileSystemDirectoryEntry));
        }
      }
      if (filePromises.length > 0) {
        Promise.all(filePromises).then((nested) => {
          const allFiles = nested.flat();
          if (allFiles.length > 0) {
            setSelectedFiles(prev => {
              const existing = new Set(prev.map(f => f.name + f.size));
              const newFiles = allFiles.filter(f => !existing.has(f.name + f.size));
              return [...prev, ...newFiles];
            });
          }
        });
      } else if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    } else if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  function traverseDirectory(entry: FileSystemDirectoryEntry): Promise<File[]> {
    return new Promise((resolve) => {
      const reader = entry.createReader();
      const allEntries: FileSystemEntry[] = [];
      function readBatch() {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            Promise.all(
              allEntries.map((e) => {
                if (e.isFile) {
                  return new Promise<File[]>((res) => {
                    (e as FileSystemFileEntry).file((f) => res([f]), () => res([]));
                  });
                }
                return traverseDirectory(e as FileSystemDirectoryEntry);
              }),
            ).then((nested) => resolve(nested.flat()));
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        }, () => resolve([]));
      }
      readBatch();
    });
  }

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  }, [handleFiles]);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const createRoom = useCallback(async () => {
    if (isCreating || selectedFiles.length === 0) return;
    setIsCreating(true);
    setCreateError(null);
    setRoomPhase('creating');

    try {
      const key = await generateEncryptionKey();
      setEncryptionKey(key);
      const keyBase64 = await exportKey(key);

      const socket = connectSocket();
      if (!socket.connected) socket.connect();

      socket.once('room-created', (data: { roomId: string }) => {
        setActiveFiles(selectedFiles);
        setActiveFile(null);
        setRoomPhase('waiting');
        navigate(`/room/${data.roomId}#key=${keyBase64}`, {
          state: {
            files: selectedFiles.map((f) => ({
              fileName: f.name,
              fileSize: f.size,
              fileType: f.type,
            })),
          },
        });
      });

      socket.once('room-error', (data: { message: string }) => {
        setCreateError(data.message);
        setRoomPhase('idle');
        setIsCreating(false);
      });

      socket.emit('create-room');

      setTimeout(() => {
        if (isCreating) {
          setCreateError('Room creation timed out. Please try again.');
          setRoomPhase('idle');
          setIsCreating(false);
        }
      }, 15000);
    } catch (err) {
      setCreateError('Failed to create room. Please check your connection.');
      setRoomPhase('idle');
      setIsCreating(false);
    }
  }, [isCreating, selectedFiles, navigate]);

  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-slate-950' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const secondaryText = isDark ? 'text-slate-500' : 'text-slate-600';
  const cardBg = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';

  return (
    <div className={`min-h-screen ${bgClass} ${textClass} transition-colors duration-300 flex flex-col bg-transparent`}>
      {/* Header */}
      <div className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} px-6 py-4 flex justify-between items-center`}>
        <div className="text-2xl font-bold">Transfer Pro</div>
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-3">Send Files Instantly</h1>
            <p className={`${secondaryText} text-lg`}>Secure peer-to-peer transfer with zero servers</p>
          </div>

          {/* Upload Area */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleInputChange}
          />

          <div
            className={`rounded-2xl border-2 border-dashed p-12 mb-8 cursor-pointer transition-all ${
              isDragOver
                ? `${isDark ? 'border-blue-500 bg-blue-500/5' : 'border-blue-500 bg-blue-50'}`
                : selectedFiles.length > 0
                  ? `${isDark ? 'border-green-500 bg-green-500/5' : 'border-green-500 bg-green-50'}`
                  : `${isDark ? 'border-slate-700 hover:border-slate-600' : 'border-slate-300 hover:border-slate-400'}`
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={selectedFiles.length === 0 ? handleFileSelect : undefined}
          >
            {selectedFiles.length > 0 ? (
              <div>
                <div className="flex justify-center mb-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isDark ? 'bg-green-500/20' : 'bg-green-100'}`}>
                    <span className="text-2xl">✓</span>
                  </div>
                </div>
                <p className={`text-center font-semibold mb-4 ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </p>
                <div className={`${isDark ? 'bg-slate-800' : 'bg-white'} rounded-lg max-h-48 overflow-y-auto space-y-2 p-3 mb-4`}>
                  {selectedFiles.map((f, i) => (
                    <div key={`${f.name}-${f.size}`} className={`flex items-center justify-between text-sm px-3 py-2 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                      <span className="truncate flex-1">{f.name}</span>
                      <span className={`text-xs ${secondaryText} ml-2`}>{formatFileSize(f.size)}</span>
                      <button
                        className={`ml-2 font-bold transition-colors ${isDark ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className={`text-sm ${secondaryText} hover:opacity-70`}
                  onClick={(e) => { e.stopPropagation(); setSelectedFiles([]); }}
                >
                  Clear all
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-5xl mb-4">📦</div>
                <p className="text-lg font-medium mb-2">Drop files to share</p>
                <p className={secondaryText}>or click to browse</p>
              </div>
            )}
          </div>

          {/* Error */}
          {createError && (
            <div className={`rounded-lg p-4 mb-6 text-sm ${isDark ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {createError}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <button
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                selectedFiles.length > 0 && !isCreating
                  ? `${isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white shadow-lg`
                  : `${isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-500'} cursor-not-allowed`
              }`}
              disabled={selectedFiles.length === 0 || isCreating}
              onClick={createRoom}
            >
              {isCreating ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Creating...
                </span>
              ) : (
                'Create Link'
              )}
            </button>
            <button
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}
              onClick={() => navigate('/history')}
            >
              History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

export default Landing;
