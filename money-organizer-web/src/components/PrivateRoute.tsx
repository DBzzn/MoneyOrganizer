import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/useAuth'

interface PrivateRouteProps {
    children: ReactNode
}

export function PrivateRoute({ children }: PrivateRouteProps) {
    const { token, isLoading } = useAuth()

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <span className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Carregando...</span>
            </div>
        )
    }

    if (!token) {
        return <Navigate to="/login" replace />
    }

    return <>{children}</>
}
