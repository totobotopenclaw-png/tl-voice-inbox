// Database test script - verifies all tables and search work correctly
import { db } from './connection.js';
import { migrate } from './migrate.js';
import { searchRepository } from './repositories/search.js';
import {
  eventsRepository,
  epicsRepository,
  actionsRepository,
  knowledgeRepository,
  blockersRepository,
  dependenciesRepository,
  issuesRepository,
  jobsRepository,
  pushSubscriptionsRepository,
  eventEpicCandidatesRepository,
  eventRunsRepository,
} from './repositories/index.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(`[TEST] ${message}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  log(`✓ ${message}`);
}

async function runTests(): Promise<void> {
  log('Starting database tests...\n');

  // Run migrations
  log('Running migrations...');
  migrate();
  log('Migrations complete\n');

  // Test 1: Events
  log('--- Testing Events ---');
  const event = eventsRepository.create('/audio/test.wav');
  assert(event.id != null, 'Event created with ID');
  assert(event.status === 'queued', 'Event has queued status');
  
  eventsRepository.updateStatus(event.id, 'transcribed');
  let updated = eventsRepository.findById(event.id);
  assert(updated?.status === 'transcribed', 'Event status updated');
  
  eventsRepository.setTranscript(event.id, 'Test transcript for searching', 14);
  updated = eventsRepository.findById(event.id);
  assert(updated?.transcript === 'Test transcript for searching', 'Event transcript set');
  assert(updated?.transcript_expires_at != null, 'Event transcript has expiry');
  log('');

  // Test 2: Epics and Aliases
  log('--- Testing Epics ---');
  const epic = epicsRepository.create('CP33 Backend Migration', 'Migrating from legacy to new stack');
  assert(epic.title === 'CP33 Backend Migration', 'Epic created');
  
  epicsRepository.addAlias(epic.id, 'CP33');
  epicsRepository.addAlias(epic.id, 'Car Park 33');
  const aliases = epicsRepository.getAliases(epic.id);
  assert(aliases.length === 2, 'Epic has 2 aliases');
  
  const foundByAlias = epicsRepository.findByAlias('cp33');
  assert(foundByAlias?.id === epic.id, 'Epic found by alias');
  log('');

  // Test 3: Actions
  log('--- Testing Actions ---');
  const action = actionsRepository.create({
    source_event_id: event.id,
    epic_id: epic.id,
    type: 'follow_up',
    title: 'Check database migration status',
    body: 'Verify all tables migrated correctly',
    priority: 'P1',
    due_at: null,
  });
  assert(action.title === 'Check database migration status', 'Action created');
  
  actionsRepository.addMention(action.id, 'Ana');
  const mentions = actionsRepository.getMentions(action.id);
  assert(mentions.length === 1 && mentions[0].name === 'Ana', 'Mention added');
  log('');

  // Test 4: Knowledge Items
  log('--- Testing Knowledge Items ---');
  const knowledge = knowledgeRepository.create({
    source_event_id: event.id,
    epic_id: epic.id,
    title: 'SQLite FTS5 Search',
    kind: 'tech',
    tags: ['sqlite', 'search', 'fts5'],
    body_md: 'FTS5 provides full-text search with BM25 ranking',
  });
  assert(knowledge.title === 'SQLite FTS5 Search', 'Knowledge item created');
  assert(knowledge.tags.length === 3, 'Knowledge item has 3 tags');
  log('');

  // Test 5: Blockers, Dependencies, Issues
  log('--- Testing Blockers/Dependencies/Issues ---');
  const blocker = blockersRepository.create({
    source_event_id: event.id,
    epic_id: epic.id,
    description: 'Waiting for approval',
  });
  assert(blocker.status === 'open', 'Blocker created');
  
  const dependency = dependenciesRepository.create({
    source_event_id: event.id,
    epic_id: epic.id,
    description: 'Depends on CP33 API',
  });
  assert(dependency.description === 'Depends on CP33 API', 'Dependency created');
  
  const issue = issuesRepository.create({
    source_event_id: event.id,
    epic_id: epic.id,
    description: 'Performance degradation detected',
  });
  assert(issue.status === 'open', 'Issue created');
  log('');

  // Test 6: Jobs
  log('--- Testing Jobs ---');
  const job = jobsRepository.create(event.id, 'stt', { eventId: event.id, audioPath: '/test.wav' });
  assert(job.type === 'stt', 'Job created');
  assert(job.status === 'pending', 'Job is pending');
  assert(job.payload?.eventId === event.id, 'Job has payload with eventId');
  
  jobsRepository.markRunning(job.id);
  let jobUpdated = jobsRepository.findById(job.id);
  assert(jobUpdated?.status === 'running', 'Job marked running');
  
  jobsRepository.markCompleted(job.id);
  jobUpdated = jobsRepository.findById(job.id);
  assert(jobUpdated?.status === 'completed', 'Job marked completed');
  
  // Test enqueue method
  const job2 = jobsRepository.enqueue(event.id, 'extract', { eventId: event.id }, { maxAttempts: 5 });
  assert(job2.type === 'extract', 'Enqueued job created');
  assert(job2.max_attempts === 5, 'Enqueued job has custom max attempts');
  log('');

  // Test 7: Push Subscriptions
  log('--- Testing Push Subscriptions ---');
  const subscription = pushSubscriptionsRepository.create({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    p256dh: 'test-p256dh-key',
    auth: 'test-auth-secret',
    user_agent: 'Mozilla/5.0 Test',
  });
  assert(subscription.endpoint === 'https://fcm.googleapis.com/fcm/send/test', 'Push subscription created');
  
  const found = pushSubscriptionsRepository.findByEndpoint('https://fcm.googleapis.com/fcm/send/test');
  assert(found?.auth === 'test-auth-secret', 'Push subscription found by endpoint');
  log('');

  // Test 8: Event Epic Candidates
  log('--- Testing Event Epic Candidates ---');
  const candidate = eventEpicCandidatesRepository.create(event.id, epic.id, 0.85, 1);
  assert(candidate.score === 0.85, 'Candidate created');
  
  const candidates = eventEpicCandidatesRepository.findByEventId(event.id);
  assert(candidates.length === 1, 'Candidates found for event');
  log('');

  // Test 9: Event Runs
  log('--- Testing Event Runs ---');
  const run = eventRunsRepository.create(event.id, 'extract', { transcript: 'test' });
  assert(run.job_type === 'extract', 'Event run created');
  
  eventRunsRepository.complete(run.id, { result: 'success' }, 1500);
  const runUpdated = eventRunsRepository.findById(run.id);
  assert(runUpdated?.status === 'success', 'Event run completed');
  assert(runUpdated?.duration_ms === 1500, 'Event run has duration');
  log('');

  // Test 10: FTS5 Search (Milestone 1 key feature)
  log('--- Testing FTS5 Search ---');
  
  // Add another epic for search testing
  const epic2 = epicsRepository.create('User Authentication', 'OAuth2 and SSO implementation');
  
  // Add more content to search
  const action2 = actionsRepository.create({
    source_event_id: event.id,
    epic_id: epic2.id,
    type: 'deadline',
    title: 'Complete OAuth integration',
    body: 'Implement Google OAuth and Microsoft SSO',
    priority: 'P0',
    due_at: new Date().toISOString(),
  });
  
  const knowledge2 = knowledgeRepository.create({
    source_event_id: event.id,
    epic_id: epic2.id,
    title: 'OAuth2 Flow Documentation',
    kind: 'tech',
    tags: ['oauth', 'security', 'authentication'],
    body_md: 'OAuth2 authorization code flow with PKCE extension',
  });

  // Wait a moment for triggers to fire
  await sleep(100);

  // Test search
  const searchResults = searchRepository.search('database migration', 10);
  assert(searchResults.length > 0, `Search found ${searchResults.length} results`);
  
  const hasDatabaseResult = searchResults.some(r => 
    r.title.toLowerCase().includes('database') || 
    r.content.toLowerCase().includes('database')
  );
  assert(hasDatabaseResult, 'Search found database-related content');

  // Test OAuth search
  const oauthResults = searchRepository.search('OAuth', 10);
  assert(oauthResults.length >= 1, `OAuth search found ${oauthResults.length} results`);

  // Test BM25 ranking (lower rank = better match)
  const ranked = searchRepository.searchWithSnippets('SQLite FTS5', 5);
  assert(ranked.length > 0, 'BM25 ranked search returned results');
  assert(ranked[0].rank != null, 'Results have BM25 rank');
  log(`Search snippet: "${ranked[0].snippet}"`);

  // Test search stats
  const stats = searchRepository.getStats();
  assert(stats.totalDocuments >= 3, `Search index has ${stats.totalDocuments} documents`);
  assert(stats.actions >= 1, `Search index has ${stats.actions} actions`);
  log(`Search stats: ${JSON.stringify(stats)}`);
  log('');

  // Test 11: Epic Candidate Scoring via FTS
  log('--- Testing Epic Candidate Scoring ---');
  const candidatesViaFts = epicsRepository.findCandidates('CP33 Migration', 3);
  assert(candidatesViaFts.length > 0, 'FTS found epic candidates');
  assert(candidatesViaFts[0].epic.id === epic.id, 'Top candidate is CP33 Backend Migration');
  log(`Top candidate: ${candidatesViaFts[0].epic.title} (score: ${candidatesViaFts[0].score})`);
  log('');

  // Test 12: Rebuild index
  log('--- Testing Index Rebuild ---');
  searchRepository.rebuildIndex();
  const statsAfterRebuild = searchRepository.getStats();
  assert(statsAfterRebuild.totalDocuments === stats.totalDocuments, 'Index rebuilt with same count');
  log('');

  log('========================================');
  log('ALL TESTS PASSED ✓');
  log('========================================');
  log('');
  log('Summary:');
  log('- All core tables created and working');
  log('- FTS5 search with BM25 ranking functional');
  log('- All repositories CRUD operations verified');
  log('- Triggers syncing FTS index working');
}

// Run tests
runTests()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test failed:', err);
    db.close();
    process.exit(1);
  });
