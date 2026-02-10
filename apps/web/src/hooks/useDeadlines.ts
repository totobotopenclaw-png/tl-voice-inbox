import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

export interface Deadline {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  epicTitle: string | null;
  type: string;
  status: 'open' | 'done';
}

export function useDeadlines() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/actions?hasDueDate=true&status=open`);
      if (!response.ok) throw new Error('Failed to fetch deadlines');
      const data = await response.json();
      const mapped = data.actions
        .map((a: Record<string, unknown>) => ({
          id: a.id as string,
          title: a.title as string,
          priority: a.priority as string,
          dueAt: a.dueAt as string | null,
          epicTitle: a.epicTitle as string | null,
          type: a.type as string,
          status: a.status as 'open' | 'done',
        }))
        .sort((a: Deadline, b: Deadline) => {
          if (!a.dueAt) return 1;
          if (!b.dueAt) return -1;
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        });
      setDeadlines(mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { deadlines, loading, error, refresh };
}
