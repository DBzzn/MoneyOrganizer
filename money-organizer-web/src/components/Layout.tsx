import { type ReactNode, useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'

interface LayoutProps {
    children: ReactNode
}

function isMobileViewport(): boolean {
    if (typeof window === 'undefined') return false

    return window.matchMedia('(max-width: 767px)').matches
}

export function Layout({ children }: LayoutProps) {
    const [isMobile, setIsMobile] = useState(isMobileViewport)
    const [isOpen, setIsOpen] = useState(() => !isMobileViewport())

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 767px)')

        const syncViewport = () => {
            const nextIsMobile = mediaQuery.matches

            setIsMobile(nextIsMobile)
            setIsOpen(!nextIsMobile)
        }

        syncViewport()
        mediaQuery.addEventListener('change', syncViewport)

        return () => mediaQuery.removeEventListener('change', syncViewport)
    }, [])

    return (
        <div className='relative flex min-h-screen overflow-x-hidden' style={{backgroundColor: 'var(--color-bg)'}}>
            {isMobile && isOpen && (
                <button
                    type="button"
                    aria-label="Fechar menu"
                    onClick={() => setIsOpen(false)}
                    className="fixed inset-0 z-40 bg-black/50"
                />
            )}
            <Sidebar
                isOpen={isOpen}
                isMobile={isMobile}
                onNavigate={() => {
                    if (isMobile) setIsOpen(false)
                }}
                onToggle={() => setIsOpen(prev => !prev)}
            />
            <main className='min-w-0 flex-1 overflow-auto p-4 pb-24 transition-all duration-300 sm:p-6 md:p-8' style={{
                color: 'var(--color-text)',
                marginLeft: !isMobile && isOpen ? '16rem' : 0,
                transition: 'margin-left 0.3s ease'
                }}>
                {children}
            </main>
        </div>
    )
}
