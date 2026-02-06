import { useState, useEffect, useCallback } from 'react';

// Use relative URL in development (hits Vite proxy), absolute in production
const API_URL = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '') 
  : '';

export interface Event {
  id: string;
  status: 'queued' | 'transcribing' | 'transcribed' | 'processing' | 'processed' | 'needs_review' | 'completed' | 'error';
  transcript: string | null;
  hasTranscript: boolean;
  transcriptPreview: string | null;
  detectedCommand: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  epicId: string;
  title: string;
  confidence: number;
}

export interface AssignedEpic {
  id: string;
  title: string;
}

export interface EventDetail extends Event {
  statusReason: string | null;
  transcriptExpiresAt: string | null;
  jobs: JobInfo[];
  candidates: Candidate[] | null;
  assignedEpic: AssignedEpic | null;
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
}

export function useEvents(limit: number = 50) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = `${API_URL}/api/events?limit=${limit}`;
      console.log('[useEvents] Fetching:', url);
      
      const response = await fetch(url);
      console.log('[useEvents] Response:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status}`);
      }

      const data: EventsResponse = await response.json();
      setEvents(data.events);
    } catch (err) {
      console.error('[useEvents] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const refresh = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh every 5 seconds when there are processing events
  useEffect(() => {
    const hasProcessingEvents = events.some(e => 
      e.status === 'queued' || e.status === 'transcribing' || e.status === 'processing'
    );
    
    if (!hasProcessingEvents) return;

    const interval = setInterval(() => {
      fetchEvents();
    }, 5000);

    return () => clearInterval(interval);
  }, [events, fetchEvents]);

  return {
    events,
    loading,
    error,
    refresh,
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

      const data = await response.json();
      setEvent({
        ...data.event,
        jobs: data.jobs,
        candidates: data.candidates,
        assignedEpic: data.assignedEpic,
      });
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
