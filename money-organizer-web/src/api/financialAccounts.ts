import api from './axios'
import type { AccountLedgerResponse, FinancialAccount, FinancialAccountType } from '../types'

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

interface AccountLedgerFilters {
    startDate?: string
    endDate?: string
}

export const getFinancialAccounts = () =>
    api.get<FinancialAccount[]>('/financial-accounts')

export const getFinancialAccountLedger = (id: string, filters?: AccountLedgerFilters) =>
    api.get<AccountLedgerResponse>(`/financial-accounts/${id}/ledger`, { params: filters })

export const createFinancialAccount = (data: FinancialAccountPayload) =>
    api.post<FinancialAccount>('/financial-accounts', data)

export const updateFinancialAccount = (id: string, data: FinancialAccountPayload) =>
    api.patch<FinancialAccount>(`/financial-accounts/${id}`, data)

export const archiveFinancialAccount = (id: string) =>
    api.delete<{ message: string }>(`/financial-accounts/${id}`)
