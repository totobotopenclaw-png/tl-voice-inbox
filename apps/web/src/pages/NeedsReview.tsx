import { useState } from 'react'
import { HelpCircle, AlertTriangle, Check, X, FolderKanban } from 'lucide-react'

const mockAmbiguousEvents = [
  {
    id: '1',
    transcript: 'Necesito revisar el tema de los bookings, hay un problema con las fechas que se están guardando mal',
    detectedEpics: [
      { id: 'bookings-api', name: 'Bookings API', confidence: 0.65 },
      { id: 'payment-flow', name: 'Payment Flow', confidence: 0.45 },
    ],
    suggestedCommand: 'issue',
    created_at: '2026-02-04T10:30:00Z',
  },
  {
    id: '2',
    transcript: 'Update sobre el CP33, ya está listo el componente de filtros',
    detectedEpics: [
      { id: 'cp33', name: 'CP33 Dashboard', confidence: 0.92 },
      { id: 'ui-refresh', name: 'UI Refresh', confidence: 0.30 },
    ],
    suggestedCommand: 'epic_update',
    created_at: '2026-02-03T16:00:00Z',
  },
]

const mockEpics = [
  { id: 'bookings-api', name: 'Bookings API' },
  { id: 'payment-flow', name: 'Payment Flow' },
  { id: 'cp33', name: 'CP33 Dashboard' },
  { id: 'ui-refresh', name: 'UI Refresh' },
  { id: 'auth-migration', name: 'Auth Migration' },
]

export function NeedsReview() {
  const [events, setEvents] = useState(mockAmbiguousEvents)
  const [selectedEpics, setSelectedEpics] = useState<Record<string, string>>({})

  const handleAssign = (eventId: string, epicId: string | null) => {
    // TODO: Call API to reprocess with selected epic
    console.log('Reprocessing event', eventId, 'with epic', epicId)
    
    // Remove from list (optimistic update)
    setEvents(events.filter(e => e.id !== eventId))
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

      {events.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Check size={48} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-200">All caught up!</h3>
          <p className="text-slate-500">No ambiguous events need review</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <div key={event.id} className="bg-slate-900 border border-amber-500/20 rounded-xl p-6">
              {/* Evidence */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">Ambiguous Event</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-sm text-slate-500">{new Date(event.created_at).toLocaleString()}</span>
                </div>
                
                <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
                  <p className="text-slate-300 italic">"{event.transcript}"</p>
                </div>
              </div>

              {/* Candidate Epics */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Suggested Epics</h4>
                <div className="space-y-2">
                  {event.detectedEpics.map((epic) => (
                    <button
                      key={epic.id}
                      onClick={() => setSelectedEpics({ ...selectedEpics, [event.id]: epic.id })}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        selectedEpics[event.id] === epic.id
                          ? 'bg-primary-600/10 border-primary-500/50'
                          : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <FolderKanban size={16} className="text-slate-400" />
                        <span className="font-medium text-slate-200">{epic.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full"
                            style={{ width: `${epic.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-500 w-12 text-right">{Math.round(epic.confidence * 100)}%</span>
                        
                        {selectedEpics[event.id] === epic.id && (
                          <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                            <Check size={12} className="text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleAssign(event.id, selectedEpics[event.id] || null)}
                  disabled={!selectedEpics[event.id]}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  Assign & Reprocess
                </button>
                
                <button
                  onClick={() => handleAssign(event.id, null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                >
                  No Epic (Standalone)
                </button>
                
                <button className="px-4 py-2 text-slate-500 hover:text-slate-300 text-sm">
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