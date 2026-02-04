// TTL Management for transcripts - cleanup expired data

import { db } from '../db/connection.js';
import fs from 'fs';

export interface CleanupResult {
  transcriptsCleared: number;
  audioFilesDeleted: number;
  errors: string[];
}

/**
 * Purge expired transcripts from the database
 * Returns count of cleared transcripts
 */
export function purgeExpiredTranscripts(): { count: number; eventIds: string[] } {
  const now = new Date().toISOString();
  
  // Find expired transcripts
  const expired = db.prepare(`
    SELECT id, audio_path, transcript 
    FROM events 
    WHERE transcript_expires_at IS NOT NULL 
      AND transcript_expires_at < ?
      AND transcript IS NOT NULL
  `).all(now) as { id: string; audio_path: string | null; transcript: string | null }[];

  if (expired.length === 0) {
    return { count: 0, eventIds: [] };
  }

  const eventIds = expired.map(e => e.id);
  
  // Clear transcripts
  const updateStmt = db.prepare(`
    UPDATE events 
    SET transcript = NULL,
        transcript_expires_at = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    for (const event of expired) {
      updateStmt.run(event.id);
    }
  });

  transaction();

  console.log(`[TTLManager] Purged ${expired.length} expired transcripts`);
  
  return { count: expired.length, eventIds };
}

/**
 * Delete audio files for events with expired transcripts
 * Returns count of deleted files
 */
export function cleanupAudioFiles(eventIds?: string[]): { deleted: number; errors: string[] } {
  const errors: string[] = [];
  let deleted = 0;

  // Get audio paths to clean up
  let query: string;
  let params: string[];

  if (eventIds && eventIds.length > 0) {
    // Use provided event IDs
    const placeholders = eventIds.map(() => '?').join(',');
    query = `SELECT id, audio_path FROM events WHERE id IN (${placeholders}) AND audio_path IS NOT NULL`;
    params = eventIds;
  } else {
    // Find all events where transcript has expired or been cleared
    query = `
      SELECT id, audio_path 
      FROM events 
      WHERE audio_path IS NOT NULL 
        AND (transcript IS NULL OR transcript_expires_at < datetime('now'))
    `;
    params = [];
  }

  const rows = db.prepare(query).all(...params) as { id: string; audio_path: string }[];

  for (const row of rows) {
    try {
      if (fs.existsSync(row.audio_path)) {
        fs.unlinkSync(row.audio_path);
        deleted++;
        
        // Also clean up any whisper-generated files
        const whisperTxt = `${row.audio_path}.txt`;
        if (fs.existsSync(whisperTxt)) {
          fs.unlinkSync(whisperTxt);
        }
      }
      
      // Clear audio_path from DB
      db.prepare(`
        UPDATE events SET audio_path = NULL, updated_at = datetime('now') WHERE id = ?
      `).run(row.id);
      
    } catch (err) {
      errors.push(`Failed to delete ${row.audio_path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (deleted > 0) {
    console.log(`[TTLManager] Deleted ${deleted} audio files`);
  }
  
  if (errors.length > 0) {
    console.error(`[TTLManager] Errors during cleanup:`, errors);
  }

  return { deleted, errors };
}

/**
 * Full cleanup - purge expired transcripts and delete associated audio files
 */
export function runCleanup(): CleanupResult {
  const errors: string[] = [];
  
  // Step 1: Purge expired transcripts
  const { count: transcriptsCleared, eventIds } = purgeExpiredTranscripts();
  
  // Step 2: Clean up audio files for those events plus any orphaned files
  const { deleted: audioFilesDeleted, errors: fileErrors } = cleanupAudioFiles(eventIds);
  
  errors.push(...fileErrors);

  return {
    transcriptsCleared,
    audioFilesDeleted,
    errors,
  };
}

/**
 * Schedule periodic cleanup
 */
export function scheduleCleanup(intervalHours: number = 24): NodeJS.Timeout {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  console.log(`[TTLManager] Scheduled cleanup every ${intervalHours} hours`);
  
  // Run immediately
  runCleanup();
  
  // Schedule periodic runs
  return setInterval(() => {
    console.log('[TTLManager] Running scheduled cleanup...');
    runCleanup();
  }, intervalMs);
}

/**
 * Get transcript storage statistics
 */
export function getTranscriptStats(): {
  totalWithTranscripts: number;
  expired: number;
  expiringSoon: number; // Within 24 hours
  totalAudioFiles: number;
} {
  const now = new Date().toISOString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN transcript IS NOT NULL THEN 1 ELSE 0 END) as total_with_transcripts,
      SUM(CASE WHEN transcript_expires_at IS NOT NULL AND transcript_expires_at < ? THEN 1 ELSE 0 END) as expired,
      SUM(CASE WHEN transcript_expires_at IS NOT NULL 
                AND transcript_expires_at > ? 
                AND transcript_expires_at < ? THEN 1 ELSE 0 END) as expiring_soon,
      SUM(CASE WHEN audio_path IS NOT NULL THEN 1 ELSE 0 END) as total_audio_files
    FROM events
  `).get(now, now, tomorrow.toISOString()) as {
    total_with_transcripts: number;
    expired: number;
    expiring_soon: number;
    total_audio_files: number;
  };

  return {
    totalWithTranscripts: stats.total_with_transcripts || 0,
    expired: stats.expired || 0,
    expiringSoon: stats.expiring_soon || 0,
    totalAudioFiles: stats.total_audio_files || 0,
  };
}
