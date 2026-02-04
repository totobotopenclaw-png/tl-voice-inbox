import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, Inbox, FolderKanban, BookOpen, Mic, Filter } from 'lucide-react'
import { useSearch } from '../hooks/useSearch'
import { SearchResult as SearchResultType } from '../types'

const typeIcons: Record<string, React.ElementType> = {
  action: Inbox,
  epic: FolderKanban,
  knowledge: BookOpen,
  event: Mic,
}

const typeLabels: Record<string, string> = {
  action: 'Action',
  epic: 'Epic',
  knowledge: 'Knowledge',
  event: 'Event',
}

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const { results, loading, search } = useSearch()

  useEffect(() => {
    if (query) {
      search(query)
    }
  }, [query, search])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Search Results</h1>
        {query && (
          <p className="text-slate-500 mt-1">
            Results for "<span className="text-slate-300">{query}</span>"
          </p>
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => {
            const value = e.target.value
            if (value) {
              setSearchParams({ q: value })
            } else {
              setSearchParams({})
            }
          }}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">Searching...⏎</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {results.map((result: SearchResultType) => {
            const Icon = typeIcons[result.type]
            return (
              <div
                key={`${result.type}-${result.id}`}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                    <Icon className="text-slate-400" style={{ width: 18, height: 18 }} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-200">{result.title}</h3>
                      <span className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-500">
                        {typeLabels[result.type]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{result.snippet}</p>
                  </div>

                  <span className="text-xs text-slate-600">Rank: {result.rank}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : query ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <SearchIcon size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">No results found</h3>
          <p className="text-slate-500">Try adjusting your search terms</p>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Filter size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Enter a search query</h3>
          <p className="text-slate-500">Search across actions, epics, and knowledge</p>
        </div>
      )}
    </div>
  )
}