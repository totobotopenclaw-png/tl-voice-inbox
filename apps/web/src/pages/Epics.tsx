import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FolderKanban, Plus, Search, MoreVertical, CheckCircle2, Circle, AlertCircle, X, Edit2, Check, Clock } from 'lucide-react'

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '') 
  : '';

interface Epic {
  id: string
  title: string
  description: string | null
  status: 'active' | 'completed' | 'archived'
  aliases: string[]
  stats: {
    actions: number
    blockers: number
    dependencies: number
    issues: number
    knowledge: number
  }
  createdAt: string
  updatedAt: string
}

interface ResolvedItem {
  id: string
  description: string
  status: string
  resolvedAt: string | null
  createdAt: string
  owner: string | null
}

interface EpicSnapshot {
  epic: {
    id: string
    title: string
    description: string | null
  }
  aliases: string[]
  blockers: Array<{ id: string; description: string; status: string }>
  dependencies: Array<{ id: string; description: string; status: string }>
  issues: Array<{ id: string; description: string; status: string }>
  recentActions: Array<{ type: string; title: string; priority: string; completed: boolean }>
  history: {
    resolvedBlockers: ResolvedItem[]
    resolvedDependencies: ResolvedItem[]
    resolvedIssues: ResolvedItem[]
    completedActions: Array<{ id: string; title: string; type: string; priority: string; completedAt: string }>
  }
}

const statusColors: Record<string, string> = {
  active: 'text-emerald-400 bg-emerald-500/10',
  completed: 'text-slate-400 bg-slate-500/10',
  archived: 'text-slate-500 bg-slate-600/10',
}

