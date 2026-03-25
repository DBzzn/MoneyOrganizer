import { useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'
import { getMe } from '../api/auth'
import { AuthContext } from './AuthContext'

const storedToken = localStorage.getItem('token')

let initialUser: User | null = null
let initialLoading = false

const authReady: Promise<void> = storedToken
    ? getMe()
        .then((response) => {
            initialUser = response.data as User
        })
        .catch(() => {
            localStorage.removeItem('token')
        })
        .finally(() => {
            initialLoading = false
        })
    : Promise.resolve()

void authReady

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(initialUser)
    const [token, setToken] = useState<string | null>(storedToken)
    const [isLoading] = useState<boolean>(initialLoading)

    const signIn = async (newToken: string) => {
        localStorage.setItem('token', newToken)
        setToken(newToken)
        const response = await getMe()
        setUser(response.data as User)
    }

    const signOut = () => {
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
    }
    
    return (
        <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>            
            {children}
        </AuthContext.Provider>
    )
}