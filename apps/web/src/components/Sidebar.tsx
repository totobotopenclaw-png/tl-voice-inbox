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

const navItems = [
  { path: '/', label: 'Dashboard', icon: Mic },
  { path: '/inbox', label: 'Inbox', icon: Inbox },
  { path: '/actions', label: 'Actions', icon: CheckSquare },
  { path: '/deadlines', label: 'Deadlines', icon: Clock },
  { path: '/needs-review', label: 'Needs Review', icon: HelpCircle },
  { path: '/epics', label: 'Epics', icon: FolderKanban },
  { path: '/knowledge', label: 'Knowledge', icon: BookOpen },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

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