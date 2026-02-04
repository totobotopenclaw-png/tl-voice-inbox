import { useEventDetail } from '../hooks/useEvents';
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
  RotateCw
} from 'lucide-react';
import { formatDate } from '../utils/date';

interface EventDetailPanelProps {
  eventId: string;
  onClose: () => void;
}

const statusConfig = {
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
  needs_review: { 
    label: 'Needs Review', 
    color: 'text-yellow-400', 
    bgColor: 'bg-yellow-950',
    icon: HelpCircle 
  },
  error: { 
    label: 'Error', 
    color: 'text-red-400', 
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
  const { event, loading, error, refresh } = useEventDetail(eventId);

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

  const config = statusConfig[event.status];
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
                Expires: {formatDate(event.transcriptExpiresAt, { dateStyle: 'medium' })}
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

        {/* Jobs */}
        {event.jobs.length > 0 && (
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
