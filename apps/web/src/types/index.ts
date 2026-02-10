export interface Action {
  id: string
  type: 'follow_up' | 'deadline' | 'email'
  title: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'open' | 'done' | 'cancelled'
  due_at: string | null
  mentions: string[]
  epic_id: string | null
  body: string
  created_at: string
}

export interface Epic {
  id: string
  title: string
  status: 'active' | 'completed' | 'archived'
  aliases: string[]
  created_at: string
}

export interface KnowledgeItem {
  id: string
  title: string
  kind: 'tech' | 'process' | 'decision'
  tags: string[]
  body_md: string
  epic_id: string | null
  created_at: string
}

export interface Event {
  id: string
  status: 'queued' | 'transcribing' | 'processing' | 'completed' | 'needs_review' | 'error'
  transcript: string | null
  created_at: string
}

export interface SearchResult {
  type: 'action' | 'epic' | 'knowledge' | 'event'
  id: string
  title: string
  content: string
  rank: number
}