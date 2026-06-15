import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { connectSocket } from '../services/socket';
import { useRoomStore } from '../stores/roomStore';
import { useWebRTC } from '../hooks/useWebRTC';
import {
  setActiveDataChannel,
  getActiveDataChannel,
  setEncryptionKey,
  setResumeAfterConnect,
  getResumeAfterConnect,
  getActiveFile,
} from '../services/data-channel-registry';
import { importKey } from '../services/encryption';
import { getCheckpoint, deleteRoomChunks } from '../services/checkpoint-store';
import { useResumeStore } from '../stores/resumeStore';
import ResumePrompt from '../components/ResumePrompt';
import QRCode from '../components/QRCode';

function keyFingerprint(hash: string): string | null {
  const match = hash.match(/key=([A-Za-z0-9+/=]+)/);
  if (!match) return null;
  try {
    const raw = atob(match[1]);
    const hex = Array.from(raw)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 4).toUpperCase()} ${hex.slice(4, 8).toUpperCase()} ${hex.slice(8, 12).toUpperCase()} ${hex.slice(12, 16).toUpperCase()}`;
  } catch {
    return null;
  }
}

function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const hasJoinedRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const webrtcSignalingCleanupRef = useRef<(() => void) | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const fileState = location.state as {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    files?: { fileName: string; fileSize: number; fileType: string }[];
  } | null;
  const isSender = !!(fileState?.fileName || fileState?.files);
  const roomIdFull = roomId || '';

  const { roomPhase, roomError, peerConnected } = useRoomStore();
  const { setRoomPhase, setPeerConnected, setRoomError } = useRoomStore();

  const onDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      setActiveDataChannel(channel);
      hasNavigatedRef.current = true;
      const navState: Record<string, unknown> = { isResuming: getResumeAfterConnect() };
      if (fileState?.files && fileState.files.length > 0) {
        navState.files = fileState.files;
      } else if (fileState?.fileName) {
        navState.fileName = fileState.fileName;
        navState.fileSize = fileState.fileSize;
        navState.fileType = fileState.fileType;
      }
      navigate(`/transfer/${roomIdFull}`, { state: navState });
    },
    [roomIdFull, navigate, fileState],
  );

  const { startConnection, error, cleanup } = useWebRTC({
    roomId: roomIdFull,
    isSender,
    onDataChannel,
  });

  useEffect(() => {
    if (!roomIdFull) return;
    getCheckpoint(roomIdFull).then((cp) => {
      if (cp && cp.lastReceivedChunk > 0) {
        useResumeStore.getState().setResumableTransfer({
          role: cp.role,
          fileName: cp.fileName,
          fileSize: cp.fileSize,
          totalChunks: cp.totalChunks,
          lastReceivedChunk: cp.lastReceivedChunk,
          lastActivity: cp.timestamp,
        });
      }
    });
  }, [roomIdFull]);

  const handleResume = useCallback(() => {
    setResumeAfterConnect(true);
  }, []);

  const { resumeAction } = useResumeStore();

  useEffect(() => {
    if (!roomIdFull || hasJoinedRef.current) return;

    const socket = connectSocket();
    if (!socket.connected) socket.connect();

    setRoomPhase('waiting');
    setRoomError(null);
    hasJoinedRef.current = true;

    if (!isSender) {
      startConnection().then((signalingCleanup) => {
        if (signalingCleanup) webrtcSignalingCleanupRef.current = signalingCleanup;
      });
    }

    console.log('[ROOM]', 'isSender=', isSender, 'fileState=', fileState, 'room=', roomIdFull);

    if (!isSender) {
      console.log('[EMIT JOIN]', roomIdFull);
      socket.emit('join-room', { roomId: roomIdFull });
    }

    const handlePeerJoined = async () => {
      setPeerConnected(true);
      setRoomPhase('connecting');
      if (isSender) {
        if (webrtcSignalingCleanupRef.current) {
          webrtcSignalingCleanupRef.current();
          webrtcSignalingCleanupRef.current = null;
        }
        const signalingCleanup = await startConnection();
        if (signalingCleanup) webrtcSignalingCleanupRef.current = signalingCleanup;
      }
    };

    const handleRoomJoined = (data: { roomId: string; peerCount: number }) => {
      if (!isSender && data.peerCount >= 2) {
        setPeerConnected(true);
        setRoomPhase('connecting');
      }
    };

    const handleRoomError = (data: { code: string; message: string }) => {
      setRoomError(data.message);
    };

    const handleRoomExpired = () => {
      setRoomPhase('expired');
    };

    socket.on('peer-joined', handlePeerJoined);
    socket.on('room-joined', handleRoomJoined);
    socket.on('room-error', handleRoomError);
    socket.on('room-expired', handleRoomExpired);

    return () => {
      socket.off('peer-joined', handlePeerJoined);
      socket.off('room-joined', handleRoomJoined);
      socket.off('room-error', handleRoomError);
      socket.off('room-expired', handleRoomExpired);
      if (webrtcSignalingCleanupRef.current) {
        webrtcSignalingCleanupRef.current();
        webrtcSignalingCleanupRef.current = null;
      }
      if (!hasNavigatedRef.current) {
        cleanup();
      }
    };
  }, [roomIdFull, isSender, startConnection, cleanup]);

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/key=([A-Za-z0-9+/=]+)/);
    if (match) {
      importKey(match[1]).then(setEncryptionKey);
    }
  }, []);

  const copyRoomLink = useCallback(() => {
    const link = `${window.location.origin}/room/${roomIdFull}${window.location.hash}`;
    navigator.clipboard.writeText(link);
  }, [roomIdFull]);

  const status = () => {
    if (roomPhase === 'expired')
      return { text: 'Room expired', color: 'text-red-500', dot: 'bg-red-500' };
    if (error || roomError)
      return { text: error || roomError || 'Error', color: 'text-red-500', dot: 'bg-red-500' };
    if (roomPhase === 'connected')
      return { text: 'Connected', color: 'text-green-500', dot: 'bg-green-500' };
    if (peerConnected)
      return {
        text: 'Peer connected, connecting...',
        color: 'text-amber-500',
        dot: 'bg-amber-500 animate-pulse',
      };
    if (roomPhase === 'waiting')
      return {
        text: 'Waiting for peer...',
        color: 'text-amber-500',
        dot: 'bg-amber-500 animate-pulse',
      };
    if (roomPhase === 'connecting')
      return {
        text: 'Connecting...',
        color: 'text-amber-500',
        dot: 'bg-amber-500 animate-pulse',
      };
    return { text: 'Initializing...', color: 'text-slate-400', dot: 'bg-slate-400' };
  };

  const fingerprint = keyFingerprint(window.location.hash);
  const s = status();

  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-slate-950' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const secondaryText = isDark ? 'text-slate-500' : 'text-slate-600';
  const cardBg = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';

  if (roomPhase === 'connecting') {
    return (
      <div className={`min-h-screen ${bgClass} ${textClass} flex items-center justify-center`}>
        <div className="text-center">
          <div className="mb-4">
            <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-blue-500 animate-spin mx-auto"></div>
          </div>
          <p className="font-medium">Establishing connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-300 flex flex-col`}>
      {/* Header */}
      <div className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} px-6 py-4 flex justify-between items-center`}>
        <h2 className="text-xl font-bold">Waiting for Peer</h2>
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
          {/* Status */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'} w-full justify-center mb-8`}>
            <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`}></div>
            <span className={`text-sm font-medium ${s.color}`}>{s.text}</span>
          </div>

          {/* Icon */}
          <div className="text-6xl text-center mb-6">
            {isSender ? '📤' : '📥'}
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold text-center mb-2">
            {isSender ? 'Share Link' : 'Joining...'}
          </h3>
          <p className={`${secondaryText} text-center text-sm mb-8`}>
            {isSender
              ? 'Share with the receiver to start transfer'
              : 'Waiting for sender to join'}
          </p>

          {/* Copy Link */}
          {isSender && (
            <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6`}>
              <p className={`text-xs font-semibold ${secondaryText} mb-2`}>LINK</p>
              <div className="flex gap-2">
                <code className={`flex-1 text-sm font-mono truncate ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  {`${window.location.origin}/room/${roomIdFull}`}
                </code>
                <button
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors active:scale-95"
                  onClick={copyRoomLink}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* QR Code */}
          {isSender && (
            <div className={`rounded-xl p-4 ${isDark ? 'bg-white' : 'bg-slate-50'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6 flex flex-col items-center`}>
              <p className={`text-xs font-semibold ${secondaryText} mb-3`}>SCAN</p>
              <QRCode
                text={`${window.location.origin}/room/${roomIdFull}${window.location.hash}`}
              />
            </div>
          )}

          {/* File Info */}
          {isSender && fileState && (
            <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6`}>
              <p className={`text-xs font-semibold ${secondaryText} mb-2`}>SENDING</p>
              {fileState.files && fileState.files.length > 1 ? (
                <p className="text-sm font-medium">{fileState.files.length} files</p>
              ) : fileState.fileName ? (
                <p className="text-sm font-medium truncate">{fileState.fileName}</p>
              ) : null}
            </div>
          )}

          {/* Fingerprint */}
          {fingerprint && (
            <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6`}>
              <p className={`text-xs font-semibold ${secondaryText} mb-2`}>ENCRYPTION KEY</p>
              <code className={`text-xs font-mono tracking-widest select-all ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {fingerprint}
              </code>
            </div>
          )}

          {/* Cancel Button */}
          <button
            className={`w-full py-2.5 rounded-lg font-medium transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200'}`}
            onClick={() => navigate('/')}
          >
            Cancel
          </button>

          {resumeAction === 'prompt' && roomIdFull && (
            <ResumePrompt roomId={roomIdFull} onResume={handleResume} />
          )}
        </div>
      </div>
    </div>
  );
}

export default Room;
