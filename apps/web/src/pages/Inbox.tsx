import { useState } from 'react'
import { Check, Circle, Clock, AlertCircle, Filter, Search } from 'lucide-react'
import { Action } from '../types'

const mockActions: Action[] = [
  {
    id: '1',
    type: 'follow_up',
    title: 'Review authentication PR from Maria',
    priority: 'P1',
    status: 'open',
    due_at: null,
    mentions: ['Maria'],
    epic_id: 'auth-migration',
    body: 'Check the OAuth implementation and test coverage',
    created_at: '2026-02-04T10:00:00Z',
  },
  {
    id: '2',
    type: 'deadline',
    title: 'Submit quarterly review',
    priority: 'P0',
    status: 'open',
    due_at: '2026-02-05T17:00:00Z',
    mentions: [],
    epic_id: null,
    body: 'Complete the quarterly performance review document',
    created_at: '2026-02-03T14:00:00Z',
  },
  {
    id: '3',
    type: 'follow_up',
    title: 'Check deployment status on staging',
    priority: 'P2',
    status: 'open',
    due_at: null,
    mentions: ['DevOps'],
    epic_id: 'api-v2',
    body: 'Verify the new endpoints are working correctly',
    created_at: '2026-02-04T16:00:00Z',
  },
  {
    id: '4',
    type: 'follow_up',
    title: 'Update documentation for webhooks',
    priority: 'P3',
    status: 'done',
    due_at: null,
    mentions: [],
    epic_id: 'api-v2',
    body: 'Add examples for the new webhook payloads',
    created_at: '2026-02-01T09:00:00Z',
  },
]

const priorityColors = {
  P0: 'text-red-400 bg-red-500/10',
  P1: 'text-amber-400 bg-amber-500/10',
  P2: 'text-blue-400 bg-blue-500/10',
  P3: 'text-slate-400 bg-slate-500/10',
}

const typeIcons = {
  follow_up: Circle,
  deadline: Clock,
  email: AlertCircle,
}

export function Inbox() {
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredActions = mockActions.filter((action) => {
    if (filter === 'open' && action.status !== 'open') return false
    if (filter === 'done' && action.status !== 'done') return false
    if (searchQuery && !action.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Inbox</h1>
        <span className="text-slate-500">{filteredActions.length} items</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'open', 'done'] as const).map((f) => (
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

      {/* Actions List */}
      <div className="space-y-2">
        {filteredActions.map((action) => {
          const Icon = typeIcons[action.type]
          return (
            <div
              key={action.id}
              className={`bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors ${
                action.status === 'done' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                <button
                  className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    action.status === 'done'
                      ? 'bg-primary-600 border-primary-600'
                      : 'border-slate-600 hover:border-primary-500'
                  }`}
                >
                  {action.status === 'done' && <Check size={12} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-medium ${action.status === 'done' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {action.title}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColors[action.priority]}`}>
                      {action.priority}
                    </span>
                  </div>

                  <p className="text-sm text-slate-500 mt-1">{action.body}</p>

                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                    {action.epic_id && (
                      <span className="text-primary-400">{action.epic_id}</span>
                    )}
                    {action.mentions.length > 0 && (
                      <span>@{action.mentions.join(', ')}</span>
                    )}
                    {action.due_at && (
                      <span className="text-amber-400">Due {new Date(action.due_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <Icon size={16} className="text-slate-600" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}