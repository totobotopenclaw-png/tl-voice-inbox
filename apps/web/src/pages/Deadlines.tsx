import { Clock, AlertTriangle, Calendar } from 'lucide-react'

const mockDeadlines = [
  {
    id: '1',
    title: 'Submit quarterly review',
    due_at: '2026-02-05T17:00:00Z',
    priority: 'P0',
    epic: null,
    status: 'upcoming',
  },
  {
    id: '2',
    title: 'Deploy API v2 to production',
    due_at: '2026-02-07T10:00:00Z',
    priority: 'P0',
    epic: 'API v2 Migration',
    status: 'upcoming',
  },
  {
    id: '3',
    title: 'Security audit completion',
    due_at: '2026-02-10T23:59:00Z',
    priority: 'P1',
    epic: 'Security Hardening',
    status: 'upcoming',
  },
  {
    id: '4',
    title: 'Team offsite planning',
    due_at: '2026-02-15T12:00:00Z',
    priority: 'P2',
    epic: null,
    status: 'upcoming',
  },
]

const priorityColors: Record<string, string> = {
  P0: 'text-red-400 bg-red-500/10 border-red-500/20',
  P1: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  P2: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  P3: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

export function Deadlines() {
  const now = new Date()
  
  const sortedDeadlines = [...mockDeadlines].sort((a, b) => 
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Deadlines</h1>
        <button className="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors">
          + New Deadline
        </button>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {sortedDeadlines.map((deadline, index) => {
          const dueDate = new Date(deadline.due_at)
          const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          const isOverdue = daysUntil < 0
          const isToday = daysUntil === 0
          const isSoon = daysUntil <= 2 && daysUntil > 0

          return (
            <div
              key={deadline.id}
              className={`relative pl-8 pb-8 ${index !== sortedDeadlines.length - 1 ? 'border-l-2 border-slate-800' : ''}`}
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
                ${priorityColors[deadline.priority]}
              `}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-slate-200">{deadline.title}</h3>
                    
                    {deadline.epic && (
                      <p className="text-sm mt-1 opacity-80">{deadline.epic}</p>
                    )}

                    <div className="flex items-center gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        <span>{dueDate.toLocaleDateString()} at {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {isOverdue && (
                        <span className="text-red-400 font-medium">Overdue by {Math.abs(daysUntil)} days</span>
                      )}
                      {isToday && (
                        <span className="text-amber-400 font-medium">Due today!</span>
                      )}
                      {!isOverdue && !isToday && (
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
    </div>
  )
}