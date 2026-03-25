import { type ReactNode, useState } from 'react'
import { Sidebar } from './Sidebar'

interface LayoutProps {
    children: ReactNode
}

export function Layout({ children }: LayoutProps) {
    const [isOpen, setIsOpen] = useState(true)

    return (
        <div className='flex min-h-screen' style={{backgroundColor: 'var(--color-bg)'}}>
            <Sidebar isOpen={isOpen} onToggle={() => setIsOpen(prev => !prev)}/>
            <main className='flex-1 p-8 overflow-auto transition-all duration-300' style={{
                color: 'var(--color-text)',
                marginLeft: isOpen? '16rem' : 0,
                transition: 'margin-left 0.3s ease'
                }}>
                {children}
            </main>
        </div>
    )
}