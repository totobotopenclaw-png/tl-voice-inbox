const { db } = require('./dist/db/connection.js');
const { enqueue } = require('./dist/queue/manager.js');

const eventId = 'b04080bf-38fb-4811-a389-e1e4fbca6cdf';

// Get event transcript
const event = db.prepare('SELECT transcript FROM events WHERE id = ?').get(eventId);
console.log('Event transcript:', event?.transcript);

// Reset failed extract jobs for this event
const result = db.prepare(
  "UPDATE jobs SET status = 'pending', attempts = 0, error_message = NULL, updated_at = datetime('now') WHERE event_id = ? AND type = 'extract' AND status = 'failed'"
).run(eventId);
console.log('Reset jobs:', result.changes);

// If no jobs reset, create a new extraction job
if (result.changes === 0) {
  const job = enqueue(eventId, 'extract', { transcript: event.transcript });
  console.log('Created new extract job:', job.id);
} else {
  console.log('Retrying existing extract jobs');
}
