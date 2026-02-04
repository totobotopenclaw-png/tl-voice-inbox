import { useState } from 'react';
import { useEvents, Event, EventDetail } from '../hooks/useEvents';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Mic,
  FileText,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { formatDistanceToNow } from '../utils/date';

interface EventsTimelineProps {
  onEventClick?: (eventId: string) => void;
  selectedEventId?: string | null;
}

const statusConfig: Record<Event['status'], { label: string; color: string; icon: React.ReactNode }> = {
  queued: { 
    label: 'Queued', 
    color: 'text-slate-400', 
    icon: <Clock size={14} /> 
  },
  transcribing: { 
    label: 'Transcribing', 
    color: 'text-blue-400', 
    icon: <Mic size={14} className="animate-pulse" /> 
  },
  transcribed: { 
    label: 'Transcribed', 
    color: 'text-blue-300', 
    icon: <FileText size={14} /> 
  },
  processing: { 
    label: 'Processing', 
    color: 'text-purple-400', 
    icon: <Sparkles size={14} className="animate-pulse" /> 
  },
  processed: { 
    label: 'Processed', 
    color: 'text-green-400', 
    icon: <CheckCircle2 size={14} /> 
  },
  needs_review: { 
    label: 'Needs Review', 
    color: 'text-yellow-400', 
    icon: <HelpCircle size={14} /> 
  },
  error: { 
    label: 'Error', 
    color: 'text-red-400', 
    icon: <AlertCircle size={14} /> 
  },
};

function EventItem({ 
  event, 
  isSelected, 
  onClick 
}: { 
  event: Event; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = statusConfig[event.status];
  
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border transition-all duration-200
        ${isSelected 
          ? 'bg-slate-800 border-blue-500 ring-1 ring-blue-500' 
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
        }
      `}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`${config.color} flex-shrink-0`}>{config.icon}</span>
          <span className={`font-medium text-sm truncate ${config.color}`}>
            {config.label}
          </span>
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">
          {formatDistanceToNow(event.createdAt)}
        </span>
      </div>
      
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <span className="font-mono">{event.id.slice(0, 8)}...</span>
        {event.detectedCommand && (
          <span className="text-blue-400">• {event.detectedCommand}</span>
        )}
        {event.hasTranscript && (
          <span className="text-green-400">• Has transcript</span>
        )}
      </div>
    </button>
  );
}

export function EventsTimeline({ onEventClick, selectedEventId }: EventsTimelineProps) {
  const { events, loading, error, pagination, refresh, loadMore } = useEvents(20);
  const [showAll, setShowAll] = useState(false);

  const displayedEvents = showAll ? events : events.slice(0, 5);

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading events...
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-red-400 mb-3">{error}</p>
        <button
          onClick={refresh}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500">
        <Mic size={32} className="mx-auto mb-3 opacity-50" />
        <p>No events yet</p>
        <p className="text-sm mt-1">Tap the record button to create your first event</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-200">Recent Events</h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-2">
        {displayedEvents.map((event) => (
          <EventItem
            key={event.id}
            event={event}
            isSelected={event.id === selectedEventId}
            onClick={() => onEventClick?.(event.id)}
          />
        ))}
      </div>

      {(events.length > 5 || pagination?.hasMore) && (
        <button
          onClick={() => {
            if (pagination?.hasMore && showAll) {
              loadMore();
            } else {
              setShowAll(!showAll);
            }
          }}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1 transition-colors"
        >
          {pagination?.hasMore && showAll ? (
            <>Load more <ChevronDown size={14} /></>
          ) : showAll ? (
            <>Show less <ChevronUp size={14} /></>
          ) : (
            <>Show all ({events.length}) <ChevronDown size={14} /></>
          )}
        </button>
      )}
    </div>
  );
}
