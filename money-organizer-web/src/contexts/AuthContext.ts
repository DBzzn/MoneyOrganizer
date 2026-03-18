import { createContext } from 'react'
import type { User } from '../types'

interface AuthContextData {
    user: User | null
    token: string | null
    isLoading: boolean
    signIn: (token: string) => Promise<void>
    signOut: () => void
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData)

