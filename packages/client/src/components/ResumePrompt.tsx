import { useCallback, useRef } from 'react';
import { useResumeStore } from '../stores/resumeStore.js';
import { deleteCheckpoint, deleteRoomChunks } from '../services/checkpoint-store.js';
import { setActiveFile } from '../services/data-channel-registry.js';

interface ResumePromptProps {
  roomId: string;
  onResume?: () => void;
}

function ResumePrompt({ roomId, onResume }: ResumePromptProps) {
  const {
    role,
    fileName,
    fileSize,
    totalChunks,
    lastReceivedChunk,
    lastActivity,
    setResumeAction,
    clearResumableTransfer,
  } = useResumeStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const progressPercent =
    totalChunks > 0 ? Math.min(Math.round((lastReceivedChunk / totalChunks) * 100), 99) : 0;

  const timeAgo = lastActivity
    ? `${Math.max(1, Math.floor((Date.now() - lastActivity) / 1000))}s ago`
    : 'unknown';

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleResume = useCallback(() => {
    if (role === 'sender') {
      fileInputRef.current?.click();
    } else {
      setResumeAction('resuming');
      onResume?.();
    }
  }, [role, setResumeAction, onResume]);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name !== fileName || file.size !== fileSize) {
        alert(`File mismatch: expected "${fileName}" (${formatSize(fileSize)}), got "${file.name}" (${formatSize(file.size)}). Please select the correct file.`);
        e.target.value = '';
        return;
      }
      setActiveFile(file);
      setResumeAction('resuming');
      onResume?.();
    }
  }, [setResumeAction, onResume, fileName, fileSize]);

  const handleDiscard = useCallback(async () => {
    await deleteCheckpoint(roomId);
    await deleteRoomChunks(roomId);
    setResumeAction('discarded');
    clearResumableTransfer();
  }, [roomId, setResumeAction, clearResumableTransfer]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-white/[0.08] animate-scale-in">
        <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-4 text-center">Resume previous transfer?</h3>

        <div className="space-y-2.5 text-sm mb-4 bg-white/[0.03] rounded-xl p-4">
          <div className="flex justify-between">
            <span className="text-gray-400">File</span>
            <span className="text-white font-medium truncate ml-4 max-w-[180px]">{fileName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Size</span>
            <span className="text-white font-medium">{formatSize(fileSize)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Progress</span>
            <span className="text-white font-medium">{progressPercent}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Activity</span>
            <span className="text-white font-medium">{timeAgo}</span>
          </div>
        </div>

        <div className="w-full bg-white/[0.06] rounded-full h-2 mb-5 overflow-hidden">
          <div
            className="h-2 rounded-full bg-indigo-500 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition-all duration-200 active:scale-95 text-sm"
            onClick={handleResume}
          >
            Resume
          </button>
          <button
            className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.10] rounded-xl font-medium transition-all duration-200 active:scale-95 text-sm"
            onClick={handleDiscard}
          >
            Start Over
          </button>
        </div>
        <p className="text-xs text-gray-600 text-center mt-3 font-light">
          {role === 'sender'
            ? 'Select the original file to resume sending'
            : 'Continue receiving the file'}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
    </div>
  );
}

export default ResumePrompt;
