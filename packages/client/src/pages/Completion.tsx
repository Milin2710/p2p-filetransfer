import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

function isPreviewable(mime: string): boolean {
  return mime.startsWith('image/') || mime.startsWith('text/') || mime === 'application/pdf';
}

function Completion() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const state = location.state as {
    phase?: string;
    fileName?: string | null;
    files?: string[];
    error?: string | null;
    previewUrl?: string | null;
    fileType?: string;
  } | null;
  const previewUrlRef = useRef<string | null>(null);

  const phase = state?.phase || 'complete';
  const fileNames = state?.files;
  const errorMsg = state?.error;
  const previewUrl = state?.previewUrl;
  const fileType = state?.fileType || '';

  useEffect(() => {
    previewUrlRef.current = previewUrl || null;
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [previewUrl]);

  const formatList = (names: string[]) => {
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  };

  const canPreview = previewUrl && isPreviewable(fileType);

  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-slate-950' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const secondaryText = isDark ? 'text-slate-500' : 'text-slate-600';
  const cardBg = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const isSuccess = phase === 'complete';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-300 flex flex-col`}>
      {/* Header */}
      <div className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} px-6 py-4 flex justify-between items-center`}>
        <h2 className="text-xl font-bold">Transfer Result</h2>
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'}`}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className={`rounded-2xl border ${cardBg} p-8 w-full max-w-lg text-center`}>
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${
              isSuccess
                ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'
                : phase === 'error'
                  ? isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                  : isDark ? 'bg-slate-800' : 'bg-slate-200'
            }`}>
              {isSuccess ? '✓' : phase === 'error' ? '✕' : '⏸'}
            </div>
          </div>

          {/* Content */}
          {isSuccess && (
            <>
              <h3 className="text-2xl font-bold mb-3">Complete!</h3>
              <p className={`${secondaryText} mb-6`}>
                {fileNames && fileNames.length > 1
                  ? `${fileNames.length} files sent successfully`
                  : fileNames && fileNames.length === 1
                    ? `${fileNames[0]} sent successfully`
                    : 'File transferred successfully'}
              </p>
              {fileNames && fileNames.length > 1 && (
                <div className={`rounded-lg p-4 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6 text-left`}>
                  <p className={`text-xs font-semibold ${secondaryText} mb-2`}>FILES</p>
                  <p className="text-sm">{formatList(fileNames)}</p>
                </div>
              )}
            </>
          )}

          {phase === 'error' && (
            <>
              <h3 className="text-2xl font-bold mb-3">Transfer Failed</h3>
              <p className={`${secondaryText} mb-6`}>
                {errorMsg || 'An error occurred during transfer.'}
              </p>
            </>
          )}

          {phase === 'cancelled' && (
            <>
              <h3 className="text-2xl font-bold mb-3">Cancelled</h3>
              <p className={secondaryText}>The transfer was cancelled.</p>
            </>
          )}

          {/* Preview */}
          {canPreview && (
            <div className={`rounded-lg p-4 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-slate-200'} mb-6`}>
              <p className={`text-xs font-semibold ${secondaryText} mb-3`}>PREVIEW</p>
              {fileType.startsWith('image/') ? (
                <img
                  src={previewUrl!}
                  alt="Preview"
                  className="max-w-full max-h-64 mx-auto rounded object-contain"
                />
              ) : fileType === 'application/pdf' ? (
                <embed
                  src={previewUrl!}
                  type="application/pdf"
                  className="w-full h-64 rounded"
                />
              ) : (
                <PreviewText url={previewUrl!} isDark={isDark} />
              )}
            </div>
          )}

          {/* Button */}
          <button
            className={`w-full py-3 rounded-lg font-semibold transition-colors ${
              isSuccess
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : phase === 'error'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            onClick={() => navigate('/')}
          >
            Share Another File
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewText({ url, isDark }: { url: string; isDark: boolean }) {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    const abort = new AbortController();
    fetch(url, { signal: abort.signal })
      .then((r) => r.text())
      .then((t) => setText(t.slice(0, 5000)))
      .catch(() => {
        if (!abort.signal.aborted) setText('(unable to preview)');
      });
    return () => abort.abort();
  }, [url]);

  return (
    <pre className={`text-left text-xs max-h-96 overflow-auto whitespace-pre-wrap font-mono ${
      isDark
        ? 'text-gray-300 bg-slate-950 rounded-lg p-4'
        : 'text-slate-700 bg-slate-100 rounded-lg p-4'
    }`}>
      {text || 'Loading...'}
    </pre>
  );
}

export default Completion;
