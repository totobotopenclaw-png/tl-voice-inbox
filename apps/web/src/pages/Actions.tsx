import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Filter,
  Trash2,
  Pencil,
  X,
  Save,
  FolderKanban,
  RefreshCw,
} from 'lucide-react'
import { useActions } from '../hooks/useActions'
import type { Action } from '../types'

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

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

interface EpicOption {
  id: string
  title: string
}

export function Actions() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'done'>('open')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'P0' | 'P1' | 'P2' | 'P3'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editPriority, setEditPriority] = useState<string>('P2')
  const [editDueAt, setEditDueAt] = useState('')
  const [editEpicId, setEditEpicId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [epics, setEpics] = useState<EpicOption[]>([])

  const {
    actions,
    loading,
    error,
    toggleComplete,
    updateAction,
    deleteAction,
    refetch,
  } = useActions({
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  // Fetch epics for the dropdown
  useEffect(() => {
    fetch(`${API_URL}/api/epics`)
      .then(res => res.json())
      .then(data => setEpics((data.epics || []).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }))))
      .catch(() => {})
  }, [])

  // Build epicId → title map
  const epicTitleMap: Record<string, string> = {}
  for (const e of epics) {
    epicTitleMap[e.id] = e.title
  }
  // Also build from actions that have epicTitle from API
  for (const a of actions) {
    if ((a as any).epicTitle && a.epic_id) {
      epicTitleMap[a.epic_id] = (a as any).epicTitle
    }
  }

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

  const startEditing = (action: Action) => {
    setEditingId(action.id)
    setEditTitle(action.title)
    setEditPriority(action.priority)
    setEditDueAt(action.due_at ? action.due_at.substring(0, 16) : '')
    setEditEpicId(action.epic_id)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditTitle('')
    setEditPriority('P2')
    setEditDueAt('')
    setEditEpicId(null)
  }

  const handleSave = useCallback(async () => {
    if (!editingId || !editTitle.trim()) return
    setSaving(true)
    try {
      const updates: Record<string, unknown> = {}
      const action = actions.find(a => a.id === editingId)
      if (!action) return

      if (editTitle.trim() !== action.title) updates.title = editTitle.trim()
      if (editPriority !== action.priority) updates.priority = editPriority
      if ((editDueAt || null) !== (action.due_at ? action.due_at.substring(0, 16) : null)) {
        updates.dueAt = editDueAt ? new Date(editDueAt).toISOString() : null
      }
      if (editEpicId !== action.epic_id) updates.epicId = editEpicId

      if (Object.keys(updates).length > 0) {
        await updateAction(editingId, updates as Partial<Action>)
      }
      cancelEditing()
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }, [editingId, editTitle, editPriority, editDueAt, editEpicId, actions, updateAction])

  const now = new Date()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Actions</h1>
          <p className="text-slate-500 mt-1">Manage tasks and follow-ups from your voice notes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <span className="text-sm text-slate-500">{filteredActions.length} items</span>
        </div>
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
            <p className="text-sm mt-1">Actions will appear when captured from voice notes</p>
          </div>
        )}

        {filteredActions.map((action) => {
          const isEditing = editingId === action.id
          const dueDate = action.due_at ? new Date(action.due_at) : null
          const isOverdue = dueDate && dueDate < now && action.status === 'open'
          const epicTitle = action.epic_id ? epicTitleMap[action.epic_id] : null

          return (
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
                  {isEditing ? (
                    /* ── Inline Edit Mode ── */
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-3">
                        <select
                          value={editPriority}
                          onChange={e => setEditPriority(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                        >
                          <option value="P0">P0 - Critical</option>
                          <option value="P1">P1 - High</option>
                          <option value="P2">P2 - Medium</option>
                          <option value="P3">P3 - Low</option>
                        </select>
                        <input
                          type="datetime-local"
                          value={editDueAt}
                          onChange={e => setEditDueAt(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                        />
                        <select
                          value={editEpicId || ''}
                          onChange={e => setEditEpicId(e.target.value || null)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                        >
                          <option value="">No epic</option>
                          {epics.map(e => (
                            <option key={e.id} value={e.id}>{e.title}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSave}
                          disabled={saving || !editTitle.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors"
                        >
                          <Save size={14} />
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display Mode ── */
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

                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-black/20">
                            {action.priority} - {priorityLabels[action.priority]}
                          </span>

                          {dueDate && (
                            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
                              <Clock size={12} />
                              {isOverdue ? 'Overdue: ' : 'Due '}
                              {dueDate.toLocaleDateString()}
                            </span>
                          )}

                          {epicTitle && (
                            <span
                              className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 cursor-pointer hover:underline"
                              onClick={() => navigate(`/epics?open=${action.epic_id}`)}
                            >
                              <FolderKanban size={12} />
                              {epicTitle}
                            </span>
                          )}
                          {action.epic_id && !epicTitle && (
                            <span
                              className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 cursor-pointer hover:underline"
                              onClick={() => navigate(`/epics?open=${action.epic_id}`)}
                            >
                              <FolderKanban size={12} />
                              {action.epic_id.substring(0, 8)}...
                            </span>
                          )}

                          {action.mentions?.length > 0 && (
                            <span className="text-xs text-slate-500">
                              @{action.mentions.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {action.status === 'open' && (
                          <button
                            onClick={() => startEditing(action)}
                            className="p-1.5 text-slate-600 hover:text-slate-400 transition-colors rounded-lg hover:bg-slate-800"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(action.id)}
                          className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
