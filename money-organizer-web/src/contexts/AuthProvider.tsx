import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'
import { getMe } from '../api/auth'
import { AUTH_EXPIRED_EVENT } from '../api/axios'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
    const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(localStorage.getItem('token')))

    useEffect(() => {
        const storedToken = localStorage.getItem('token')
        let isMounted = true

        if (!storedToken) {
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        getMe()
            .then((response) => {
                if (isMounted) {
                    setUser(response.data as User)
                }
            })
            .catch(() => {
                localStorage.removeItem('token')

                if (isMounted) {
                    setToken(null)
                    setUser(null)
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false)
                }
            })

        return () => {
            isMounted = false
        }
    }, [])

    const signIn = async (newToken: string) => {
        localStorage.setItem('token', newToken)
        setToken(newToken)
        setIsLoading(true)

        try {
            const response = await getMe()
            setUser(response.data as User)
        } catch (error) {
            localStorage.removeItem('token')
            setToken(null)
            setUser(null)
            throw error
        } finally {
            setIsLoading(false)
        }
    }

    const refreshUser = async () => {
        const response = await getMe()
        setUser(response.data as User)
        return response.data as User
    }

    const signOut = () => {
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        setIsLoading(false)
    }

    useEffect(() => {
        const handleAuthExpired = () => {
            localStorage.removeItem('token')
            setToken(null)
            setUser(null)
            setIsLoading(false)
        }

        window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)

        return () => {
            window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
        }
    }, [])
    
    return (
        <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, refreshUser }}>
            {children}
        </AuthContext.Provider>
    )
}
