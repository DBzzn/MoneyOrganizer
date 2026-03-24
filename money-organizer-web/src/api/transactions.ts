import api from './axios'
import {
    type Transaction,
    type MonthlyBalance,
    type EvolutionEntry,
    type ProjectionEntry,
    type CategoryTotal,
    type TransactionType,
    type InstallmentResponse,
} from '../types'

interface TransactionPayload {
    type: TransactionType
    amount: number
    date: string
    categoryId: string
    isPending?: boolean
    description?: string
    totalInstallments?: number
    currentInstallment?: number
    installmentGroupId?: string
}

interface InstallmentPayload {
    totalAmount?: number
    installmentAmount?: number
    totalInstallments: number
    firstInstallmentDate: string
    categoryId: string
    description?: string
    isPending?: boolean
}

interface TransactionFilters {
    startDate?: string
    endDate?: string
    categoryId?: string
    type?: TransactionType
    isPending?: boolean
    search?: string
    minAmount?: number
    maxAmount?: number
}

interface ReportFilters {
    month?: string
    startMonth?: string
    endMonth?: string
}

export const getTransactions = (filters?: TransactionFilters) =>
    api.get<Transaction[]>('/transactions', { params: filters })

export const getTransaction = (id: string) =>
    api.get<Transaction>(`/transactions/${id}`)

export const createTransaction = (data: TransactionPayload) =>
    api.post<Transaction>('/transactions', data)

export const updateTransaction = (id: string, data: Partial<TransactionPayload>) =>
    api.patch<Transaction>(`/transactions/${id}`, data)

export const deleteTransaction = (id: string) =>
    api.delete<Transaction>(`/transactions/${id}`)

export const createInstallment = (data: InstallmentPayload) =>
    api.post<InstallmentResponse>('/transactions/installments', data)

export const getTotalsByCategory = (filters?: TransactionFilters) =>
    api.get<CategoryTotal[]>('/transactions/totals/by-category', {params: filters})

export const getMonthlyBalance = (filters?: ReportFilters) =>
    api.get<MonthlyBalance>('/transactions/totals/monthly-balance', { params: filters })

export const getEvolution = (filters?: ReportFilters) =>
    api.get<EvolutionEntry[]>('/transactions/reports/evolution', { params: filters })

export const getProjection = (filters?: ReportFilters) =>
    api.get<ProjectionEntry[]>('/transactions/reports/projection', { params: filters })

