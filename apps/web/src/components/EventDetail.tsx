import { useEventDetail } from '../hooks/useEvents';

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '') 
  : '';
import { 
  X, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText, 
  Sparkles,
  Mic,
  HelpCircle,
  RotateCw,
  FolderKanban,
  ArrowRight,
  Check,
  RefreshCw
} from 'lucide-react';
import { formatDate } from '../utils/date';
import { useState } from 'react';

interface EventDetailPanelProps {
  eventId: string;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  queued: { 
    label: 'Queued', 
    color: 'text-slate-400', 
    bgColor: 'bg-slate-900',
    icon: Clock 
  },
  transcribing: { 
    label: 'Transcribing', 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-950',
    icon: Mic 
  },
  transcribed: { 
    label: 'Transcribed', 
    color: 'text-blue-300', 
    bgColor: 'bg-blue-950',
    icon: FileText 
  },
  processing: { 
    label: 'Processing', 
    color: 'text-purple-400', 
    bgColor: 'bg-purple-950',
    icon: Sparkles 
  },
  processed: { 
    label: 'Processed', 
    color: 'text-green-400', 
    bgColor: 'bg-green-950',
    icon: CheckCircle2 
  },
  completed: { 
    label: 'Completed', 
    color: 'text-green-400', 
    bgColor: 'bg-green-950',
    icon: CheckCircle2 
  },
  needs_review: { 
    label: 'Needs Review', 
    color: 'text-amber-400', 
    bgColor: 'bg-amber-950',
    icon: HelpCircle 
  },
  error: { 
    label: 'Error', 
    color: 'text-red-400', 
    bgColor: 'bg-red-950',
    icon: AlertCircle 
  },
  failed: { 
    label: 'Failed', 
    color: 'text-red-500', 
    bgColor: 'bg-red-950',
    icon: AlertCircle 
  },
};

const jobStatusConfig = {
  pending: { label: 'Pending', color: 'text-slate-400' },
  running: { label: 'Running', color: 'text-blue-400' },
  completed: { label: 'Completed', color: 'text-green-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
  retry: { label: 'Retry', color: 'text-yellow-400' },
};

export function EventDetailPanel({ eventId, onClose }: EventDetailPanelProps) {
  const { event, loading, error, refresh, retry } = useEventDetail(eventId);
  const [selectedEpic, setSelectedEpic] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleResolve = async (epicId: string | null) => {
    setResolving(true);
    try {
      const response = await fetch(`${API_URL}/api/events/${eventId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve');
      }
      
      refresh();
    } catch (err) {
      alert('Failed to resolve: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setResolving(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } catch (err) {
      alert('Failed to retry: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setRetrying(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-emerald-500';
    if (confidence >= 0.5) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={32} className="text-red-400 mb-3" />
        <p className="text-red-400 mb-3">{error || 'Event not found'}</p>
        <button
          onClick={refresh}
          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <RotateCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const config = statusConfig[event.status] || statusConfig.error || { 
    label: 'Unknown', 
    color: 'text-slate-400', 
    bgColor: 'bg-slate-900',
    icon: AlertCircle 
  };
  const StatusIcon = config.icon;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bgColor}`}>
            <StatusIcon size={20} className={config.color} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200">Event Details</h3>
            <p className={`text-sm ${config.color}`}>{config.label}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Event Info */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Event ID</span>
            <span className="text-slate-300 font-mono">{event.id}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Created</span>
            <span className="text-slate-300">{formatDate(event.createdAt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Updated</span>
            <span className="text-slate-300">{formatDate(event.updatedAt)}</span>
          </div>
          {event.detectedCommand && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Command</span>
              <span className="text-blue-400">{event.detectedCommand}</span>
            </div>
          )}
        </div>

        {/* Assigned Epic */}
        {event.assignedEpic && (
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300 flex items-center gap-2">
              <FolderKanban size={16} /> Assigned Epic
            </h4>
            <div className="bg-emerald-950/30 border border-emerald-900 rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                <FolderKanban size={16} className="text-emerald-400" />
              </div>
              <span className="text-emerald-200 font-medium">{event.assignedEpic.title}</span>
            </div>
          </div>
        )}

        {/* Candidates (for needs_review status) */}
        {event.status === 'needs_review' && event.candidates && event.candidates.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300 flex items-center gap-2">
              <HelpCircle size={16} /> Candidate Epics
            </h4>
            <div className="space-y-2">
              {event.candidates.map((candidate) => (
                <button
                  key={candidate.epicId}
                  onClick={() => setSelectedEpic(candidate.epicId)}
                  disabled={resolving}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    selectedEpic === candidate.epicId
                      ? 'bg-primary-600/10 border-primary-500/50'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FolderKanban size={14} className="text-slate-400" />
                    <span className="text-sm text-slate-200">{candidate.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getConfidenceColor(candidate.confidence)}`}
                        style={{ width: `${candidate.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">
                      {Math.round(candidate.confidence * 100)}%
                    </span>
                    {selectedEpic === candidate.epicId && (
                      <Check size={14} className="text-primary-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            
            {/* Resolve Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleResolve(selectedEpic)}
                disabled={!selectedEpic || resolving}
                className="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
              >
                {resolving && <Loader2 size={14} className="animate-spin" />}
                Assign & Reprocess
              </button>
              <button
                onClick={() => handleResolve(null)}
                disabled={resolving}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
              >
                No Epic
              </button>
            </div>
          </div>
        )}

        {/* Transcript */}
        {event.transcript ? (
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300 flex items-center gap-2">
              <FileText size={16} /> Transcript
            </h4>
            <div className="bg-slate-900 rounded-lg p-3 text-sm text-slate-300 whitespace-pre-wrap">
              {event.transcript}
            </div>
            {event.transcriptExpiresAt && (
              <p className="text-xs text-slate-500">
                Expires: {formatDate(event.transcriptExpiresAt)}
              </p>
            )}
          </div>
        ) : event.status === 'queued' || event.status === 'transcribing' ? (
          <div className="bg-slate-900 rounded-lg p-6 text-center">
            <Loader2 size={20} className="animate-spin mx-auto mb-2 text-blue-400" />
            <p className="text-sm text-slate-400">Transcription in progress...</p>
          </div>
        ) : null}

        {/* Status Reason */}
        {event.statusReason && (
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300">Status Details</h4>
            <div className="bg-yellow-950/30 border border-yellow-900 rounded-lg p-3 text-sm text-yellow-200">
              {event.statusReason}
            </div>
          </div>
        )}

        {/* Retry Button for Failed Events */}
        {event.status === 'failed' && (
          <div className="space-y-2">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
            >
              {retrying && <Loader2 size={16} className="animate-spin" />}
              <RefreshCw size={16} />
              {retrying ? 'Retrying...' : 'Retry Processing'}
            </button>
            <p className="text-xs text-slate-500 text-center">
              This will re-run the extraction with updated settings
            </p>
          </div>
        )}

        {/* Jobs */}
        {event.jobs?.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300">Processing Jobs</h4>
            <div className="space-y-2">
              {event.jobs.map((job) => {
                const jobStatus = jobStatusConfig[job.status];
                return (
                  <div 
                    key={job.id} 
                    className="bg-slate-900 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-300 uppercase">
                        {job.type}
                      </span>
                      <span className={`text-xs ${jobStatus.color}`}>
                        {jobStatus.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {job.attempts}/{job.maxAttempts} attempts
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
