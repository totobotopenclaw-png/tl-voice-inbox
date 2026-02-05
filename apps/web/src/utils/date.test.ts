import { describe, it, expect } from 'vitest';
import { formatDistanceToNow, formatDate, formatDuration } from './date';

describe('date utils', () => {
  describe('formatDistanceToNow', () => {
    it('should return "just now" for recent dates', () => {
      const now = new Date().toISOString();
      expect(formatDistanceToNow(now)).toBe('just now');
    });

    it('should return seconds ago', () => {
      const date = new Date(Date.now() - 30000).toISOString();
      expect(formatDistanceToNow(date)).toBe('30s ago');
    });

    it('should return minutes ago', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatDistanceToNow(date)).toBe('5m ago');
    });

    it('should return hours ago', () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(formatDistanceToNow(date)).toBe('3h ago');
    });

    it('should return days ago', () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatDistanceToNow(date)).toBe('2d ago');
    });

    it('should handle empty string', () => {
      expect(formatDistanceToNow('')).toBe('unknown');
    });

    it('should handle invalid date', () => {
      expect(formatDistanceToNow('invalid')).toBe('invalid date');
    });
  });

  describe('formatDate', () => {
    it('should format valid date', () => {
      const date = '2026-02-05T12:00:00Z';
      const result = formatDate(date);
      expect(result).toContain('Feb');
      expect(result).toMatch(/Feb \d+/);  // Contains Feb and a day number
    });

    it('should handle empty string', () => {
      expect(formatDate('')).toBe('N/A');
    });

    it('should handle invalid date', () => {
      expect(formatDate('invalid')).toBe('Invalid Date');
    });

    it('should handle null/undefined gracefully', () => {
      expect(formatDate(null as unknown as string)).toBe('N/A');
      expect(formatDate(undefined as unknown as string)).toBe('N/A');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds to MM:SS', () => {
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(125)).toBe('2:05');
    });

    it('should pad seconds', () => {
      expect(formatDuration(5)).toBe('0:05');
    });
  });
});
