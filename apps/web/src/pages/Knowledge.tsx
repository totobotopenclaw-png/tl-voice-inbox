import { useState } from 'react'
import { BookOpen, Plus, Search, Tag, FileText, Lightbulb, GitBranch, Loader2 } from 'lucide-react'
import { useKnowledge } from '../hooks/useKnowledge'

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
  const [filter, setFilter] = useState<'all' | 'tech' | 'process' | 'decision'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  
  const { items, loading, error } = useKnowledge({
    kind: filter === 'all' ? undefined : filter,
    search: searchQuery || undefined,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Knowledge Base</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium text-white transition-colors">
          <Plus size={16} />
          Add Note
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'tech', 'process', 'decision'] as const).map((f) => (
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

                    <div className="text-xs text-slate-600">
                      {item.epic_id ? (
                        <span className="text-primary-400">{item.epic_id}</span>
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
    </div>
  )
}
