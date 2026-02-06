import { useState } from 'react'
import { CheckCircle2, Circle, Clock, AlertCircle, Plus, Filter, Trash2 } from 'lucide-react'
import { useActions } from '../hooks/useActions'
import type { Action } from '../types'

const priorityColors: Record<string, string> = {
  P0: 'text-red-400 bg-red-500/10 border-red-500/20',
  P1: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  P2: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  P3: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

const priorityLabels: Record<string, string> = {
  P0: 'Critical',
  P1: 'High',
  P2: 'Medium',
  P3: 'Low',
}

export function Actions() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'done'>('open')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'P0' | 'P1' | 'P2' | 'P3'>('all')
  
  const { 
    actions, 
    loading, 
    error, 
    toggleComplete,
    deleteAction 
  } = useActions({
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  // Filter by priority client-side
  const filteredActions = actions.filter(action => 
    priorityFilter === 'all' || action.priority === priorityFilter
  )

  const handleToggle = async (id: string, currentStatus: string) => {
    try {
      await toggleComplete(id, currentStatus === 'open')
    } catch (err) {
      console.error('Failed to toggle action:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this action?')) return
    try {
      await deleteAction(id)
    } catch (err) {
      console.error('Failed to delete action:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Actions</h1>
          <p className="text-slate-500 mt-1">Manage tasks and follow-ups from your voice notes</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors">
          <Plus size={16} />
          New Action
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-500" />
          <span className="text-sm text-slate-500">Status:</span>
          <div className="flex gap-1">
            {(['all', 'open', 'done'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-slate-500" />
          <span className="text-sm text-slate-500">Priority:</span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
          >
            <option value="all">All Priorities</option>
            <option value="P0">P0 - Critical</option>
            <option value="P1">P1 - High</option>
            <option value="P2">P2 - Medium</option>
            <option value="P3">P3 - Low</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          Error loading actions: {error}
        </div>
      )}

      {/* Actions List */}
      <div className="space-y-3">
        {!loading && filteredActions.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Circle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No actions found</p>
            <p className="text-sm mt-1">Create a new action or record a voice note</p>
          </div>
        )}

        {filteredActions.map((action) => (
          <div
            key={action.id}
            className={`bg-slate-900 border rounded-xl p-4 transition-all ${
              action.status === 'done' 
                ? 'border-slate-800 opacity-60' 
                : 'border-slate-800 hover:border-slate-700'
            } ${priorityColors[action.priority]}`}
          >
            <div className="flex items-start gap-4">
              <button
                onClick={() => handleToggle(action.id, action.status)}
                className={`mt-0.5 transition-colors ${
                  action.status === 'done' 
                    ? 'text-emerald-500' 
                    : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {action.status === 'done' ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <Circle size={20} />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className={`font-medium ${
                      action.status === 'done' 
                        ? 'text-slate-500 line-through' 
                        : 'text-slate-200'
                    }`}>
                      {action.title}
                    </h3>
                    
                    {action.body && (
                      <p className="text-sm text-slate-500 mt-1">{action.body}</p>
                    )}

                    <div className="flex items-center gap-4 mt-2">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-black/20">
                        {action.priority} - {priorityLabels[action.priority]}
                      </span>
                      
                      {action.due_at && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock size={12} />
                          Due {new Date(action.due_at).toLocaleDateString()}
                        </span>
                      )}

                      {action.epic_id && (
                        <span className="text-xs text-primary-400">
                          {action.epic_id}
                        </span>
                      )}

                      {action.mentions?.length > 0 && (
                        <span className="text-xs text-slate-500">
                          @{action.mentions.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(action.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
