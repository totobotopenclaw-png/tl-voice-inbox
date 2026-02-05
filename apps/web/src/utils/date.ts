/**
 * Format a date string as a relative time (e.g., "2 minutes ago")
 */
export function formatDistanceToNow(dateString: string): string {
  if (!dateString) return 'unknown';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'invalid date';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) {
    return 'just now';
  } else if (diffSecs < 60) {
    return `${diffSecs}s ago`;
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    const opts: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric'
    };
    if (date.getFullYear() !== now.getFullYear()) {
      opts.year = 'numeric';
    }
    return date.toLocaleDateString('en-US', opts);
  }
}

/**
 * Format a date string for display
 */
export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  try {
    return date.toLocaleString('en-US', { ...defaultOptions, ...options });
  } catch (e) {
    console.error('Date formatting error:', e);
    return date.toISOString();
  }
}

/**
 * Format duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
