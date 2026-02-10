import { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ApiDiagnostics } from './ApiDiagnostics'
import { RecordButton } from './RecordButton'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isDashboard = location.pathname === '/'

  return (
    <div className="flex h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 pb-20">
          {children}
        </main>
      </div>
      <ApiDiagnostics />
      {!isDashboard && (
        <div className="fixed bottom-6 right-6 z-40 lg:bottom-8 lg:right-8">
          <RecordButton size="sm" />
        </div>
      )}
    </div>
  )
}