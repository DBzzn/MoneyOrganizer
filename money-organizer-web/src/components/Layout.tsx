import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface LayoutProps {
    children: ReactNode
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className='flex min-h-screen' style={{backgroundColor: 'var(--color-bg)'}}>
            <Sidebar/>
            <main className='flex-1 p-8 overflow-auto' style={{color: 'var(--color-text)'}}>
                {children}
            </main>
        </div>
    )
}