export function Epics() {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'archived'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [epics, setEpics] = useState<Epic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [snapshot, setSnapshot] = useState<EpicSnapshot | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  
  // Form states
  const [newEpicTitle, setNewEpicTitle] = useState('')
  const [newEpicDescription, setNewEpicDescription] = useState('')
  const [newEpicAliases, setNewEpicAliases] = useState('')

  // Detail tab state
  const [detailTab, setDetailTab] = useState<'active' | 'history'>('active')

  // Resolve/snooze states
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [snoozeDate, setSnoozeDate] = useState('')

  // Epic edit states
  const [editingEpic, setEditingEpic] = useState(false)
  const [editEpicForm, setEditEpicForm] = useState({ title: '', description: '' })
  const [savingEpic, setSavingEpic] = useState(false)

  // Manual blocker/dependency creation states
  const [addingBlocker, setAddingBlocker] = useState(false)
  const [addingDependency, setAddingDependency] = useState(false)
  const [newBlockerDesc, setNewBlockerDesc] = useState('')
  const [newBlockerOwner, setNewBlockerOwner] = useState('')
  const [newDepDesc, setNewDepDesc] = useState('')
  const [newDepOwner, setNewDepOwner] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  // URL query params for deep linking (e.g. /epics?open=epic-id)
  const [searchParams, setSearchParams] = useSearchParams()
  const autoOpenHandled = useRef(false)

  // Fetch epics
  useEffect(() => {
    fetchEpics()
  }, [filter])

  const fetchEpics = async () => {
    setLoading(true)
    setError(null)
    try {
      const statusParam = filter === 'all' ? '' : `?status=${filter}`
      const response = await fetch(`${API_URL}/api/epics${statusParam}`)
      if (!response.ok) throw new Error('Failed to fetch epics')
      const data = await response.json()
      setEpics(data.epics)

      // Auto-open epic from URL query param (e.g. /epics?open=epic-id)
      const openId = searchParams.get('open')
      if (openId && !autoOpenHandled.current) {
        autoOpenHandled.current = true
        const epicToOpen = (data.epics as Epic[]).find((e: Epic) => e.id === openId)
        if (epicToOpen) {
          // Clear the query param and open the detail modal
          setSearchParams({}, { replace: true })
          openEpicDetail(epicToOpen)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateEpic = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const aliases = newEpicAliases
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0)
      
      const response = await fetch(`${API_URL}/api/epics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEpicTitle,
          description: newEpicDescription || undefined,
          aliases,
        }),
      })
      
      if (!response.ok) throw new Error('Failed to create epic')
      
      // Reset form and close modal
      setNewEpicTitle('')
      setNewEpicDescription('')
      setNewEpicAliases('')
      setShowCreateModal(false)
      fetchEpics()
    } catch (err) {
      alert('Failed to create epic: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleArchiveEpic = async (epicId: string) => {
    if (!confirm('Are you sure you want to archive this epic?')) return
    
    try {
      const response = await fetch(`${API_URL}/api/epics/${epicId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to archive epic')
      fetchEpics()
    } catch (err) {
      alert('Failed to archive epic: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const openEpicDetail = async (epic: Epic) => {
    setSelectedEpic(epic)
    setShowDetailModal(true)
    setDetailTab('active')
    setSnapshotLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/epics/${epic.id}/snapshot`)
      if (!response.ok) throw new Error('Failed to fetch snapshot')
      const data = await response.json()
      setSnapshot(data.snapshot)
    } catch (err) {
      console.error('Failed to load snapshot:', err)
      setSnapshot(null)
    } finally {
      setSnapshotLoading(false)
    }
  }

  /** Silent refresh: re-fetches snapshot without showing loading spinner */
  const refreshSnapshot = useCallback(async () => {
    if (!selectedEpic) return
    try {
      const response = await fetch(`${API_URL}/api/epics/${selectedEpic.id}/snapshot`)
      if (!response.ok) throw new Error('Failed to fetch snapshot')
      const data = await response.json()
      setSnapshot(data.snapshot)
      // Update stats on selectedEpic so the counter grid stays in sync
      if (data.snapshot) {
        setSelectedEpic(prev => prev ? {
          ...prev,
          stats: {
            ...prev.stats,
            blockers: data.snapshot.blockers?.length ?? prev.stats.blockers,
            dependencies: data.snapshot.dependencies?.length ?? prev.stats.dependencies,
            issues: data.snapshot.issues?.length ?? prev.stats.issues,
            actions: data.snapshot.recentActions?.length ?? prev.stats.actions,
          }
        } : prev)
      }
    } catch (err) {
      console.error('Failed to refresh snapshot:', err)
    }
  }, [selectedEpic])

  const handleResolve = useCallback(async (type: 'blockers' | 'dependencies', id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/${type}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (!res.ok) throw new Error('Failed to resolve')
      await refreshSnapshot()
    } catch (err) {
      console.error('Failed to resolve:', err)
    }
  }, [refreshSnapshot])

  const handleSnooze = useCallback(async (type: 'blockers' | 'dependencies', id: string, until: string) => {
    try {
      const res = await fetch(`${API_URL}/api/${type}/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ until }),
      })
      if (!res.ok) throw new Error('Failed to snooze')
      setSnoozingId(null)
      setSnoozeDate('')
      await refreshSnapshot()
    } catch (err) {
      console.error('Failed to snooze:', err)
    }
  }, [refreshSnapshot])

  const startEditingEpic = useCallback(() => {
    if (!selectedEpic) return
    setEditEpicForm({
      title: selectedEpic.title,
      description: selectedEpic.description || '',
    })
    setEditingEpic(true)
  }, [selectedEpic])

  const saveEpicEdit = useCallback(async () => {
    if (!selectedEpic) return
    setSavingEpic(true)
    try {
      const body: Record<string, unknown> = {}
      if (editEpicForm.title !== selectedEpic.title) body.title = editEpicForm.title
      if (editEpicForm.description !== (selectedEpic.description || '')) {
        body.description = editEpicForm.description || null
      }

      if (Object.keys(body).length > 0) {
        const res = await fetch(`${API_URL}/api/epics/${selectedEpic.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to update epic')

        // Update local state
        const updated = {
          ...selectedEpic,
          title: editEpicForm.title,
          description: editEpicForm.description || null,
        }
        setSelectedEpic(updated)
        setEpics(prev => prev.map(e => e.id === selectedEpic.id ? { ...e, ...updated } : e))
      }
      setEditingEpic(false)
    } catch (err) {
      console.error('Failed to update epic:', err)
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingEpic(false)
    }
  }, [selectedEpic, editEpicForm])

  const handleAddBlocker = useCallback(async () => {
    if (!selectedEpic || !newBlockerDesc.trim()) return
    setSavingNew(true)
    try {
      const res = await fetch(`${API_URL}/api/blockers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epicId: selectedEpic.id,
          description: newBlockerDesc.trim(),
          owner: newBlockerOwner.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create blocker')
      setNewBlockerDesc('')
      setNewBlockerOwner('')
      setAddingBlocker(false)
      await refreshSnapshot()
    } catch (err) {
      console.error('Failed to add blocker:', err)
      alert('Failed to add blocker')
    } finally {
      setSavingNew(false)
    }
  }, [selectedEpic, newBlockerDesc, newBlockerOwner, refreshSnapshot])

  const handleAddDependency = useCallback(async () => {
    if (!selectedEpic || !newDepDesc.trim()) return
    setSavingNew(true)
    try {
      const res = await fetch(`${API_URL}/api/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epicId: selectedEpic.id,
          description: newDepDesc.trim(),
          owner: newDepOwner.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create dependency')
      setNewDepDesc('')
      setNewDepOwner('')
      setAddingDependency(false)
      await refreshSnapshot()
    } catch (err) {
      console.error('Failed to add dependency:', err)
      alert('Failed to add dependency')
    } finally {
      setSavingNew(false)
    }
  }, [selectedEpic, newDepDesc, newDepOwner, refreshSnapshot])

  const filteredEpics = epics.filter((epic) => {
    if (searchQuery && !epic.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Epics</h1>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
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
          {(['active', 'completed', 'archived', 'all'] as const).map((f) => (
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

      {loading && (
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Loading epics...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-16 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
          <p className="text-red-400">{error}</p>
          <button 
            onClick={fetchEpics}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEpics.map((epic) => (
            <div
              key={epic.id}
              onClick={() => openEpicDetail(epic)}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary-600/10 flex items-center justify-center">
                  <FolderKanban size={20} className="text-primary-400" />
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleArchiveEpic(epic.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                >
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
                  <span className="flex items-center gap-1 text-slate-500" title="Actions">
                    <Circle size={14} /> {epic.stats.actions}
                  </span>
                  <span className="flex items-center gap-1 text-slate-500" title="Blockers">
                    <AlertCircle size={14} /> {epic.stats.blockers}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[epic.status]}`}>
                  {epic.status}
                </span>
              </div>

              <p className="text-xs text-slate-600">
                Updated {new Date(epic.updatedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create Epic Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-100">Create New Epic</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateEpic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={newEpicTitle}
                  onChange={(e) => setNewEpicTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  placeholder="e.g., API v2 Migration"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  value={newEpicDescription}
                  onChange={(e) => setNewEpicDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600 h-20"
                  placeholder="Brief description of the epic..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Aliases (comma-separated)
                </label>
                <input
                  type="text"
                  value={newEpicAliases}
                  onChange={(e) => setNewEpicAliases(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  placeholder="e.g., API v2, Backend v2, Migration"
                />
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
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  Create Epic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Epic Detail Modal */}
      {showDetailModal && selectedEpic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              {editingEpic ? (
                <div className="flex-1 mr-4 space-y-2">
                  <input
                    type="text"
                    value={editEpicForm.title}
                    onChange={(e) => setEditEpicForm({ ...editEpicForm, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xl font-bold text-slate-100 focus:outline-none focus:border-primary-600"
                    autoFocus
                  />
                  <textarea
                    value={editEpicForm.description}
                    onChange={(e) => setEditEpicForm({ ...editEpicForm, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-primary-600 h-16"
                    placeholder="Epic description..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingEpic(false)}
                      className="px-3 py-1 text-xs rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEpicEdit}
                      disabled={savingEpic || !editEpicForm.title.trim()}
                      className="px-3 py-1 text-xs rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 transition-colors"
                    >
                      {savingEpic ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-100">{selectedEpic.title}</h2>
                    <button
                      onClick={startEditingEpic}
                      className="p-1 text-slate-500 hover:text-primary-400 transition-colors"
                      title="Edit epic"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                  {selectedEpic.description && (
                    <p className="text-sm text-slate-400 mt-0.5">{selectedEpic.description}</p>
                  )}
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedEpic.aliases.join(', ')}
                  </p>
                </div>
              )}
              <button
                onClick={() => { setShowDetailModal(false); setEditingEpic(false); setAddingBlocker(false); setAddingDependency(false) }}
                className="text-slate-500 hover:text-slate-300 self-start"
              >
                <X size={20} />
              </button>
            </div>
            
            {snapshotLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-slate-500 mt-2">Loading snapshot...</p>
              </div>
            ) : snapshot ? (
              <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-950 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary-400">{selectedEpic.stats.actions}</p>
                    <p className="text-xs text-slate-500">Actions</p>
                  </div>
                  <div className="bg-slate-950 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400">{selectedEpic.stats.blockers}</p>
                    <p className="text-xs text-slate-500">Blockers</p>
                  </div>
                  <div className="bg-slate-950 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-400">{selectedEpic.stats.dependencies}</p>
                    <p className="text-xs text-slate-500">Dependencies</p>
                  </div>
                  <div className="bg-slate-950 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{selectedEpic.stats.issues}</p>
                    <p className="text-xs text-slate-500">Issues</p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-950 rounded-lg p-1">
                  <button
                    onClick={() => setDetailTab('active')}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${detailTab === 'active' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setDetailTab('history')}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${detailTab === 'history' ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    History ({(snapshot.history?.resolvedBlockers?.length || 0) + (snapshot.history?.resolvedDependencies?.length || 0) + (snapshot.history?.resolvedIssues?.length || 0) + (snapshot.history?.completedActions?.length || 0)})
                  </button>
                </div>

                {detailTab === 'active' ? (<>
                {/* Blockers */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-slate-400">Blockers ({snapshot.blockers.length} open)</h3>
                    <button
                      onClick={() => { setAddingBlocker(!addingBlocker); setNewBlockerDesc(''); setNewBlockerOwner('') }}
                      className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Blocker
                    </button>
                  </div>

                  {/* Add blocker form */}
                  {addingBlocker && (
                    <div className="bg-slate-950 rounded-lg p-3 border border-primary-600/30 mb-2 space-y-2">
                      <input
                        type="text"
                        value={newBlockerDesc}
                        onChange={(e) => setNewBlockerDesc(e.target.value)}
                        placeholder="Describe the blocker..."
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-primary-600"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={newBlockerOwner}
                        onChange={(e) => setNewBlockerOwner(e.target.value)}
                        placeholder="Owner (optional)"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-primary-600"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setAddingBlocker(false); setNewBlockerDesc(''); setNewBlockerOwner('') }}
                          className="px-3 py-1 text-xs rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddBlocker}
                          disabled={savingNew || !newBlockerDesc.trim()}
                          className="px-3 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50 transition-colors"
                        >
                          {savingNew ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {snapshot.blockers.length === 0 && !addingBlocker && (
                      <p className="text-xs text-slate-600 italic">No blockers</p>
                    )}
                    {snapshot.blockers.map((b) => (
                        <div key={b.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm flex-1 text-slate-300">{b.description}</p>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleResolve('blockers', b.id)}
                                className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                                title="Resolve"
                              >
                                <Check size={12} /> Resolve
                              </button>
                              <button
                                onClick={() => setSnoozingId(snoozingId === b.id ? null : b.id)}
                                className="px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                                title="Snooze"
                              >
                                <Clock size={12} /> Snooze
                              </button>
                            </div>
                          </div>
                          {snoozingId === b.id && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                              <input
                                type="date"
                                value={snoozeDate}
                                onChange={(e) => setSnoozeDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-primary-600"
                                min={new Date().toISOString().split('T')[0]}
                              />
                              <button
                                onClick={() => snoozeDate && handleSnooze('blockers', b.id, snoozeDate)}
                                disabled={!snoozeDate}
                                className="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setSnoozingId(null); setSnoozeDate('') }}
                                className="px-2 py-1 text-xs rounded text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                    ))}
                  </div>
                </div>

                {/* Issues */}
                {snapshot.issues.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Issues ({snapshot.issues.length} open)</h3>
                    <div className="space-y-2">
                      {snapshot.issues.map((issue) => (
                          <div key={issue.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                            <p className="text-sm text-slate-300">{issue.description}</p>
                          </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dependencies */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-slate-400">Dependencies ({snapshot.dependencies.length} open)</h3>
                    <button
                      onClick={() => { setAddingDependency(!addingDependency); setNewDepDesc(''); setNewDepOwner('') }}
                      className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Dependency
                    </button>
                  </div>

                  {/* Add dependency form */}
                  {addingDependency && (
                    <div className="bg-slate-950 rounded-lg p-3 border border-primary-600/30 mb-2 space-y-2">
                      <input
                        type="text"
                        value={newDepDesc}
                        onChange={(e) => setNewDepDesc(e.target.value)}
                        placeholder="Describe the dependency..."
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-primary-600"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={newDepOwner}
                        onChange={(e) => setNewDepOwner(e.target.value)}
                        placeholder="Owner (optional)"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-primary-600"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setAddingDependency(false); setNewDepDesc(''); setNewDepOwner('') }}
                          className="px-3 py-1 text-xs rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddDependency}
                          disabled={savingNew || !newDepDesc.trim()}
                          className="px-3 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50 transition-colors"
                        >
                          {savingNew ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {snapshot.dependencies.length === 0 && !addingDependency && (
                      <p className="text-xs text-slate-600 italic">No dependencies</p>
                    )}
                    {snapshot.dependencies.map((dep) => (
                        <div key={dep.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm flex-1 text-slate-300">{dep.description}</p>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleResolve('dependencies', dep.id)}
                                className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                                title="Resolve"
                              >
                                <Check size={12} /> Resolve
                              </button>
                              <button
                                onClick={() => setSnoozingId(snoozingId === dep.id ? null : dep.id)}
                                className="px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                                title="Snooze"
                              >
                                <Clock size={12} /> Snooze
                              </button>
                            </div>
                          </div>
                          {snoozingId === dep.id && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                              <input
                                type="date"
                                value={snoozeDate}
                                onChange={(e) => setSnoozeDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-primary-600"
                                min={new Date().toISOString().split('T')[0]}
                              />
                              <button
                                onClick={() => snoozeDate && handleSnooze('dependencies', dep.id, snoozeDate)}
                                disabled={!snoozeDate}
                                className="px-2 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setSnoozingId(null); setSnoozeDate('') }}
                                className="px-2 py-1 text-xs rounded text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                    ))}
                  </div>
                </div>

                {/* Recent Actions */}
                {snapshot.recentActions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Open Actions</h3>
                    <div className="space-y-2">
                      {snapshot.recentActions.slice(0, 5).map((action, i) => (
                        <div key={i} className="flex items-center gap-3 bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-xs text-slate-500 uppercase">{action.type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            action.priority === 'P0' ? 'bg-red-500/20 text-red-400' :
                            action.priority === 'P1' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>{action.priority}</span>
                          <span className="text-sm flex-1 text-slate-300">{action.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>) : (
                  /* History Tab */
                  <div className="space-y-6">
                    {/* Resolved Blockers */}
                    {(snapshot.history?.resolvedBlockers?.length || 0) > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-400 mb-2">
                          Resolved Blockers ({snapshot.history.resolvedBlockers.length})
                        </h3>
                        <div className="space-y-2">
                          {snapshot.history.resolvedBlockers.map((b) => (
                            <div key={b.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1">
                                  <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <p className="text-sm text-slate-400">{b.description}</p>
                                </div>
                              </div>
                              <div className="flex gap-3 mt-1.5 ml-5">
                                {b.resolvedAt && (
                                  <span className="text-xs text-slate-600">
                                    Resolved {new Date(b.resolvedAt).toLocaleDateString()}
                                  </span>
                                )}
                                {b.owner && (
                                  <span className="text-xs text-slate-600">Owner: {b.owner}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolved Dependencies */}
                    {(snapshot.history?.resolvedDependencies?.length || 0) > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-400 mb-2">
                          Resolved Dependencies ({snapshot.history.resolvedDependencies.length})
                        </h3>
                        <div className="space-y-2">
                          {snapshot.history.resolvedDependencies.map((d) => (
                            <div key={d.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-slate-400">{d.description}</p>
                              </div>
                              <div className="flex gap-3 mt-1.5 ml-5">
                                {d.resolvedAt && (
                                  <span className="text-xs text-slate-600">
                                    Resolved {new Date(d.resolvedAt).toLocaleDateString()}
                                  </span>
                                )}
                                {d.owner && (
                                  <span className="text-xs text-slate-600">Owner: {d.owner}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolved Issues */}
                    {(snapshot.history?.resolvedIssues?.length || 0) > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-400 mb-2">
                          Resolved Issues ({snapshot.history.resolvedIssues.length})
                        </h3>
                        <div className="space-y-2">
                          {snapshot.history.resolvedIssues.map((issue) => (
                            <div key={issue.id} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-slate-400">{issue.description}</p>
                              </div>
                              {issue.resolvedAt && (
                                <span className="text-xs text-slate-600 ml-5">
                                  Resolved {new Date(issue.resolvedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completed Actions */}
                    {(snapshot.history?.completedActions?.length || 0) > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-400 mb-2">
                          Completed Actions ({snapshot.history.completedActions.length})
                        </h3>
                        <div className="space-y-2">
                          {snapshot.history.completedActions.map((action) => (
                            <div key={action.id} className="flex items-center gap-3 bg-slate-950 rounded-lg p-3 border border-slate-800">
                              <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                              <span className="text-xs text-slate-500 uppercase">{action.type}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                action.priority === 'P0' ? 'bg-red-500/20 text-red-400' :
                                action.priority === 'P1' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-slate-700 text-slate-400'
                              }`}>{action.priority}</span>
                              <span className="text-sm flex-1 text-slate-400">{action.title}</span>
                              <span className="text-xs text-slate-600">
                                {new Date(action.completedAt).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty history state */}
                    {!(snapshot.history?.resolvedBlockers?.length || snapshot.history?.resolvedDependencies?.length || snapshot.history?.resolvedIssues?.length || snapshot.history?.completedActions?.length) && (
                      <div className="text-center py-8">
                        <CheckCircle2 size={32} className="mx-auto text-slate-700 mb-2" />
                        <p className="text-slate-500 text-sm">No resolved items yet</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No snapshot available</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
