import { useState, useEffect } from 'react'
import { FolderKanban, Plus, Search, MoreVertical, CheckCircle2, Circle, AlertCircle, X, Edit2 } from 'lucide-react'

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

interface EpicSnapshot {
  epic: {
    id: string
    title: string
    description: string | null
  }
  aliases: string[]
  blockers: Array<{ description: string; status: string }>
  dependencies: Array<{ description: string; status: string }>
  issues: Array<{ description: string; status: string }>
  recentActions: Array<{ type: string; title: string; priority: string; completed: boolean }>
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
              <div>
                <h2 className="text-xl font-bold text-slate-100">{selectedEpic.title}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedEpic.aliases.join(', ')}
                </p>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="text-slate-500 hover:text-slate-300"
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

                {/* Blockers */}
                {snapshot.blockers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Open Blockers</h3>
                    <div className="space-y-2">
                      {snapshot.blockers.map((b, i) => (
                        <div key={i} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <p className="text-sm text-slate-300">{b.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Issues */}
                {snapshot.issues.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Open Issues</h3>
                    <div className="space-y-2">
                      {snapshot.issues.map((issue, i) => (
                        <div key={i} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <p className="text-sm text-slate-300">{issue.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dependencies */}
                {snapshot.dependencies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Dependencies</h3>
                    <div className="space-y-2">
                      {snapshot.dependencies.map((dep, i) => (
                        <div key={i} className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <p className="text-sm text-slate-300">{dep.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Actions */}
                {snapshot.recentActions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Recent Actions</h3>
                    <div className="space-y-2">
                      {snapshot.recentActions.slice(0, 5).map((action, i) => (
                        <div key={i} className="flex items-center gap-3 bg-slate-950 rounded-lg p-3 border border-slate-800">
                          <div className={`w-2 h-2 rounded-full ${action.completed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span className="text-xs text-slate-500 uppercase">{action.type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            action.priority === 'P0' ? 'bg-red-500/20 text-red-400' :
                            action.priority === 'P1' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>{action.priority}</span>
                          <span className="text-sm text-slate-300 flex-1">{action.title}</span>
                        </div>
                      ))}
                    </div>
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
