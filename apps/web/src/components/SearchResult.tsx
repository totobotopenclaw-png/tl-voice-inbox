import { Inbox, FolderKanban, BookOpen, Mic } from 'lucide-react'
import { SearchResult as SearchResultType } from '../types'

interface SearchResultProps {
  result: SearchResultType
  onClick: () => void
}

const typeIcons = {
  action: Inbox,
  epic: FolderKanban,
  knowledge: BookOpen,
  event: Mic,
}

const typeLabels = {
  action: 'Action',
  epic: 'Epic',
  knowledge: 'Knowledge',
  event: 'Event',
}

export function SearchResult({ result, onClick }: SearchResultProps) {
  const Icon = typeIcons[result.type]

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded bg-slate-700/50">
          <Icon size={14} className="text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{result.title}</p>
          <p className="text-xs text-slate-500 line-clamp-2">{result.snippet}</p>
          <p className="text-xs text-slate-600 mt-1">{typeLabels[result.type]}</p>
        </div>
      </div>
    </button>
  )
}