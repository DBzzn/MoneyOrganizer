import axios from 'axios'

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

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

export default api
