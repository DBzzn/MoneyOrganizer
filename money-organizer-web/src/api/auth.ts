import api from './axios'
import type { User } from '../types'

interface LoginPayload {
    email: string
    password: string
}

interface RegisterPayload {
    name: string
    email: string
    password: string
}

interface AuthResponse {
    access_token: string
}

export const login = (data: LoginPayload) =>
    api.post<AuthResponse>('/auth/login', data)

export const register = (data: RegisterPayload) =>
    api.post<User>('/users', data)

export const getMe = () =>
    api.get<{ id: string, email: string }>('/auth/me')

