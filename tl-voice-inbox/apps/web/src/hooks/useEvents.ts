import { useState, useEffect, useCallback } from 'react';

export interface Event {
  id: string;
  status: 'queued' | 'transcribing' | 'transcribed' | 'processing' | 'processed' | 'needs_review' | 'error';
  transcript: string | null;
  hasTranscript: boolean;
  detectedCommand: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventDetail extends Event {
  statusReason: string | null;
  transcriptExpiresAt: string | null;
  jobs: JobInfo[];
}

export interface JobInfo {
  id: string;
  type: 'stt' | 'extract' | 'reprocess' | 'push';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retry';
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface EventsResponse {
  events: Event[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useEvents(limit: number = 20) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<EventsResponse['pagination'] | null>(null);

  const fetchEvents = useCallback(async (offset: number = 0) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/events?limit=${limit}&offset=${offset}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status}`);
      }

      const data: EventsResponse = await response.json();
      
      if (offset === 0) {
        setEvents(data.events);
      } else {
        setEvents(prev => [...prev, ...data.events]);
      }
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const refresh = useCallback(() => {
    fetchEvents(0);
  }, [fetchEvents]);

  const loadMore = useCallback(() => {
    if (pagination?.hasMore && !loading) {
      fetchEvents(pagination.offset + pagination.limit);
    }
  }, [pagination, loading, fetchEvents]);

  useEffect(() => {
    fetchEvents(0);
  }, [fetchEvents]);

  // Auto-refresh every 5 seconds when there are processing events
  useEffect(() => {
    const hasProcessingEvents = events.some(e => 
      e.status === 'queued' || e.status === 'transcribing' || e.status === 'processing'
    );
    
    if (!hasProcessingEvents) return;

    const interval = setInterval(() => {
      fetchEvents(0);
    }, 5000);

    return () => clearInterval(interval);
  }, [events, fetchEvents]);

  return {
    events,
    loading,
    error,
    pagination,
    refresh,
    loadMore,
  };
}

export function useEventDetail(eventId: string | null) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    if (!eventId) {
      setEvent(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/events/${eventId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Event not found');
        }
        throw new Error(`Failed to fetch event: ${response.status}`);
      }

      const data: EventDetail = await response.json();
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Auto-refresh when event is processing
  useEffect(() => {
    if (!event) return;
    
    const isProcessing = event.status === 'queued' || 
                         event.status === 'transcribing' || 
                         event.status === 'processing';
    
    if (!isProcessing) return;

    const interval = setInterval(() => {
      fetchEvent();
    }, 3000);

    return () => clearInterval(interval);
  }, [event, fetchEvent]);

  return {
    event,
    loading,
    error,
    refresh: fetchEvent,
  };
}
