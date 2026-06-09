import api from './axios'
import type { FinancialAccount, FinancialAccountType } from '../types'

interface FinancialAccountPayload {
    name?: string
    type?: FinancialAccountType
    institutionName?: string
    icon?: string
    color?: string
    initialBalance?: number
    includeInDashboard?: boolean
    isArchived?: boolean
}

export const getFinancialAccounts = () =>
    api.get<FinancialAccount[]>('/financial-accounts')

export const createFinancialAccount = (data: FinancialAccountPayload) =>
    api.post<FinancialAccount>('/financial-accounts', data)

export const updateFinancialAccount = (id: string, data: FinancialAccountPayload) =>
    api.patch<FinancialAccount>(`/financial-accounts/${id}`, data)

export const archiveFinancialAccount = (id: string) =>
    api.delete<{ message: string }>(`/financial-accounts/${id}`)
