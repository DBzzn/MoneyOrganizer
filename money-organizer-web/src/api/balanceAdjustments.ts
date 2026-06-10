import api from './axios'
import type { BalanceAdjustment } from '../types'

interface BalanceAdjustmentPayload {
    amount: number
    date: string
    reason: string
    financialAccountId: string
}

interface BalanceAdjustmentFilters {
    financialAccountId?: string
    startDate?: string
    endDate?: string
}

export const getBalanceAdjustments = (filters?: BalanceAdjustmentFilters) =>
    api.get<BalanceAdjustment[]>('/balance-adjustments', { params: filters })

export const createBalanceAdjustment = (data: BalanceAdjustmentPayload) =>
    api.post<BalanceAdjustment>('/balance-adjustments', data)

export const deleteBalanceAdjustment = (id: string) =>
    api.delete<{ message: string }>(`/balance-adjustments/${id}`)
