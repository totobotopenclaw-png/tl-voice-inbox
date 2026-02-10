import { Search as SearchIcon, X } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '../hooks/useSearch'
import { SearchResult } from './SearchResult'

export function Header() {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const { results, loading, search } = useSearch()
  const navigate = useNavigate()

  const debouncedSearch = useCallback(
    (q: string) => {
      search(q)
    },
    [search]
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query) {
        debouncedSearch(query)
      }
    }, 200)

    return () => clearTimeout(timeout)
  }, [query, debouncedSearch])

  const handleSearchClick = () => {
    setShowResults(true)
  }

  const handleResultClick = (result: { type: string; id: string }) => {
    setShowResults(false)
    setQuery('')
    navigate(`/${result.type}s`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query) {
      navigate(`/search?q=${encodeURIComponent(query)}`)
      setShowResults(false)
    }
  }

  return (
    <header className="h-16 shrink-0 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex items-center px-6">
      <div className="lg:hidden w-10" /> {/* Spacer for mobile menu button */}
      
      <div className="flex-1 max-w-xl relative">
        <div className="relative">
          <SearchIcon
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Search actions, epics, knowledge..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleSearchClick}
            onKeyDown={handleKeyDown}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-10 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setShowResults(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {showResults && query && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {loading ? (
              <div className="p-4 text-center text-slate-500 text-sm">Searching...⏎</div>
            ) : results.length > 0 ? (
              <div className="max-h-80 overflow-auto">
                {results.map((result) => (
                  <SearchResult
                    key={`${result.type}-${result.id}`}
                    result={result}
                    onClick={() => handleResultClick(result)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 text-sm">⏎
                No results found⏎
              </div>
            )}
            <div className="px-4 py-2 bg-slate-850 border-t border-slate-700 text-xs text-slate-500">⏎
              Press Enter to view all results⏎
            </div>
          </div>
        )}
      </div>
    </header>
  )
}