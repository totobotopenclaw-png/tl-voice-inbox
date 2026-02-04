import { useState } from 'react'
import { FolderKanban, Plus, Search, MoreVertical, CheckCircle2, Circle, AlertCircle } from 'lucide-react'

const mockEpics = [
  {
    id: '1',
    title: 'API v2 Migration',
    status: 'active',
    aliases: ['API v2', 'Migration', 'Backend v2'],
    stats: { actions: 8, blockers: 1, knowledge: 5 },
    lastUpdate: '2h ago',
  },
  {
    id: '2',
    title: 'Auth Migration',
    status: 'active',
    aliases: ['Auth', 'OAuth', 'Authentication'],
    stats: { actions: 4, blockers: 0, knowledge: 3 },
    lastUpdate: '4h ago',
  },
  {
    id: '3',
    title: 'CP33 Dashboard',
    status: 'active',
    aliases: ['CP33', 'Dashboard', 'Analytics'],
    stats: { actions: 12, blockers: 2, knowledge: 8 },
    lastUpdate: '1d ago',
  },
  {
    id: '4',
    title: 'UI Refresh',
    status: 'completed',
    aliases: ['UI', 'Design System'],
    stats: { actions: 0, blockers: 0, knowledge: 4 },
    lastUpdate: '1w ago',
  },
  {
    id: '5',
    title: 'Bookings API',
    status: 'active',
    aliases: ['Bookings', 'Reservations'],
    stats: { actions: 6, blockers: 1, knowledge: 2 },
    lastUpdate: '30m ago',
  },
]

const statusColors: Record<string, string> = {
  active: 'text-emerald-400 bg-emerald-500/10',
  completed: 'text-slate-400 bg-slate-500/10',
  archived: 'text-slate-500 bg-slate-600/10',
}

export function Epics() {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredEpics = mockEpics.filter((epic) => {
    if (filter !== 'all' && epic.status !== filter) return false
    if (searchQuery && !epic.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Epics</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors">
          <Plus size={16} />
          New Epic
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search epics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
          />
        </div>
        <div className="flex gap-2">
          {(['active', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Epics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEpics.map((epic) => (
          <div
            key={epic.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary-600/10 flex items-center justify-center">
                <FolderKanban size={20} className="text-primary-400" />
              </div>
              <button className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity">
                <MoreVertical size={16} />
              </button>
            </div>

            <h3 className="font-medium text-slate-200 mb-2">{epic.title}</h3>

            <div className="flex flex-wrap gap-1 mb-4">
              {epic.aliases.slice(0, 3).map((alias) => (
                <span
                  key={alias}
                  className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-500"
                >
                  {alias}
                </span>
              ))}
              {epic.aliases.length > 3 && (
                <span className="px-2 py-0.5 text-xs text-slate-600">+{epic.aliases.length - 3}</span>
              )}
            </div>

            <div className="flex items-center justify-between text-sm mb-4">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-slate-500">
                  <Circle size={14} /> {epic.stats.actions}
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <AlertCircle size={14} /> {epic.stats.blockers}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[epic.status]}`}>
                {epic.status}
              </span>
            </div>

            <p className="text-xs text-slate-600">Updated {epic.lastUpdate}</p>
          </div>
        ))}
      </div>
    </div>
  )
}