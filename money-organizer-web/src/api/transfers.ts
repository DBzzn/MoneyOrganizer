import api from './axios'
import type { Transfer } from '../types'

interface TransferPayload {
    amount: number
    date: string
    fromAccountId: string
    toAccountId: string
    isPending?: boolean
    description?: string
}

interface TransferFilters {
    startDate?: string
    endDate?: string
    financialAccountId?: string
    isPending?: boolean
}

export const getTransfers = (filters?: TransferFilters) =>
    api.get<Transfer[]>('/transfers', { params: filters })

export const getTransfer = (id: string) =>
    api.get<Transfer>(`/transfers/${id}`)

export const createTransfer = (data: TransferPayload) =>
    api.post<Transfer>('/transfers', data)

export const updateTransfer = (id: string, data: Partial<TransferPayload>) =>
    api.patch<Transfer>(`/transfers/${id}`, data)

export const deleteTransfer = (id: string) =>
    api.delete<{ message: string }>(`/transfers/${id}`)
