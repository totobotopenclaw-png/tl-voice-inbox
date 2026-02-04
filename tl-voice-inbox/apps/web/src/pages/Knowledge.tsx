import { useState } from 'react'
import { BookOpen, Plus, Search, Tag, FileText, Lightbulb, GitBranch } from 'lucide-react'

const mockKnowledge = [
  {
    id: '1',
    title: 'Database Schema v2 Design',
    kind: 'tech',
    tags: ['database', 'schema', 'postgres'],
    epic_id: 'api-v2',
    preview: 'The new schema introduces partitioned tables for better performance at scale...',
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Decision: GraphQL vs REST',
    kind: 'decision',
    tags: ['api', 'graphql', 'architecture'],
    epic_id: 'api-v2',
    preview: 'After evaluating both approaches, we decided to stick with REST for v2 due to...',
    created_at: '2026-01-28T14:00:00Z',
  },
  {
    id: '3',
    title: 'Onboarding Process for Backend Devs',
    kind: 'process',
    tags: ['onboarding', 'docs'],
    epic_id: null,
    preview: 'Step-by-step guide for new backend developers joining the team...',
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    id: '4',
    title: 'OAuth2 Implementation Details',
    kind: 'tech',
    tags: ['auth', 'oauth', 'security'],
    epic_id: 'auth-migration',
    preview: 'Token flow, refresh strategy, and security considerations...',
    created_at: '2026-02-03T16:00:00Z',
  },
  {
    id: '5',
    title: 'Decision: Monorepo Structure',
    kind: 'decision',
    tags: ['architecture', 'monorepo'],
    epic_id: null,
    preview: 'Why we chose pnpm workspaces over Nx or Turborepo...',
    created_at: '2026-01-20T11:00:00Z',
  },
]

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

  const filteredKnowledge = mockKnowledge.filter((item) => {
    if (filter !== 'all' && item.kind !== filter) return false
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
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

      {/* Knowledge List */}
      <div className="space-y-3">
        {filteredKnowledge.map((item) => {
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

                  <p className="text-sm text-slate-500 mb-3">{item.preview}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.tags.map((tag) => (
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