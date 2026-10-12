'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'
import { AppFooter } from './AppFooter'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SetupBanner />
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
        <AppFooter />
      </main>
    </div>
  )
}
