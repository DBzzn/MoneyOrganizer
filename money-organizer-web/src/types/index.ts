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
    isArchived: boolean
    createdAt: string
}

export type FinancialAccountType =
    | 'BANK_ACCOUNT'
    | 'CASH_WALLET'
    | 'OTHER'

export interface FinancialAccount {
    id: string
    name: string
    type: FinancialAccountType
    institutionName?: string
    icon?: string
    color?: string
    initialBalance: number
    currentBalance: number
    includeInDashboard: boolean
    isArchived: boolean
    createdAt: string
    updatedAt: string
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
    financialAccountId: string
    financialAccount: FinancialAccount
    createdAt: string
}

export interface Transfer {
    id: string
    amount: number
    date: string
    isPending: boolean
    description?: string
    fromAccountId: string
    fromAccount: FinancialAccount
    toAccountId: string
    toAccount: FinancialAccount
    createdAt: string
    updatedAt: string
}

export interface BalanceAdjustment {
    id: string
    amount: number
    date: string
    reason: string
    financialAccountId: string
    financialAccount: FinancialAccount
    createdAt: string
    updatedAt: string
}

export type AccountLedgerMovementType =
    | 'TRANSACTION_INCOME'
    | 'TRANSACTION_EXPENSE'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'BALANCE_ADJUSTMENT'

export interface AccountLedgerItem {
    id: string
    sourceId: string
    sourceType: 'TRANSACTION' | 'TRANSFER' | 'BALANCE_ADJUSTMENT'
    movementType: AccountLedgerMovementType
    date: string
    createdAt: string
    title: string
    description?: string | null
    amount: number
    signedAmount: number
    isPending: boolean
    transactionType?: TransactionType
    category?: Pick<Category, 'id' | 'name' | 'icon' | 'isArchived'>
    relatedAccount?: Pick<FinancialAccount, 'id' | 'name' | 'icon' | 'color' | 'isArchived'>
}

export interface AccountLedgerResponse {
    account: FinancialAccount
    filters: {
        startDate?: string | null
        endDate?: string | null
    }
    totals: {
        income: number
        expenses: number
        incomingTransfers: number
        outgoingTransfers: number
        adjustments: number
        netChange: number
        pendingCount: number
    }
    items: AccountLedgerItem[]
}

export interface MonthlyBalance {
    month: string
    income: number
    expenses: number
    balance: number
    transactionCount: {
        income: number
        expenses: number
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
    transactionCount: {
        income: number
        expenses: number
        total: number
    }
}

// DEPOIS
export interface CategoryTotal {
    categoryId: string
    categoryName: string
    categoryIcon?: string
    totalAmount: string
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
