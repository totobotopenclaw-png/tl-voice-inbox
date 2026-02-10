import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecordButton } from '../components/RecordButton';
import { EventsTimeline } from '../components/EventsTimeline';
import { EventDetailPanel } from '../components/EventDetail';
import { useBriefing } from '../hooks/useBriefing';
import type { BriefingBlocker, BriefingAction, EpicHealth } from '../hooks/useBriefing';
import { AlertTriangle, Clock, HelpCircle, ChevronDown, ChevronUp, CheckCircle2, CalendarClock, List, CalendarDays, FolderKanban } from 'lucide-react';

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

const priorityBg: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-400',
  P1: 'bg-amber-500/20 text-amber-400',
  P2: 'bg-slate-700 text-slate-400',
};

function getRelativeDay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDay(items: BriefingAction[]): Map<string, BriefingAction[]> {
  const groups = new Map<string, BriefingAction[]>();
  for (const item of items) {
    const day = getRelativeDay(item.dueAt);
    const existing = groups.get(day) || [];
    existing.push(item);
    groups.set(day, existing);
  }
  return groups;
}

export function Dashboard() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const { briefing, loading, refresh } = useBriefing();
  const navigate = useNavigate();

  const handleResolveBlocker = async (id: string, type: 'blocker' | 'dependency') => {
    const endpoint = type === 'blocker' ? 'blockers' : 'dependencies';
    try {
      await fetch(`${API_URL}/api/${endpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      refresh();
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  const handleSnoozeBlocker = async (id: string, type: 'blocker' | 'dependency', days: number) => {
    const endpoint = type === 'blocker' ? 'blockers' : 'dependencies';
    const until = new Date();
    until.setDate(until.getDate() + days);
    try {
      await fetch(`${API_URL}/api/${endpoint}/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ until: until.toISOString() }),
      });
      refresh();
    } catch (err) {
      console.error('Failed to snooze:', err);
    }
  };

  const navigateToItem = (item: BriefingAction) => {
    if (item.epicId) {
      navigate(`/epics?open=${item.epicId}`);
    } else {
      navigate('/actions');
    }
  };

  const hasAttentionItems = briefing && (
    briefing.overdue.length > 0 ||
    briefing.dueToday.length > 0 ||
    briefing.staleBlockers.length > 0 ||
    briefing.needsReviewCount > 0 ||
    briefing.upcomingThisWeek.length > 0 ||
    briefing.epicHealth.length > 0
  );

  return (
    <div className="min-h-screen bg-slate-950 pt-safe">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 safe-area-inset-top">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {hasAttentionItems ? "Here's what needs attention" : 'All clear'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {briefing ? `${briefing.counts.openActions} open actions, ${briefing.counts.openBlockers} open blockers` : 'Loading...'}
          </p>
        </header>

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-500">Loading briefing...</p>
          </div>
        ) : briefing ? (
          <div className="space-y-6">
            {/* Overdue + Due Today row */}
            {(briefing.overdue.length > 0 || briefing.dueToday.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Overdue */}
                {briefing.overdue.length > 0 && (
                  <div className="bg-slate-900 border border-red-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={16} className="text-red-400" />
                      <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide">
                        Overdue ({briefing.overdue.length})
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {briefing.overdue.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => navigateToItem(item)}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityBg[item.priority] || priorityBg.P2}`}>
                            {item.priority}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-slate-200 truncate block">{item.title}</span>
                            {item.epicTitle && (
                              <span className="text-xs text-primary-400 truncate block">{item.epicTitle}</span>
                            )}
                          </div>
                          <span className="text-xs text-red-400 whitespace-nowrap">{item.daysOverdue}d late</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Due Today */}
                {briefing.dueToday.length > 0 && (
                  <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock size={16} className="text-amber-400" />
                      <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
                        Due Today ({briefing.dueToday.length})
                      </h2>
                    </div>
                    <div className="space-y-2">
                      {briefing.dueToday.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => navigateToItem(item)}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                        >
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityBg[item.priority] || priorityBg.P2}`}>
                            {item.priority}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-slate-200 truncate block">{item.title}</span>
                            {item.epicTitle && (
                              <span className="text-xs text-primary-400 truncate block">{item.epicTitle}</span>
                            )}
                          </div>
                          {item.dueAt && (
                            <span className="text-xs text-amber-400 whitespace-nowrap">
                              {new Date(item.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upcoming This Week */}
            {briefing.upcomingThisWeek.length > 0 && (
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays size={16} className="text-blue-400" />
                  <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">
                    Upcoming This Week ({briefing.upcomingThisWeek.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {Array.from(groupByDay(briefing.upcomingThisWeek)).map(([day, items]) => (
                    <div key={day}>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">{day}</p>
                      <div className="space-y-1.5">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => navigateToItem(item)}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                          >
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityBg[item.priority] || priorityBg.P2}`}>
                              {item.priority}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-slate-200 truncate block">{item.title}</span>
                              {item.epicTitle && (
                                <span className="text-xs text-primary-400 truncate block">{item.epicTitle}</span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 whitespace-nowrap">
                              {new Date(item.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Epic Health */}
            {briefing.epicHealth.length > 0 && (
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FolderKanban size={16} className="text-primary-400" />
                  <h2 className="text-sm font-semibold text-primary-400 uppercase tracking-wide">
                    Epics Needing Attention
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {briefing.epicHealth.map((epic: EpicHealth) => (
                    <div
                      key={epic.id}
                      onClick={() => navigate(`/epics?open=${epic.id}`)}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-slate-600 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          epic.overdueActions > 0 ? 'bg-red-400' :
                          epic.openBlockers > 0 ? 'bg-amber-400' :
                          'bg-emerald-400'
                        }`} />
                        <span className="text-sm font-medium text-slate-200 truncate">{epic.title}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {epic.overdueActions > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/15 text-red-400">
                            {epic.overdueActions} overdue
                          </span>
                        )}
                        {epic.openBlockers > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400">
                            {epic.openBlockers} blocker{epic.openBlockers !== 1 ? 's' : ''}
                          </span>
                        )}
                        {epic.openDeps > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/15 text-blue-400">
                            {epic.openDeps} dep{epic.openDeps !== 1 ? 's' : ''}
                          </span>
                        )}
                        {epic.dueTodayActions > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300">
                            {epic.dueTodayActions} due today
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stale Blockers */}
            {briefing.staleBlockers.length > 0 && (
              <div className="bg-slate-900 border border-amber-500/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
                    Stale Blockers ({briefing.staleBlockers.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {briefing.staleBlockers.map((blocker: BriefingBlocker) => (
                    <div key={blocker.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200">{blocker.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            {blocker.epicTitle && (
                              <span
                                className={`text-primary-400 ${blocker.epicId ? 'hover:text-primary-300 cursor-pointer hover:underline' : ''}`}
                                onClick={(e) => {
                                  if (blocker.epicId) {
                                    e.stopPropagation();
                                    navigate(`/epics?open=${blocker.epicId}`);
                                  }
                                }}
                              >
                                {blocker.epicTitle}
                              </span>
                            )}
                            {blocker.owner && <span>Owner: {blocker.owner}</span>}
                            {blocker.eta && (
                              <span className={new Date(blocker.eta) < new Date() ? 'text-red-400' : ''}>
                                ETA: {new Date(blocker.eta).toLocaleDateString()}
                              </span>
                            )}
                            <span>{blocker.daysSinceUpdate}d stale</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleResolveBlocker(blocker.id, blocker.type)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-xs font-medium transition-colors"
                        >
                          <CheckCircle2 size={12} />
                          Resolve
                        </button>
                        <button
                          onClick={() => handleSnoozeBlocker(blocker.id, blocker.type, 1)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          <CalendarClock size={12} />
                          +1d
                        </button>
                        <button
                          onClick={() => handleSnoozeBlocker(blocker.id, blocker.type, 3)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          <CalendarClock size={12} />
                          +3d
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Needs Review + Recent Events summary row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {briefing.needsReviewCount > 0 && (
                <div
                  onClick={() => navigate('/needs-review')}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle size={16} className="text-amber-400" />
                    <h2 className="text-sm font-medium text-slate-300">Needs Review</h2>
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                      {briefing.needsReviewCount}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {briefing.needsReviewCount} event{briefing.needsReviewCount !== 1 ? 's' : ''} need epic assignment
                  </p>
                </div>
              )}

              {briefing.recentEvents.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <List size={16} className="text-slate-400" />
                    <h2 className="text-sm font-medium text-slate-300">Recently Captured</h2>
                    <span className="ml-auto text-xs text-slate-500">{briefing.recentEvents.length} today</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {briefing.recentEvents.slice(0, 3).map((evt) => (
                      <p key={evt.id} className="text-xs text-slate-500 truncate">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          evt.status === 'completed' ? 'bg-emerald-400' :
                          evt.status === 'needs_review' ? 'bg-amber-400' :
                          evt.status === 'failed' ? 'bg-red-400' :
                          'bg-blue-400'
                        }`} />
                        {evt.transcriptPreview || `Event ${evt.id.substring(0, 8)}`}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Record Button */}
            <div className="bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-800">
              <div className="flex flex-col items-center">
                <RecordButton size="lg" />
              </div>
            </div>

            {/* Collapsible Events Timeline */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <button
                onClick={() => setShowTimeline(!showTimeline)}
                className="w-full p-3 sm:p-4 border-b border-slate-800 flex items-center gap-2 hover:bg-slate-800 transition-colors"
              >
                <List size={16} className="text-slate-400" />
                <span className="font-semibold text-slate-200 text-sm sm:text-base">Events Timeline</span>
                <span className="ml-auto text-slate-500">
                  {showTimeline ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {showTimeline && (
                <div className="p-3 sm:p-4">
                  {selectedEventId ? (
                    <EventDetailPanel
                      eventId={selectedEventId}
                      onClose={() => setSelectedEventId(null)}
                    />
                  ) : (
                    <EventsTimeline
                      onEventClick={setSelectedEventId}
                      selectedEventId={selectedEventId}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
