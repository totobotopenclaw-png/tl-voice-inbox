import { useState, useEffect, useCallback } from 'react';
import type { Action } from '../types';

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '') 
  : '';

interface UseActionsOptions {
  status?: 'open' | 'done';
  epicId?: string;
  type?: 'follow_up' | 'deadline' | 'email';
}

export function useActions(options: UseActionsOptions = {}) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options.status) params.set('status', options.status);
      if (options.epicId) params.set('epicId', options.epicId);
      if (options.type) params.set('type', options.type);
      params.set('limit', '50');

      const url = `${API_URL}/api/actions?${params}`;
      console.log('[useActions] Fetching:', url);
      
      const response = await fetch(url);
      console.log('[useActions] Response:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch actions: ${response.status}`);
      }

      const data = await response.json();
      setActions(data.actions || []);
    } catch (err) {
      console.error('[useActions] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch actions');
    } finally {
      setLoading(false);
    }
  }, [options.status, options.epicId, options.type]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const createAction = useCallback(async (action: Omit<Action, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch(`${API_URL}/api/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });

      if (!response.ok) {
        throw new Error(`Failed to create action: ${response.status}`);
      }

      const data = await response.json();
      setActions(prev => [data, ...prev]);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create action');
      throw err;
    }
  }, []);

  const updateAction = useCallback(async (id: string, updates: Partial<Action>) => {
    try {
      const response = await fetch(`${API_URL}/api/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update action: ${response.status}`);
      }

      const data = await response.json();
      setActions(prev => prev.map(a => a.id === id ? { ...a, ...data.action } : a));
      return data.action;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update action');
      throw err;
    }
  }, []);

  const deleteAction = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/actions/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete action: ${response.status}`);
      }

      setActions(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete action');
      throw err;
    }
  }, []);

  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    return updateAction(id, { status: completed ? 'done' : 'open' });
  }, [updateAction]);

  return {
    actions,
    loading,
    error,
    refetch: fetchActions,
    createAction,
    updateAction,
    deleteAction,
    toggleComplete,
  };
}
