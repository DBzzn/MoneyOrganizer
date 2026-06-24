import axios from 'axios'

export const AUTH_EXPIRED_EVENT = 'money-organizer:auth-expired'

function resolveApiBaseURL(): string {
    const configuredApiUrl = import.meta.env.VITE_API_URL

    if (configuredApiUrl && configuredApiUrl !== 'auto') {
        return configuredApiUrl
    }

    return `${window.location.protocol}//${window.location.hostname}:3000`
}

const api = axios.create({
    baseURL: resolveApiBaseURL(),
})

let isRedirectingToLogin = false

function getResponseMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) {
        return ''
    }

    const message = error.response?.data?.message

    if (Array.isArray(message)) {
        return message.join(' ')
    }

    return typeof message === 'string' ? message : ''
}

function normalizeMessage(message: string): string {
    return message
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function shouldKeepUserOnPage(error: unknown): boolean {
    const message = normalizeMessage(getResponseMessage(error))

    return message.includes('senha atual invalida')
}

function isPublicAuthRequest(method?: string, url?: string): boolean {
    const normalizedMethod = method?.toLowerCase()

    return Boolean(url?.includes('/auth/login') || (normalizedMethod === 'post' && url === '/users'))
}

function redirectToLogin() {
    if (typeof window === 'undefined') {
        return
    }

    localStorage.removeItem('token')
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))

    const { pathname, search } = window.location

    if (pathname === '/login' || pathname === '/register' || isRedirectingToLogin) {
        return
    }

    isRedirectingToLogin = true
    const next = encodeURIComponent(`${pathname}${search}`)
    window.location.assign(`/login?reason=session-expired&next=${next}`)
}

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (
            axios.isAxiosError(error) &&
            error.response?.status === 401 &&
            !isPublicAuthRequest(error.config?.method, error.config?.url) &&
            !shouldKeepUserOnPage(error)
        ) {
            redirectToLogin()
        }

        return Promise.reject(error)
    },
)

export default api
