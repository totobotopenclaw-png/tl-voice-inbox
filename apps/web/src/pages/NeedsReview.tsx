import { useState, useEffect } from 'react'
import { HelpCircle, AlertTriangle, Check, X, FolderKanban, Loader2 } from 'lucide-react'
import { API_URL } from '../hooks/useEvents'

interface AmbiguousEvent {
  id: string
  transcript: string
  status: string
  detectedCommand: string | null
  createdAt: string
  candidates: Array<{
    epicId: string
    title: string
    confidence: number
  }>
}

export function NeedsReview() {
  const [events, setEvents] = useState<AmbiguousEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEpics, setSelectedEpics] = useState<Record<string, string>>({})
  const [resolving, setResolving] = useState<Record<string, boolean>>({})

  // Fetch needs_review events
  const fetchEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/events?status=needs_review`)
      if (!response.ok) throw new Error('Failed to fetch events')
      const data = await response.json()
      
      // Fetch candidates for each event
      const eventsWithCandidates = await Promise.all(
        data.events.map(async (event: { id: string; transcript: string; status: string; detectedCommand: string | null; createdAt: string }) => {
          try {
            const candidatesRes = await fetch(`${API_URL}/api/events/${event.id}/candidates`)
            const candidatesData = await candidatesRes.json()
            return {
              ...event,
              candidates: candidatesData.candidates || [],
            }
          } catch {
            return {
              ...event,
              candidates: [],
            }
          }
        })
      )
      
      setEvents(eventsWithCandidates)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchEvents, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleResolve = async (eventId: string, epicId: string | null) => {
    setResolving(prev => ({ ...prev, [eventId]: true }))
    
    try {
      const response = await fetch(`${API_URL}/api/events/${eventId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to resolve event')
      }
      
      // Remove from list (optimistic update)
      setEvents(events.filter(e => e.id !== eventId))
    } catch (err) {
      alert('Failed to resolve: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setResolving(prev => ({ ...prev, [eventId]: false }))
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-emerald-500'
    if (confidence >= 0.5) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Needs Review</h1>
          <p className="text-slate-500 mt-1">Ambiguous events that need manual epic assignment</p>
        </div>
        <span className="px-3 py-1 bg-amber-500/10 text-amber-400 rounded-full text-sm font-medium">
          {events.length} pending
        </span>
      </div>

      {loading && events.length === 0 && (
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Loading events...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-16 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle size={48} className="mx-auto text-red-400 mb-4" />
          <p className="text-red-400">{error}</p>
          <button 
            onClick={fetchEvents}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Check size={48} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-200">All caught up!</h3>
          <p className="text-slate-500">No ambiguous events need review</p>
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-4">
          {events.map((event) => (
            <div key={event.id} className="bg-slate-900 border border-amber-500/20 rounded-xl p-6">
              {/* Evidence */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">Ambiguous Event</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-sm text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
                  {event.detectedCommand && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-400">
                        {event.detectedCommand}
                      </span>
                    </>
                  )}
                </div>
                
                <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
                  <p className="text-slate-300 italic">"{event.transcript}"</p>
                </div>
              </div>

              {/* Candidate Epics */}
              {event.candidates.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-slate-400 mb-3">Suggested Epics</h4>
                  <div className="space-y-2">
                    {event.candidates.map((candidate) => (
                      <button
                        key={candidate.epicId}
                        onClick={() => setSelectedEpics({ ...selectedEpics, [event.id]: candidate.epicId })}
                        disabled={resolving[event.id]}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors disabled:opacity-50 ${
                          selectedEpics[event.id] === candidate.epicId
                            ? 'bg-primary-600/10 border-primary-500/50'
                            : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <FolderKanban size={16} className="text-slate-400" />
                          <span className="font-medium text-slate-200">{candidate.title}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getConfidenceColor(candidate.confidence)}`}
                              style={{ width: `${candidate.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-slate-500 w-12 text-right">
                            {Math.round(candidate.confidence * 100)}%
                          </span>
                          
                          {selectedEpics[event.id] === candidate.epicId && (
                            <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {event.candidates.length === 0 && (
                <div className="mb-6 bg-slate-800/50 rounded-lg p-4 border border-slate-800">
                  <p className="text-sm text-slate-500">
                    No epic candidates found. This may be a standalone event.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleResolve(event.id, selectedEpics[event.id])}
                  disabled={!selectedEpics[event.id] || resolving[event.id]}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2"
                >
                  {resolving[event.id] && <Loader2 size={16} className="animate-spin" />}
                  Assign & Reprocess
                </button>
                
                <button
                  onClick={() => handleResolve(event.id, null)}
                  disabled={resolving[event.id]}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                >
                  No Epic (Standalone)
                </button>
                
                <button 
                  onClick={() => {
                    // Dismiss - just remove from UI for now
                    setEvents(events.filter(e => e.id !== event.id))
                  }}
                  disabled={resolving[event.id]}
                  className="px-4 py-2 text-slate-500 hover:text-slate-300 disabled:opacity-50 text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
