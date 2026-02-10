import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, Search, Tag, FileText, Lightbulb, GitBranch, Loader2, X, FolderKanban } from 'lucide-react'
import { useKnowledge } from '../hooks/useKnowledge'

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '') 
  : '';

const kindIcons: Record<string, React.ElementType> = {
  tech: FileText,
  process: GitBranch,
  decision: Lightbulb,
}

const kindColors: Record<string, string> = {
  tech: 'text-blue-400 bg-blue-500/10',
  process: 'text-emerald-400 bg-emerald-500/10',
  decision: 'text-amber-400 bg-amber-500/10',
}

export function Knowledge() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'tech' | 'process' | 'decision'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { items, loading, error, refetch: refresh } = useKnowledge({
    kind: filter === 'all' ? undefined : filter,
    search: searchQuery || undefined,
  })
  
  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newItem, setNewItem] = useState({
    title: '',
    bodyMd: '',
    kind: 'tech' as const,
    tags: '',
  })

  const handleCreateKnowledge = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItem.title.trim()) return
    
    setCreating(true)
    try {
      const tags = newItem.tags.split(',').map(t => t.trim()).filter(Boolean)

      const response = await fetch(`${API_URL}/api/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEventId: 'manual-entry-sentinel',
          title: newItem.title,
          bodyMd: newItem.bodyMd,
          kind: newItem.kind,
          tags,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create knowledge')
      }
      
      // Refresh list
      refresh()
      
      // Reset form
      setNewItem({ title: '', bodyMd: '', kind: 'tech', tags: '' })
      setShowCreateModal(false)
    } catch (err) {
      alert('Failed to create: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Knowledge Base</h1>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Plus size={16} />
          Add Note
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'tech', 'process', 'decision'] as const).map((f) => (
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
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          Error loading knowledge: {error}
        </div>
      )}

      {/* Knowledge List */}
      <div className="space-y-3">
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No knowledge items found
          </div>
        )}
        
        {items.map((item) => {
          const Icon = kindIcons[item.kind]
          return (
            <div
              key={item.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kindColors[item.kind]}`}>
                  <Icon size={18} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium text-slate-200">{item.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${kindColors[item.kind]}`}>
                      {item.kind}
                    </span>
                  </div>

                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">
                    {item.body_md?.substring(0, 200)}...
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-500"
                        >
                          <Tag size={10} /> {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      {(item as any).epicTitle ? (
                        <span
                          className="flex items-center gap-1 text-primary-400 hover:text-primary-300 cursor-pointer hover:underline"
                          onClick={() => navigate(`/epics?open=${item.epic_id}`)}
                        >
                          <FolderKanban size={11} />
                          {(item as any).epicTitle}
                        </span>
                      ) : item.epic_id ? (
                        <span
                          className="flex items-center gap-1 text-primary-400 hover:text-primary-300 cursor-pointer hover:underline"
                          onClick={() => navigate(`/epics?open=${item.epic_id}`)}
                        >
                          <FolderKanban size={11} />
                          {item.epic_id.substring(0, 8)}...
                        </span>
                      ) : (
                        <span>General</span>
                      )}
                      <span className="mx-2">•</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Knowledge Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-xl sm:rounded-xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-100">Add Knowledge Note</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateKnowledge} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={newItem.title}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  placeholder="e.g., Database Connection Pooling"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Content (Markdown)</label>
                <textarea
                  value={newItem.bodyMd}
                  onChange={(e) => setNewItem({ ...newItem, bodyMd: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600 h-40 font-mono text-sm"
                  placeholder="# Heading&#10;&#10;Your content here..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Type</label>
                  <select
                    value={newItem.kind}
                    onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                  >
                    <option value="tech">Technical</option>
                    <option value="process">Process</option>
                    <option value="decision">Decision (ADR)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={newItem.tags}
                    onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-primary-600"
                    placeholder="database, performance"
                  />
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
                  disabled={creating || !newItem.title.trim()}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  {creating ? 'Creating...' : 'Add Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
