import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

export interface BriefingAction {
  id: string;
  type: 'action' | 'deadline';
  title: string;
  priority: string;
  dueAt: string;
  epicId: string | null;
  epicTitle: string | null;
  daysOverdue: number;
}

export interface BriefingBlocker {
  id: string;
  type: 'blocker' | 'dependency';
  description: string;
  epicId: string | null;
  epicTitle: string | null;
  owner: string | null;
  eta: string | null;
  daysSinceUpdate: number;
}

export interface BriefingEvent {
  id: string;
  status: string;
  transcriptPreview: string | null;
  createdAt: string;
}

export interface EpicHealth {
  id: string;
  title: string;
  openBlockers: number;
  openDeps: number;
  overdueActions: number;
  dueTodayActions: number;
}

export interface BriefingCounts {
  openActions: number;
  overdueActions: number;
  dueTodayActions: number;
  upcomingThisWeek: number;
  openBlockers: number;
  staleBlockers: number;
  needsReview: number;
}

export interface Briefing {
  overdue: BriefingAction[];
  dueToday: BriefingAction[];
  upcomingThisWeek: BriefingAction[];
  epicHealth: EpicHealth[];
  staleBlockers: BriefingBlocker[];
  needsReviewCount: number;
  recentEvents: BriefingEvent[];
  counts: BriefingCounts;
}

export function useBriefing(autoRefreshMs: number = 60000) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/dashboard/briefing`);
      if (!response.ok) throw new Error('Failed to fetch briefing');
      const data = await response.json();
      setBriefing(data.briefing);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, autoRefreshMs);
    return () => clearInterval(interval);
  }, [refresh, autoRefreshMs]);

  return { briefing, loading, error, refresh };
}
