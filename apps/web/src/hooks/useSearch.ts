import { useState, useCallback } from 'react'
import { SearchResult } from '../types'

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      // const data = await response.json()
      
      // Mock results for now
      const mockResults: SearchResult[] = [
        {
          type: 'action',
          id: '1',
          title: 'Revisar PR de autenticación',
          snippet: 'Follow-up para revisar el pull request de autenticación antes del viernes...',
          rank: 1,
        },
        {
          type: 'epic',
          id: '2',
          title: 'Migration API v2',
          snippet: 'Epic para la migración completa de la API a la versión 2...',
          rank: 2,
        },
        {
          type: 'knowledge',
          id: '3',
          title: 'Decision: Database Choice',
          snippet: 'Decisión técnica sobre el uso de PostgreSQL vs SQLite...',
          rank: 3,
        },
      ]
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300))
      setResults(mockResults)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  return { results, loading, error, search }
}