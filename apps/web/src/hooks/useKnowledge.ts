import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeItem } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface UseKnowledgeOptions {
  kind?: 'tech' | 'process' | 'decision';
  epicId?: string;
  search?: string;
}

export function useKnowledge(options: UseKnowledgeOptions = {}) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.kind) params.set('kind', options.kind);
      if (options.epicId) params.set('epicId', options.epicId);
      if (options.search) params.set('search', options.search);
      params.set('limit', '50');

      const response = await fetch(`${API_URL}/api/knowledge?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch knowledge: ${response.status}`);
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge');
    } finally {
      setLoading(false);
    }
  }, [options.kind, options.epicId, options.search]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const createItem = useCallback(async (item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch(`${API_URL}/api/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });

      if (!response.ok) {
        throw new Error(`Failed to create knowledge: ${response.status}`);
      }

      const data = await response.json();
      setItems(prev => [data, ...prev]);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create knowledge');
      throw err;
    }
  }, []);

  const updateItem = useCallback(async (id: string, updates: Partial<KnowledgeItem>) => {
    try {
      const response = await fetch(`${API_URL}/api/knowledge/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update knowledge: ${response.status}`);
      }

      const data = await response.json();
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...data.item } : i));
      return data.item;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update knowledge');
      throw err;
    }
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/knowledge/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete knowledge: ${response.status}`);
      }

      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete knowledge');
      throw err;
    }
  }, []);

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
    createItem,
    updateItem,
    deleteItem,
  };
}
