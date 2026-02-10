import { useState } from 'react'
import { Clock, AlertCircle, RefreshCw, Circle } from 'lucide-react'
import { useDeadlines } from '../hooks/useDeadlines'

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

const priorityColors: Record<string, string> = {
  P0: 'text-red-400 bg-red-500/10 border-red-500/20',
  P1: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  P2: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  P3: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

export function Deadlines() {
  const { deadlines, loading, error, refresh } = useDeadlines()
  const [completing, setCompleting] = useState<string | null>(null)
  const now = new Date()

  const handleComplete = async (id: string) => {
    setCompleting(id)
    try {
      const res = await fetch(`${API_URL}/api/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (!res.ok) throw new Error('Failed to complete')
      refresh()
    } catch (err) {
      console.error('Failed to complete deadline:', err)
    } finally {
      setCompleting(null)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-500">Loading deadlines...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 bg-red-500/10 border border-red-500/20 rounded-xl">
        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
        <p className="text-red-400">{error}</p>
        <button
          onClick={refresh}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Deadlines</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <span className="text-sm text-slate-500">{deadlines.length} items</span>
        </div>
      </div>

      {deadlines.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Clock size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400">No deadlines yet</p>
          <p className="text-sm text-slate-600 mt-1">Deadlines will appear here when captured from voice notes</p>
        </div>
      ) : (
        <div className="space-y-4">
          {deadlines.map((deadline, index) => {
            const dueDate = deadline.dueAt ? new Date(deadline.dueAt) : null
            const daysUntil = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
            const isOverdue = daysUntil !== null && daysUntil < 0
            const isToday = daysUntil === 0
            const isSoon = daysUntil !== null && daysUntil <= 2 && daysUntil > 0
            const isCompleting = completing === deadline.id

            return (
              <div
                key={deadline.id}
                className={`relative pl-8 pb-8 ${index !== deadlines.length - 1 ? 'border-l-2 border-slate-800' : ''}`}
              >
                {/* Timeline dot */}
                <div className={`
                  absolute left-0 top-0 w-4 h-4 -translate-x-1/2 rounded-full border-2
                  ${isOverdue ? 'bg-red-500 border-red-500' : ''}
                  ${isToday ? 'bg-amber-500 border-amber-500 animate-pulse' : ''}
                  ${isSoon ? 'bg-amber-500/50 border-amber-500' : ''}
                  ${!isOverdue && !isToday && !isSoon ? 'bg-slate-800 border-slate-600' : ''}
                `} />

                <div className={`
                  bg-slate-900 border rounded-xl p-4
                  ${priorityColors[deadline.priority] || priorityColors.P2}
                `}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleComplete(deadline.id)}
                          disabled={isCompleting}
                          className="text-slate-500 hover:text-emerald-400 transition-colors shrink-0 disabled:opacity-50"
                          title="Mark as done"
                        >
                          {isCompleting ? (
                            <div className="animate-spin w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full" />
                          ) : (
                            <Circle size={20} />
                          )}
                        </button>
                        <h3 className="font-medium text-slate-200">{deadline.title}</h3>
                      </div>

                      {deadline.epicTitle && (
                        <p className="text-sm mt-1 opacity-80 ml-7">{deadline.epicTitle}</p>
                      )}

                      <div className="flex items-center gap-4 mt-3 text-sm ml-7">
                        {dueDate && (
                          <div className="flex items-center gap-1">
                            <Clock size={14} />
                            <span>{dueDate.toLocaleDateString()} at {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}

                        {isOverdue && daysUntil !== null && (
                          <span className="text-red-400 font-medium">Overdue by {Math.abs(daysUntil)} days</span>
                        )}
                        {isToday && (
                          <span className="text-amber-400 font-medium">Due today!</span>
                        )}
                        {!isOverdue && !isToday && daysUntil !== null && (
                          <span className={isSoon ? 'text-amber-400' : ''}>{daysUntil} days left</span>
                        )}
                      </div>
                    </div>

                    <span className="px-2 py-1 rounded text-xs font-medium bg-black/20">
                      {deadline.priority}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
