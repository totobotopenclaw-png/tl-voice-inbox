// Dashboard briefing API routes

import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';

export async function dashboardRoutes(server: FastifyInstance): Promise<void> {

  // GET /api/dashboard/briefing - Aggregated morning briefing
  server.get('/briefing', async (request) => {
    const { staleThresholdDays = '3' } = request.query as { staleThresholdDays?: string };
    const threshold = parseInt(staleThresholdDays, 10);

    // Overdue actions (past due_at, not completed)
    const overdueRows = db.prepare(`
      SELECT a.id, a.title, a.priority, a.due_at, a.type, a.epic_id, e.title as epic_title,
        CAST(julianday('now') - julianday(a.due_at) AS INTEGER) as days_overdue
      FROM actions a
      LEFT JOIN epics e ON a.epic_id = e.id
      WHERE a.completed_at IS NULL AND a.due_at IS NOT NULL AND a.due_at < datetime('now')
      ORDER BY
        CASE a.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END ASC,
        a.due_at ASC
    `).all() as Array<{
      id: string; title: string; priority: string; due_at: string; type: string;
      epic_id: string | null; epic_title: string | null; days_overdue: number;
    }>;

    // Due today actions
    const dueTodayRows = db.prepare(`
      SELECT a.id, a.title, a.priority, a.due_at, a.type, a.epic_id, e.title as epic_title
      FROM actions a
      LEFT JOIN epics e ON a.epic_id = e.id
      WHERE a.completed_at IS NULL AND a.due_at IS NOT NULL
        AND a.due_at >= datetime('now', 'start of day')
        AND a.due_at < datetime('now', 'start of day', '+1 day')
      ORDER BY
        CASE a.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END ASC,
        a.due_at ASC
    `).all() as Array<{
      id: string; title: string; priority: string; due_at: string; type: string;
      epic_id: string | null; epic_title: string | null;
    }>;

    // Upcoming this week (tomorrow through +7 days)
    const upcomingRows = db.prepare(`
      SELECT a.id, a.title, a.priority, a.due_at, a.type, a.epic_id, e.title as epic_title,
        CAST(julianday(a.due_at) - julianday('now') AS INTEGER) as days_until
      FROM actions a
      LEFT JOIN epics e ON a.epic_id = e.id
      WHERE a.completed_at IS NULL AND a.due_at IS NOT NULL
        AND a.due_at >= datetime('now', 'start of day', '+1 day')
        AND a.due_at < datetime('now', 'start of day', '+7 days')
      ORDER BY a.due_at ASC
    `).all() as Array<{
      id: string; title: string; priority: string; due_at: string; type: string;
      epic_id: string | null; epic_title: string | null; days_until: number;
    }>;

    // Epic health - active epics with items needing attention
    const epicHealthRows = db.prepare(`
      SELECT e.id, e.title,
        (SELECT COUNT(*) FROM blockers WHERE epic_id = e.id AND status = 'open') as open_blockers,
        (SELECT COUNT(*) FROM dependencies WHERE epic_id = e.id AND status = 'open') as open_deps,
        (SELECT COUNT(*) FROM actions WHERE epic_id = e.id AND completed_at IS NULL
          AND due_at IS NOT NULL AND due_at < datetime('now')) as overdue_actions,
        (SELECT COUNT(*) FROM actions WHERE epic_id = e.id AND completed_at IS NULL
          AND due_at IS NOT NULL AND due_at >= datetime('now', 'start of day')
          AND due_at < datetime('now', 'start of day', '+1 day')) as due_today
      FROM epics e
      WHERE e.status = 'active'
      ORDER BY overdue_actions DESC, open_blockers DESC, due_today DESC
    `).all() as Array<{
      id: string; title: string; open_blockers: number; open_deps: number;
      overdue_actions: number; due_today: number;
    }>;

    // Filter to only epics with something needing attention
    const epicHealthFiltered = epicHealthRows.filter(
      e => e.open_blockers + e.open_deps + e.overdue_actions + e.due_today > 0
    ).slice(0, 5);

    // Stale blockers
    const staleBlockerRows = db.prepare(`
      SELECT b.id, b.description, b.epic_id, b.owner, b.eta, b.updated_at,
        e.title as epic_title,
        CAST(julianday('now') - julianday(b.updated_at) AS INTEGER) as days_since_update
      FROM blockers b
      LEFT JOIN epics e ON b.epic_id = e.id
      WHERE b.status = 'open'
        AND (b.next_follow_up_at IS NULL OR b.next_follow_up_at <= datetime('now'))
        AND b.updated_at < datetime('now', '-' || ? || ' days')
      ORDER BY b.updated_at ASC
    `).all(threshold) as Array<{
      id: string; description: string; epic_id: string | null; owner: string | null;
      eta: string | null; updated_at: string; epic_title: string | null; days_since_update: number;
    }>;

    // Stale dependencies
    const staleDependencyRows = db.prepare(`
      SELECT d.id, d.description, d.epic_id, d.owner, d.eta, d.updated_at,
        e.title as epic_title,
        CAST(julianday('now') - julianday(d.updated_at) AS INTEGER) as days_since_update
      FROM dependencies d
      LEFT JOIN epics e ON d.epic_id = e.id
      WHERE d.status = 'open'
        AND (d.next_follow_up_at IS NULL OR d.next_follow_up_at <= datetime('now'))
        AND d.updated_at < datetime('now', '-' || ? || ' days')
      ORDER BY d.updated_at ASC
    `).all(threshold) as Array<{
      id: string; description: string; epic_id: string | null; owner: string | null;
      eta: string | null; updated_at: string; epic_title: string | null; days_since_update: number;
    }>;

    // Needs review count
    const needsReviewRow = db.prepare(
      `SELECT COUNT(*) as count FROM events WHERE status = 'needs_review'`
    ).get() as { count: number };

    // Recent events (last 24h)
    const recentEventRows = db.prepare(`
      SELECT id, status, transcript, created_at
      FROM events
      WHERE created_at > datetime('now', '-1 day')
      ORDER BY created_at DESC
      LIMIT 5
    `).all() as Array<{
      id: string; status: string; transcript: string | null; created_at: string;
    }>;

    // Counts
    const openActionsRow = db.prepare(
      `SELECT COUNT(*) as count FROM actions WHERE completed_at IS NULL`
    ).get() as { count: number };

    const openBlockersRow = db.prepare(
      `SELECT COUNT(*) as count FROM blockers WHERE status = 'open'`
    ).get() as { count: number };

    // Combine stale blockers and dependencies
    const allStaleItems = [
      ...staleBlockerRows.map(b => ({
        id: b.id,
        type: 'blocker' as const,
        description: b.description,
        epicId: b.epic_id,
        epicTitle: b.epic_title,
        owner: b.owner,
        eta: b.eta,
        daysSinceUpdate: b.days_since_update,
      })),
      ...staleDependencyRows.map(d => ({
        id: d.id,
        type: 'dependency' as const,
        description: d.description,
        epicId: d.epic_id,
        epicTitle: d.epic_title,
        owner: d.owner,
        eta: d.eta,
        daysSinceUpdate: d.days_since_update,
      })),
    ].sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    return {
      briefing: {
        overdue: overdueRows.map(r => ({
          id: r.id,
          type: r.type === 'deadline' ? 'deadline' : 'action',
          title: r.title,
          priority: r.priority,
          dueAt: r.due_at,
          epicId: r.epic_id,
          epicTitle: r.epic_title,
          daysOverdue: r.days_overdue,
        })),
        dueToday: dueTodayRows.map(r => ({
          id: r.id,
          type: r.type === 'deadline' ? 'deadline' : 'action',
          title: r.title,
          priority: r.priority,
          dueAt: r.due_at,
          epicId: r.epic_id,
          epicTitle: r.epic_title,
          daysOverdue: 0,
        })),
        upcomingThisWeek: upcomingRows.map(r => ({
          id: r.id,
          type: r.type === 'deadline' ? 'deadline' : 'action',
          title: r.title,
          priority: r.priority,
          dueAt: r.due_at,
          epicId: r.epic_id,
          epicTitle: r.epic_title,
          daysOverdue: 0,
        })),
        epicHealth: epicHealthFiltered.map(e => ({
          id: e.id,
          title: e.title,
          openBlockers: e.open_blockers,
          openDeps: e.open_deps,
          overdueActions: e.overdue_actions,
          dueTodayActions: e.due_today,
        })),
        staleBlockers: allStaleItems,
        needsReviewCount: needsReviewRow.count,
        recentEvents: recentEventRows.map(e => ({
          id: e.id,
          status: e.status,
          transcriptPreview: e.transcript ? e.transcript.substring(0, 100) : null,
          createdAt: e.created_at,
        })),
        counts: {
          openActions: openActionsRow.count,
          overdueActions: overdueRows.length,
          dueTodayActions: dueTodayRows.length,
          upcomingThisWeek: upcomingRows.length,
          openBlockers: openBlockersRow.count,
          staleBlockers: allStaleItems.length,
          needsReview: needsReviewRow.count,
        },
      },
    };
  });
}
