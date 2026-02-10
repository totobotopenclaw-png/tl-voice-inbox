import { useState, useEffect, useCallback } from 'react'
import { Check, Circle, Clock, AlertCircle, Search, Loader2, RefreshCw, Plus, X, Pencil, Save } from 'lucide-react'
import { Link } from 'react-router-dom'

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

interface Action {
  id: string
  sourceEventId: string
  epicId: string | null
  type: 'follow_up' | 'deadline' | 'email'
  title: string
  body: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'open' | 'done' | 'cancelled'
  dueAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  epicTitle: string | null
  mentions: string[]
}

interface EpicOption {
  id: string
  title: string
}

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
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newAction, setNewAction] = useState({
    title: '',
    body: '',
    type: 'follow_up' as const,
    priority: 'P2' as const,
  })

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    title: string
    priority: string
    dueAt: string
    epicId: string
  }>({ title: '', priority: '', dueAt: '', epicId: '' })
  const [saving, setSaving] = useState(false)
  const [epics, setEpics] = useState<EpicOption[]>([])

  const fetchActions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/actions?limit=100`)
      if (!response.ok) throw new Error('Failed to fetch actions')
      const data = await response.json()
      setActions(data.actions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch epics for the reassignment dropdown
  const fetchEpics = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/epics?status=active`)
      if (!response.ok) return
      const data = await response.json()
      setEpics(data.epics?.map((e: any) => ({ id: e.id, title: e.title })) || [])
    } catch {
      // silently fail — epics dropdown is optional
    }
  }, [])

  useEffect(() => {
    fetchActions()
    fetchEpics()
  }, [fetchActions, fetchEpics])

  const handleToggleStatus = async (actionId: string, currentStatus: string) => {
    setToggling(prev => new Set(prev).add(actionId))

    try {
      const newStatus = currentStatus === 'open' ? 'done' : 'open'
      const response = await fetch(`${API_URL}/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) throw new Error('Failed to update action')

      // Remove completed items from list, restore reopened ones via refetch
      if (newStatus === 'done') {
        setActions(prev => prev.filter(a => a.id !== actionId))
      } else {
        setActions(prev => prev.map(a =>
          a.id === actionId ? { ...a, status: newStatus } : a
        ))
      }
    } catch (err) {
      alert('Failed to update: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setToggling(prev => {
        const next = new Set(prev)
        next.delete(actionId)
        return next
      })
    }
  }

  const startEditing = (action: Action) => {
    setEditingId(action.id)
    setEditForm({
      title: action.title,
      priority: action.priority,
      dueAt: action.dueAt ? action.dueAt.split('T')[0] : '',
      epicId: action.epicId || '',
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditForm({ title: '', priority: '', dueAt: '', epicId: '' })
  }

  const saveEdit = async (actionId: string) => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      const original = actions.find(a => a.id === actionId)
      if (!original) return

      if (editForm.title !== original.title) body.title = editForm.title
      if (editForm.priority !== original.priority) body.priority = editForm.priority

      const originalDue = original.dueAt ? original.dueAt.split('T')[0] : ''
      if (editForm.dueAt !== originalDue) {
        body.dueAt = editForm.dueAt ? editForm.dueAt + 'T23:59:59Z' : null
      }

      const originalEpic = original.epicId || ''
      if (editForm.epicId !== originalEpic) {
        body.epicId = editForm.epicId || null
      }

      if (Object.keys(body).length === 0) {
        cancelEditing()
        return
      }

      const response = await fetch(`${API_URL}/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) throw new Error('Failed to update action')

      // Update local state
      const epicTitle = editForm.epicId
        ? epics.find(e => e.id === editForm.epicId)?.title || null
        : null

      setActions(prev => prev.map(a =>
        a.id === actionId
          ? {
              ...a,
              title: editForm.title,
              priority: editForm.priority as Action['priority'],
              dueAt: editForm.dueAt ? editForm.dueAt + 'T23:59:59Z' : null,
              epicId: editForm.epicId || null,
              epicTitle,
            }
          : a
      ))
      cancelEditing()
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAction.title.trim()) return

    setCreating(true)
    try {
      const response = await fetch(`${API_URL}/api/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEventId: 'manual-entry-sentinel',
          type: newAction.type,
          title: newAction.title,
          body: newAction.body || null,
          priority: newAction.priority,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create action')
      }

      const data = await response.json()

      // Add to list
      setActions(prev => [{
        id: data.id,
        sourceEventId: 'manual-entry-sentinel',
        epicId: null,
        type: newAction.type,
        title: newAction.title,
        body: newAction.body,
        priority: newAction.priority,
        status: 'open',
        dueAt: null,
        completedAt: null,
        createdAt: data.createdAt,
        updatedAt: data.createdAt,
        epicTitle: null,
        mentions: [],
      }, ...prev])

      // Reset form
      setNewAction({ title: '', body: '', type: 'follow_up', priority: 'P2' })
      setShowCreateModal(false)
    } catch (err) {
      alert('Failed to create: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreating(false)
    }
  }

  const filteredActions = actions.filter((action) => {
    if (filter === 'open' && action.status !== 'open') return false
    if (filter === 'done' && action.status !== 'done') return false
    if (searchQuery && !action.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Inbox</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <Plus size={16} />
            Add Action
          </button>
          <button
            onClick={fetchActions}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className="text-slate-500">{filteredActions.length} items</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'open', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
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

      {/* Loading State */}
      {loading && actions.length === 0 && (
        <div className="text-center py-16">
          <Loader2 size={32} className="animate-spin mx-auto text-primary-600 mb-4" />
          <p className="text-slate-500">Loading actions...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-16 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchActions}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredActions.length === 0 && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Check size={48} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-lg font-medium text-slate-200">{filter === 'done' ? 'No completed actions' : 'All caught up!'}</h3>
          <p className="text-slate-500">{filter === 'done' ? 'Complete some actions to see them here.' : 'No actions in your inbox.'}</p>
        </div>
      )}

      {/* Actions List */}
      <div className="space-y-2">
        {filteredActions.map((action) => {
          const Icon = typeIcons[action.type]
          const isToggling = toggling.has(action.id)
          const isEditing = editingId === action.id

          if (isEditing) {
            return (
              <div
                key={action.id}
                className="bg-slate-900 border border-primary-600/50 rounded-xl p-4 transition-colors"
              >
                <div className="space-y-3">
                  {/* Title */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                      autoFocus
                    />
                  </div>

                  {/* Priority + Due Date + Epic — inline row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                      <select
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                      >
                        <option value="P0">P0 - Critical</option>
                        <option value="P1">P1 - Important</option>
                        <option value="P2">P2 - Normal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={editForm.dueAt}
                        onChange={(e) => setEditForm({ ...editForm, dueAt: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Epic</label>
                      <select
                        value={editForm.epicId}
                        onChange={(e) => setEditForm({ ...editForm, epicId: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-600"
                      >
                        <option value="">No epic</option>
                        {epics.map(ep => (
                          <option key={ep.id} value={ep.id}>{ep.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Save / Cancel buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={cancelEditing}
                      className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(action.id)}
                      disabled={saving || !editForm.title.trim()}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <Save size={12} />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div
              key={action.id}
              className={`bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors group ${
                action.status === 'done' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                <button
                  onClick={() => handleToggleStatus(action.id, action.status)}
                  disabled={isToggling}
                  className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors disabled:opacity-50 ${
                    action.status === 'done'
                      ? 'bg-primary-600 border-primary-600'
                      : 'border-slate-600 hover:border-primary-500'
                  }`}
                >
                  {isToggling ? (
                    <Loader2 size={12} className="animate-spin text-slate-400" />
                  ) : action.status === 'done' ? (
                    <Check size={12} className="text-white" />
                  ) : null}
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
                    {action.epicId && (
                      <Link
                        to={`/epics`}
                        className="text-primary-400 hover:text-primary-300"
                      >
                        {action.epicTitle || action.epicId}
                      </Link>
                    )}
                    {action.mentions.length > 0 && (
                      <span>@{action.mentions.join(', ')}</span>
                    )}
                    {action.dueAt && (
                      <span className={
                        new Date(action.dueAt) < new Date() && action.status === 'open'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }>
                        Due {new Date(action.dueAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Edit + Type icon */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEditing(action)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-primary-400 transition-all"
                    title="Edit action"
                  >
                    <Pencil size={14} />
                  </button>
                  <Icon size={16} className="text-slate-600" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Action Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-xl sm:rounded-xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-100">Add Action</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={newAction.title}
                  onChange={(e) => setNewAction({ ...newAction, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  placeholder="e.g., Review deployment pipeline"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  value={newAction.body}
                  onChange={(e) => setNewAction({ ...newAction, body: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600 h-20"
                  placeholder="Optional details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Type</label>
                  <select
                    value={newAction.type}
                    onChange={(e) => setNewAction({ ...newAction, type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  >
                    <option value="follow_up">Follow-up</option>
                    <option value="deadline">Deadline</option>
                    <option value="email">Email</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Priority</label>
                  <select
                    value={newAction.priority}
                    onChange={(e) => setNewAction({ ...newAction, priority: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  >
                    <option value="P0">P0 - Critical</option>
                    <option value="P1">P1 - Important</option>
                    <option value="P2">P2 - Normal</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newAction.title.trim()}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
