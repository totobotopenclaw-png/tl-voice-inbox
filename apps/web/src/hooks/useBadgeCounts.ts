import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '')
  : '';

export interface BadgeCounts {
  openActions: number;
  overdueActions: number;
  dueTodayActions: number;
  openBlockers: number;
  staleBlockers: number;
  needsReview: number;
}

export function useBadgeCounts(pollIntervalMs: number = 30000) {
  const [counts, setCounts] = useState<BadgeCounts | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/dashboard/briefing`);
      if (!response.ok) return;
      const data = await response.json();
      setCounts(data.briefing.counts);
    } catch {
      // Silently fail — badge counts are non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  return { counts };
}
