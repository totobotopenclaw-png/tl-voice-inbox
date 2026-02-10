import { NavLink } from 'react-router-dom'
import {
  Inbox,
  Clock,
  HelpCircle,
  FolderKanban,
  BookOpen,
  Mic,
  Menu,
  X,
  CheckSquare,
} from 'lucide-react'
import { useState } from 'react'
import { useBadgeCounts } from '../hooks/useBadgeCounts'

type BadgeKey = 'openActions' | 'deadlines' | 'needsReview' | 'blockers';

const navItems: Array<{ path: string; label: string; icon: typeof Mic; badgeKey?: BadgeKey }> = [
  { path: '/', label: 'Dashboard', icon: Mic },
  { path: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'openActions' },
  { path: '/actions', label: 'Actions', icon: CheckSquare },
  { path: '/deadlines', label: 'Deadlines', icon: Clock, badgeKey: 'deadlines' },
  { path: '/needs-review', label: 'Needs Review', icon: HelpCircle, badgeKey: 'needsReview' },
  { path: '/epics', label: 'Epics', icon: FolderKanban, badgeKey: 'blockers' },
  { path: '/knowledge', label: 'Knowledge', icon: BookOpen },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { counts } = useBadgeCounts()

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-slate-900 border-r border-slate-800
          transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <Mic size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-100">TL Voice Inbox</h1>
                <p className="text-xs text-slate-500">Tech Lead Workspace</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              let badgeCount = 0
              let badgeStyle = 'bg-primary-600/20 text-primary-400'

              if (counts && item.badgeKey) {
                if (item.badgeKey === 'openActions') {
                  badgeCount = counts.openActions
                } else if (item.badgeKey === 'deadlines') {
                  badgeCount = counts.overdueActions + counts.dueTodayActions
                  if (counts.overdueActions > 0) badgeStyle = 'bg-red-500/20 text-red-400'
                } else if (item.badgeKey === 'needsReview') {
                  badgeCount = counts.needsReview
                  if (badgeCount > 0) badgeStyle = 'bg-amber-500/20 text-amber-400'
                } else if (item.badgeKey === 'blockers') {
                  badgeCount = counts.openBlockers
                  if (counts.staleBlockers > 0) badgeStyle = 'bg-red-500/20 text-red-400'
                  else if (badgeCount > 0) badgeStyle = 'bg-amber-500/20 text-amber-400'
                }
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-600/10 text-primary-400 border border-primary-600/20'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`
                  }
                >
                  <Icon size={18} />
                  {item.label}
                  {badgeCount > 0 && (
                    <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${badgeStyle}`}>
                      {badgeCount}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800">
            <p className="text-xs text-slate-600">Local • Private • Fast</p>
          </div>
        </div>
      </aside>
    </>
  )
}