import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHistoryStore, type RoleFilter, type StatusFilter } from '../stores/historyStore';

function History() {
  const navigate = useNavigate();
  const {
    rawEntries,
    isLoading,
    filterRole,
    filterStatus,
    loadEntries,
    removeEntry,
    clearAll,
    setFilterRole,
    setFilterStatus,
  } = useHistoryStore();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filtered = useMemo(
    () =>
      rawEntries.filter((e) => {
        if (filterRole !== 'all' && e.role !== filterRole) return false;
        if (filterStatus !== 'all' && e.status !== filterStatus) return false;
        return true;
      }),
    [rawEntries, filterRole, filterStatus],
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusColors: Record<string, string> = {
    completed: 'text-green-400 bg-green-500/10',
    error: 'text-red-400 bg-red-500/10',
    cancelled: 'text-yellow-400 bg-yellow-500/10',
    interrupted: 'text-gray-400 bg-gray-500/10',
  };

  const statusLabels: Record<string, string> = {
    completed: 'Completed',
    error: 'Error',
    cancelled: 'Cancelled',
    interrupted: 'Interrupted',
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              className="text-gray-400 hover:text-white transition-colors"
              onClick={() => navigate('/')}
            >
              &larr; Back
            </button>
            <h1 className="text-2xl font-bold">Transfer History</h1>
          </div>
          {rawEntries.length > 0 && (
            <button
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
              onClick={() => setConfirmClear(true)}
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            className="bg-gray-800 text-sm rounded-lg px-3 py-1.5 border border-gray-700 text-gray-300 outline-none focus:border-blue-500 transition-colors"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as RoleFilter)}
          >
            <option value="all">All Roles</option>
            <option value="sender">Sender</option>
            <option value="receiver">Receiver</option>
          </select>
          <select
            className="bg-gray-800 text-sm rounded-lg px-3 py-1.5 border border-gray-700 text-gray-300 outline-none focus:border-blue-500 transition-colors"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {isLoading && (
          <div className="text-center text-gray-500 py-12 animate-fade-in">Loading...</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center text-gray-500 py-12 animate-fade-in">
            <p className="text-lg mb-2">No transfers yet</p>
            <p className="text-sm">Completed transfers will appear here</p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((entry, i) => (
            <div
              key={entry.id}
              className="bg-gray-900 rounded-lg p-4 flex items-center gap-4 transition-all duration-200 hover:bg-gray-800 hover:ring-1 hover:ring-gray-700 animate-slide-up"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{entry.fileName}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[entry.status] || 'text-gray-400'}`}
                  >
                    {statusLabels[entry.status] || entry.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{formatSize(entry.fileSize)}</span>
                  <span>{entry.role === 'sender' ? 'Sent' : 'Received'}</span>
                  <span>{formatDate(entry.startedAt)}</span>
                  {entry.chunksTransferred > 0 && entry.totalChunks > 0 && (
                    <span>{Math.round((entry.chunksTransferred / entry.totalChunks) * 100)}%</span>
                  )}
                </div>
              </div>
              <button
                className="text-gray-600 hover:text-red-400 text-sm transition-colors shrink-0"
                onClick={() => removeEntry(entry.id)}
                title="Delete entry and associated data"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        {confirmClear && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
            <div className="bg-gray-900 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-800 animate-scale-in">
              <h3 className="text-lg font-semibold mb-2">Clear all history?</h3>
              <p className="text-gray-400 text-sm mb-4">
                This will delete all transfer history entries. Associated checkpoint data will also
                be cleaned up.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all duration-200 active:scale-95"
                  onClick={() => {
                    clearAll();
                    setConfirmClear(false);
                  }}
                >
                  Clear
                </button>
                <button
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-all duration-200 active:scale-95"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default History;
