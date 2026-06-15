import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { formatFileSize } from '@p2p-share/shared';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { useTransferStore } from '../stores/transferStore';
import { useResumeStore } from '../stores/resumeStore';
import {
  getActiveDataChannel,
  getActiveFiles,
  getActiveFile,
  setActiveFile,
  getResumeAfterConnect,
  setResumeAfterConnect,
} from '../services/data-channel-registry';

function Transfer() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const fileState = location.state as {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    files?: { fileName: string; fileSize: number; fileType: string }[];
    isResuming?: boolean;
  } | null;
  const isSender = !!(fileState?.fileName || fileState?.files?.length);
  const isResuming = fileState?.isResuming || getResumeAfterConnect();
  const [waitingForFile, setWaitingForFile] = useState(isSender && isResuming && !getActiveFile());
  const hasStartedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { resumeAction, clearResumableTransfer } = useResumeStore();

  const dataChannel = getActiveDataChannel();
  const [channelOpen, setChannelOpen] = useState(() => dataChannel?.readyState === 'open');

  useEffect(() => {
    if (!dataChannel) return;
    if (dataChannel.readyState === 'open') {
      setChannelOpen(true);
      return;
    }
    const handleOpen = () => setChannelOpen(true);
    const handleClose = () => setChannelOpen(false);
    dataChannel.addEventListener('open', handleOpen);
    dataChannel.addEventListener('close', handleClose);
    return () => {
      dataChannel.removeEventListener('open', handleOpen);
      dataChannel.removeEventListener('close', handleClose);
    };
  }, [dataChannel]);

  useEffect(() => {
    return () => {
      setActiveFile(null);
      setResumeAfterConnect(false);
    };
  }, []);

  useEffect(() => {
    if (resumeAction === 'resuming') {
      clearResumableTransfer();
    }
  }, [resumeAction, clearResumableTransfer]);

  const { sendFiles, cancel, isTransferring, error } = useFileTransfer({ dataChannel, roomId });

  const transferPhase = useTransferStore((s) => s.transferPhase);
  const progress = useTransferStore((s) => s.progressPercent);
  const currentSpeed = useTransferStore((s) => s.currentSpeedBps);
  const averageSpeed = useTransferStore((s) => s.averageSpeedBps);
  const chunksSent = useTransferStore((s) => s.chunksSent);
  const chunksAcknowledged = useTransferStore((s) => s.chunksAcknowledged);
  const chunksReceived = useTransferStore((s) => s.chunksReceived);
  const totalChunks = useTransferStore((s) => s.totalChunks);
  const etaMs = useTransferStore((s) => s.etaMs);
  const fileName = useTransferStore((s) => s.fileName);
  const fileSize = useTransferStore((s) => s.fileSize);
  const bytesTransferred = useTransferStore((s) => s.bytesTransferred);
  const batchFiles = useTransferStore((s) => s.batchFiles);
  const currentFileIndex = useTransferStore((s) => s.currentFileIndex);
  const previewUrl = useTransferStore((s) => s.previewUrl);

  const totalFiles = fileState?.files?.length || (fileState?.fileName ? 1 : 0);

  useEffect(() => {
    if (
      transferPhase === 'complete' ||
      transferPhase === 'error' ||
      transferPhase === 'cancelled'
    ) {
      const timer = setTimeout(() => {
        const completedNames =
          batchFiles.length > 0 ? batchFiles.map((f) => f.name) : fileName ? [fileName] : [];
        const completedError =
          transferPhase === 'error' ? useTransferStore.getState().transferError : null;
        navigate(`/complete/${roomId}`, {
          state: {
            phase: transferPhase,
            fileName,
            files: completedNames,
            error: completedError,
            previewUrl,
            fileType: useTransferStore.getState().fileType,
          },
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [transferPhase, roomId, navigate, fileName, batchFiles]);

  useEffect(() => {
    if (isSender && dataChannel && channelOpen && !hasStartedRef.current) {
      const files = getActiveFiles();
      if (files && files.length > 0) {
        hasStartedRef.current = true;
        setWaitingForFile(false);
        sendFiles(files);
      } else {
        const file = getActiveFile();
        if (file) {
          hasStartedRef.current = true;
          setWaitingForFile(false);
          sendFiles([file]);
        } else if (isResuming) {
          setWaitingForFile(true);
        }
      }
    }
  }, [isSender, dataChannel, channelOpen, sendFiles, isResuming]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && channelOpen) {
        setActiveFile(file);
        setWaitingForFile(false);
        hasStartedRef.current = true;
        sendFiles([file]);
      }
    },
    [channelOpen, sendFiles],
  );

  if (!dataChannel) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'} flex flex-col items-center justify-center p-4`}>
        <p className={theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}>Connection lost. Please restart.</p>
        <button className="mt-4 text-blue-500 underline" onClick={() => navigate('/')}>
          Go Home
        </button>
      </div>
    );
  }

  const formatSpeed = (bps: number) => {
    if (bps === 0) return '-- MB/s';
    const mbps = bps / 1024 / 1024;
    return mbps >= 1 ? `${mbps.toFixed(2)} MB/s` : `${(bps / 1024).toFixed(1)} KB/s`;
  };

  const formatEta = (ms: number) => {
    if (ms <= 0 || !isFinite(ms)) return '--';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    return `${minutes}m ${remSecs}s`;
  };

  const phaseText = () => {
    switch (transferPhase) {
      case 'hashing':
        return 'Hashing file...';
      case 'meta':
        return 'Exchanging metadata...';
      case 'transferring':
        return 'Transferring...';
      case 'verifying':
        return 'Verifying integrity...';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error';
      case 'cancelled':
        return 'Cancelled';
      default:
        return channelOpen ? 'Preparing...' : 'Waiting for connection...';
    }
  };

  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-slate-950' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const secondaryText = isDark ? 'text-slate-500' : 'text-slate-600';
  const cardBg = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-300 flex flex-col`}>
      {/* Header */}
      <div className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} px-6 py-4 flex justify-between items-center`}>
        <h2 className="text-xl font-bold">{isSender ? 'Sending' : 'Receiving'}</h2>
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Content */}
      <div className={`flex-1 flex items-center justify-center p-6`}>
        <div className={`rounded-2xl border ${cardBg} p-8 w-full max-w-lg`}>
          {/* File Info */}
          {totalFiles > 1 && (
            <p className={`text-sm ${secondaryText} text-center mb-2`}>
              File {currentFileIndex + 1} of {totalFiles}
            </p>
          )}
          {fileName && (
            <p className={`text-center font-medium mb-6 truncate text-lg`}>{fileName}</p>
          )}

          {/* Progress Section */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <span className={`text-sm font-medium ${secondaryText}`}>{phaseText()}</span>
              <span className={`text-sm font-bold ${
                transferPhase === 'complete'
                  ? 'text-green-500'
                  : transferPhase === 'error'
                    ? 'text-red-500'
                    : transferPhase === 'cancelled'
                      ? secondaryText
                      : 'text-blue-500'
              }`}>
                {Math.round(progress)}%
              </span>
            </div>

            <div className={`w-full rounded-full h-2 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  transferPhase === 'complete'
                    ? 'bg-green-500'
                    : transferPhase === 'error'
                      ? 'bg-red-500'
                      : transferPhase === 'cancelled'
                        ? isDark ? 'bg-slate-600' : 'bg-slate-400'
                        : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6`}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className={`text-xs font-semibold ${secondaryText} mb-1`}>Speed</p>
                <p className="font-mono font-bold">{formatSpeed(currentSpeed)}</p>
              </div>
              <div>
                <p className={`text-xs font-semibold ${secondaryText} mb-1`}>ETA</p>
                <p className="font-mono font-bold">{formatEta(etaMs)}</p>
              </div>
              <div>
                <p className={`text-xs font-semibold ${secondaryText} mb-1`}>Avg</p>
                <p className="font-mono font-bold">{formatSpeed(averageSpeed)}</p>
              </div>
              <div>
                <p className={`text-xs font-semibold ${secondaryText} mb-1`}>Chunks</p>
                <p className="font-mono font-bold">
                  {isSender ? chunksAcknowledged : chunksReceived}/{totalChunks}
                </p>
              </div>
            </div>
            {fileSize !== null && fileSize > 0 && (
              <p className={`text-xs ${secondaryText} pt-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                {formatFileSize(bytesTransferred)} / {formatFileSize(fileSize)}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className={`rounded-lg p-3 text-sm mb-6 ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          {/* Action Buttons */}
          {isTransferring && (
            <button
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              onClick={cancel}
            >
              Cancel Transfer
            </button>
          )}

          {waitingForFile && (
            <div className={`rounded-xl border-2 border-dashed p-6 text-center ${isDark ? 'border-blue-500/50 bg-blue-500/5' : 'border-blue-400 bg-blue-50'}`}>
              <p className={`font-semibold mb-2 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>Resume</p>
              <p className={`text-sm ${secondaryText} mb-4`}>Select file to continue</p>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                Select File
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Transfer;
