export interface User {
    id: string
    name: string
    email: string
    createdAt: string
}

export interface Category {
    id: string
    name: string
    icon?: string
    createdAt: string
}

export type TransactionType =
    | 'CREDIT_CASH'
    | 'CREDIT_INSTALLMENT'
    | 'DEBIT'
    | 'PIX'
    | 'CASH'
    | 'INCOME'

export interface Transaction {
    id: string
    type: TransactionType
    amount: number
    date: string
    isPending: boolean
    description?: string
    totalInstallments?: number
    currentInstallment?: number
    installmentGroupId?: string
    categoryId: string
    category: Category
    createdAt: string
}

export interface MonthlyBalance {
    month: string
    income: number
    expenses: number
    balance: number
    transactionCount: {
        income: number
        expenses: string
        total: number
    }
}

export interface ProjectionEntry {
    month: string
    projectedIncome: number
    projectedExpenses: number
    projectedBalance: number
    pendingTransactions: number
}

export interface EvolutionEntry {
    month: string
    income: number
    expenses: number
    balance: number
    transactionCount: number
}

export interface CategoryTotal {
    categoryId: string
    categoryName: string
    categoryIcon?: string
    totalAmount: number
    transactionCount: number
}

export interface InstallmentResponse {
    message: string
    installmentGroupId: string
    totalInstallments: number
    totalAmount: number
}

export interface ApiError {
    message: string
    statusCode: number
}


