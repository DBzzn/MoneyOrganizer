import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { zodResolver } from '@hookform/resolvers/zod'
import { Layout } from '../components/Layout'
import {
    getTransactions,
    getTransaction,
    updateTransaction,
    deleteTransactions,
    createTransaction,
    createInstallment,
} from '../api/transactions'
import { getCategories } from '../api/categories'
import { getFinancialAccounts } from '../api/financialAccounts'
import type { AppliedImportSource, Transaction, Category, TransactionType, FinancialAccount } from '../types'
import {
    transactionSchema,
    installmentSchema,
    type TransactionFormData,
    type InstallmentFormData,
    type UpdateTransactionFormData,
    updateTransactionSchema,
} from '../schemas'
import { formatCurrency, formatDate, transactionTypeLabel } from '../utils'
import { Plus, Trash2, X, CreditCard, Pencil, Search, ArrowUpDown, FileSearch } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import { formatStoredIconPrefix } from '../components/storedIconRegistry'

type FormMode = 'transaction' | 'installment' | 'edit' | null
type SortKey = 'date' | 'description' | 'category' | 'account' | 'type' | 'amount'
type SortDirection = 'asc' | 'desc'
type QuickFilter = 'all' | 'income' | 'expenses' | 'pending'

const EXPENSE_TRANSACTION_TYPES: TransactionType[] = [
    'CREDIT_CASH',
    'CREDIT_INSTALLMENT',
    'DEBIT',
    'PIX',
    'CASH',
]

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'income', label: 'Receitas' },
    { key: 'expenses', label: 'Despesas' },
    { key: 'pending', label: 'Pendentes' },
]

function compareText(a: string, b: string): number {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

function getSortComparison(a: Transaction, b: Transaction, key: SortKey): number {
    switch (key) {
        case 'date':
            return new Date(a.date).getTime() - new Date(b.date).getTime()
        case 'description':
            return compareText(a.description ?? '', b.description ?? '')
        case 'category':
            return compareText(a.category.name, b.category.name)
        case 'account':
            return compareText(a.financialAccount?.name ?? '', b.financialAccount?.name ?? '')
        case 'type':
            return compareText(transactionTypeLabel(a.type), transactionTypeLabel(b.type))
        case 'amount':
            return Number(a.amount) - Number(b.amount)
    }
}

function isExpenseTransaction(transaction: Transaction): boolean {
    return EXPENSE_TRANSACTION_TYPES.includes(transaction.type)
}

function categoryMatchesTransactionType(category: Category, type?: TransactionType): boolean {
    if (!type) return true

    if (type === 'INCOME') {
        return category.kind === 'INCOME' || category.kind === 'BOTH'
    }

    return category.kind === 'EXPENSE' || category.kind === 'BOTH'
}

function matchesQuickFilter(transaction: Transaction, filter: QuickFilter): boolean {
    switch (filter) {
        case 'all':
            return true
        case 'income':
            return transaction.type === 'INCOME'
        case 'expenses':
            return isExpenseTransaction(transaction)
        case 'pending':
            return transaction.isPending
    }
}

function getQuickFilterCount(transactions: Transaction[], filter: QuickFilter): number {
    return transactions.filter((transaction) => matchesQuickFilter(transaction, filter)).length
}

function apiErrorMessage(error: unknown, fallback: string): string {
    const responseData = (
        error as {
            response?: {
                data?: {
                    message?: unknown
                }
            }
        }
    ).response?.data
    const message = responseData?.message

    if (Array.isArray(message)) {
        return message.filter(Boolean).join(' ')
    }

    return typeof message === 'string' && message.trim() ? message : fallback
}

function getImportSource(transaction: Transaction): AppliedImportSource | null {
    return transaction.importedMovements?.[0] ?? null
}

function ImportSourceBadge({ source }: { source: AppliedImportSource | null }) {
    if (!source) return null

    return (
        <Link
            to={`/statement-imports?batch=${encodeURIComponent(source.file.batchId)}`}
            title={`Abrir lote de origem: ${source.file.originalName}`}
            className="app-chip app-chip-info inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium transition hover:opacity-85"
        >
            <FileSearch size={12} />
            Importado
        </Link>
    )
}

function SortHeader({
    label,
    sort,
    activeSort,
    align = 'left',
    onSort,
}: {
    label: string
    sort: SortKey
    activeSort: SortKey
    align?: 'left' | 'right'
    onSort: (sort: SortKey) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onSort(sort)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition hover:opacity-80 ${align === 'right' ? 'justify-end w-full' : ''}`}
            style={{ color: activeSort === sort ? 'var(--color-text)' : 'var(--color-text-muted)' }}
        >
            {label}
            <ArrowUpDown size={13} />
        </button>
    )
}

function toInputDate(isoString: string): string {
    const isoD = new Date(isoString)
    const y = isoD.getFullYear()
    const m = String(isoD.getMonth() + 1).padStart(2, '0')
    const d = String(isoD.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function getCurrentMonth(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
}

function monthToRange(month: string): { startDate: string; endDate: string } {
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return {
        startDate: `${month}-01`,
        endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    }
}

function formatMonthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function Transactions() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [formMode, setFormMode] = useState<FormMode>(null)
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
    const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
    const [searchInput, setSearchInput] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [accountFilter, setAccountFilter] = useState('all')
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
    const editTransactionId = searchParams.get('edit')
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        message: string
        onConfirm: () => void
        secondaryAction?: { label: string; onClick: () => void }
    }>({
        isOpen: false,
        message: '',
        onConfirm: () => { },
    })


    const transactionForm = useForm<TransactionFormData>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            isPending: false,
            amount: 0.01,
            financialAccountId: '',
        }
    })

    const installmentForm = useForm<InstallmentFormData>({
        resolver: zodResolver(installmentSchema),
        defaultValues: {
            isPending: true,
            totalAmount: 0.01,
            totalInstallments: 2,
            financialAccountId: '',
        } //naturalmente um ou mais parcelamentos estão pendentes!
    })

    const updateForm = useForm<UpdateTransactionFormData>({
        resolver: zodResolver(updateTransactionSchema),
        defaultValues: { amount: 0.01, financialAccountId: '' }

    })

    const activeFinancialAccounts = financialAccounts.filter((account) => !account.isArchived)
    const editableFinancialAccounts = editingTransaction
        ? financialAccounts.filter((account) =>
            !account.isArchived || account.id === editingTransaction.financialAccountId
        )
        : activeFinancialAccounts
    const activeCategories = categories.filter((category) => !category.isArchived)
    const editableCategories = editingTransaction
        ? categories.filter((category) =>
            !category.isArchived || category.id === editingTransaction.categoryId
        )
        : activeCategories
    const transactionType = transactionForm.watch('type')
    const updateTransactionType = updateForm.watch('type')
    const transactionCategories = activeCategories.filter((category) =>
        categoryMatchesTransactionType(category, transactionType)
    )
    const installmentCategories = activeCategories.filter((category) =>
        categoryMatchesTransactionType(category, 'CREDIT_INSTALLMENT')
    )
    const updateCategories = editableCategories.filter((category) =>
        category.id === editingTransaction?.categoryId ||
        categoryMatchesTransactionType(category, updateTransactionType)
    )

    const buildTransactionFilters = useCallback(() => {
        const range = monthToRange(currentMonth)

        return {
            ...range,
            ...(searchTerm ? { search: searchTerm } : {}),
            ...(accountFilter !== 'all' ? { financialAccountId: accountFilter } : {}),
        }
    }, [accountFilter, currentMonth, searchTerm])

    useEffect(() => {
        if (!editingTransaction) return
        updateForm.reset({
            amount: editingTransaction.amount,
            date: toInputDate(editingTransaction.date),
            categoryId: editingTransaction.categoryId,
            financialAccountId: editingTransaction.financialAccountId,
            isPending: editingTransaction.isPending,
            description: editingTransaction.description ?? '',
            type: editingTransaction.type,
        })
    }, [editingTransaction, updateForm])

    useEffect(() => {
        const categoryId = transactionForm.getValues('categoryId')
        if (!categoryId) return

        const category = categories.find((item) => item.id === categoryId)
        if (category && !categoryMatchesTransactionType(category, transactionType)) {
            transactionForm.setValue('categoryId', '', { shouldDirty: true, shouldValidate: true })
        }
    }, [categories, transactionForm, transactionType])

    useEffect(() => {
        const categoryId = updateForm.getValues('categoryId')
        if (!categoryId) return

        const category = categories.find((item) => item.id === categoryId)
        const isUnchangedArchivedCategory =
            categoryId === editingTransaction?.categoryId &&
            updateTransactionType === editingTransaction?.type

        if (isUnchangedArchivedCategory) return

        if (category && !categoryMatchesTransactionType(category, updateTransactionType)) {
            updateForm.setValue('categoryId', '', { shouldDirty: true, shouldValidate: true })
        }
    }, [categories, editingTransaction?.categoryId, editingTransaction?.type, updateForm, updateTransactionType])

    useEffect(() => {
        const filters = buildTransactionFilters()

        Promise.all([getTransactions(filters), getCategories(), getFinancialAccounts()])
            .then(([transRes, catRes, accountsRes]) => {
                setTransactions(transRes.data)
                setCategories(catRes.data)
                setFinancialAccounts(accountsRes.data)
            })
            .finally(() => setIsLoading(false))

        return () => { setIsLoading(true) }
    }, [buildTransactionFilters])

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setSearchTerm(searchInput.trim())
        }, 350)

        return () => window.clearTimeout(timeoutId)
    }, [searchInput])

    useEffect(() => {
        if (!editTransactionId || categories.length === 0 || financialAccounts.length === 0) return

        let isActive = true

        getTransaction(editTransactionId)
            .then((res) => {
                if (!isActive) return

                setCurrentMonth(toInputDate(res.data.date).slice(0, 7))
                setEditingTransaction(res.data)
                setFormMode('edit')

                const nextParams = new URLSearchParams(searchParams)
                nextParams.delete('edit')
                setSearchParams(nextParams, { replace: true })
            })
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao abrir a transação pelo extrato!')
                }
            })

        return () => {
            isActive = false
        }
    }, [editTransactionId, categories.length, financialAccounts.length, searchParams, setSearchParams])

    const handleClose = () => {
        const defaultAccountId = activeFinancialAccounts[0]?.id ?? ''

        setFormMode(null)
        setEditingTransaction(null)
        transactionForm.reset({
            isPending: false,
            amount: 0.01,
            financialAccountId: defaultAccountId,
        })
        installmentForm.reset({
            isPending: true,
            totalAmount: 0.01,
            totalInstallments: 2,
            financialAccountId: defaultAccountId,
        })
        updateForm.reset({ amount: 0.01, financialAccountId: defaultAccountId })
    }

    const handleOpenTransaction = () => {
        transactionForm.reset({
            isPending: false,
            amount: 0.01,
            financialAccountId: activeFinancialAccounts[0]?.id ?? '',
        })
        setFormMode('transaction')
    }

    const handleOpenInstallment = () => {
        installmentForm.reset({
            isPending: true,
            totalAmount: 0.01,
            totalInstallments: 2,
            financialAccountId: activeFinancialAccounts[0]?.id ?? '',
        })
        setFormMode('installment')
    }

    const handleOpenEdit = (tx: Transaction) => {
        setEditingTransaction(tx)
        setFormMode('edit')
    }

    const onSubmitTransaction = async (data: TransactionFormData) => {

        try {
            const payload = {
                ...data,
                isPending: data.isPending ?? false
            }
            await createTransaction(payload)
            const res = await getTransactions(buildTransactionFilters())
            setTransactions(res.data)
            handleClose()
            toast.success('Transação criada com sucesso!')
        } catch {
            toast.error('Erro ao criar a transação! Verifique os dados.')

        }
    }

    const onSubmitInstallment = async (data: InstallmentFormData) => {
        try {
            await createInstallment(data)
            const res = await getTransactions(buildTransactionFilters())
            setTransactions(res.data)
            handleClose()
            toast.success('Parcelamento criado com sucesso!')
        } catch {
            toast.error('Erro ao criar o parcelamento!')
        }
    }

    const onSubmitUpdate = async (data: UpdateTransactionFormData) => {
        if (!editingTransaction) return
        try {
            await updateTransaction(editingTransaction.id, data)
            const res = await getTransactions(buildTransactionFilters())
            setTransactions(res.data)
            handleClose()
            toast.success('Transação atualizada com sucesso!')
        } catch {
            toast.error('Erro ao atualizar a transação! Por favor, verifique os dados.')
        }
    }

    const handleDelete = (t: Transaction) => {
        const isInstallment = t.type === 'CREDIT_INSTALLMENT' && t.installmentGroupId

        setConfirmModal({
            isOpen: true,
            message: isInstallment
                ? `Deletar parcela ${t.currentInstallment}/${t.totalInstallments}x — deseja remover só esta ou todas do grupo?`
                : 'Tem certeza que deseja remover essa transação?',
            onConfirm: async () => {
                try {
                    await deleteTransactions(t.id)
                    setTransactions((prev) => prev.filter((tx) => tx.id !== t.id))
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }))
                    toast.success('Transação removida com sucesso!')
                } catch (error) {
                    toast.error(apiErrorMessage(error, 'Erro ao remover a transação!'))
                }
            },
            ...(isInstallment && {
                secondaryAction: {
                    label: 'Deletar todas do grupo',
                    onClick: async () => {
                        try {
                            const allTransactions = await getTransactions()
                            const groupIds = allTransactions.data
                                .filter((tx) => tx.installmentGroupId === t.installmentGroupId)
                                .map((tx) => tx.id)

                            if (groupIds.length === 0) {
                                throw new Error('Parcelamento não encontrado.')
                            }

                            await deleteTransactions(groupIds)
                            setTransactions((prev) =>
                                prev.filter((tx) => tx.installmentGroupId !== t.installmentGroupId)
                            )
                            setConfirmModal((prev) => ({ ...prev, isOpen: false }))
                            toast.success('Todas as parcelas removidas com sucesso!')
                        } catch (error) {
                            toast.error(apiErrorMessage(error, 'Erro ao remover as parcelas!'))
                        }
                    },
                },
            }),
        })
    }
    const typeColor: Record<string, string> = {
        INCOME: 'app-chip app-chip-success',
        CREDIT_CASH: 'app-chip app-chip-info',
        CREDIT_INSTALLMENT: 'app-chip app-chip-info',
        DEBIT: 'app-chip app-chip-warning',
        PIX: 'app-chip app-chip-info',
        CASH: 'app-chip app-chip-muted',
    }

    const goToPrevMonth = () => {
        const [y, m] = currentMonth.split('-').map(Number)
        const prev = new Date(y, m - 2, 1)
        setCurrentMonth(
            `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
        )
    }

    const goToNextMonth = () => {
        const [y, m] = currentMonth.split('-').map(Number)
        const next = new Date(y, m, 1)
        setCurrentMonth(
            `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
        )
    }

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
            return
        }

        setSortKey(key)
        setSortDirection(key === 'date' ? 'desc' : 'asc')
    }

    const filteredTransactions = transactions.filter((transaction) =>
        matchesQuickFilter(transaction, quickFilter)
    )

    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
        const comparison = getSortComparison(a, b, sortKey)
        return sortDirection === 'asc' ? comparison : -comparison
    })

    return (
        <Layout>
            <div className="space-y-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Transações</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Gerencie suas movimentações</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto lg:flex-row lg:items-center">
                        {/* Navegação de mês */}
                        <div className="glass flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 sm:w-auto"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <button
                                onClick={goToPrevMonth}
                                aria-label="Mês anterior"
                                className="p-1.5 rounded-lg transition hover:bg-gray-100"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                ‹
                            </button>
                            <span className="min-w-0 flex-1 text-center text-sm font-medium capitalize sm:w-36 sm:flex-none" style={{ color: 'var(--color-text)' }}>
                                {formatMonthLabel(currentMonth)}
                            </span>
                            <button
                                onClick={goToNextMonth}
                                aria-label="Próximo mês"
                                className="p-1.5 rounded-lg transition hover:bg-gray-100"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                ›
                            </button>
                        </div>
                        {/* Botões de ação */}
                        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                            <button
                                onClick={handleOpenInstallment}
                                className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-purple-700 sm:px-4"
                            >
                                <CreditCard size={16} />
                                Parcelar
                            </button>
                            <button
                                onClick={handleOpenTransaction}
                                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 sm:px-4"
                            >
                                <Plus size={16} />
                                <span>Nova transação</span>
                            </button>
                        </div>
                    </div>
                </div>


                {/* ─── Formulário Nova Transação ─── */}
                <div
                    className="glass grid w-full grid-cols-2 gap-1 rounded-2xl p-1 sm:flex sm:flex-wrap xl:w-fit"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    {QUICK_FILTERS.map((filter) => {
                        const isActive = quickFilter === filter.key
                        const count = getQuickFilterCount(transactions, filter.key)

                        return (
                            <button
                                key={filter.key}
                                type="button"
                                aria-label={`${filter.label} ${count}`}
                                onClick={() => setQuickFilter(filter.key)}
                                className="rounded-xl px-3 py-2 text-sm font-medium transition sm:min-w-28"
                                style={{
                                    backgroundColor: isActive ? '#2563eb' : 'transparent',
                                    color: isActive ? 'white' : 'var(--color-text-muted)',
                                }}
                            >
                                {filter.label}
                                <span aria-hidden="true" className="ml-2 text-xs opacity-75">{count}</span>
                            </button>
                        )
                    })}
                </div>

                <div className="glass grid w-full gap-3 rounded-2xl p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="relative">
                        <Search
                            size={17}
                            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: 'var(--color-text-muted)' }}
                        />
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Buscar por descrição no mês selecionado"
                            className="app-control app-control-leading-icon w-full"
                        />
                    </div>
                    <select
                        value={accountFilter}
                        onChange={(event) => setAccountFilter(event.target.value)}
                        className="app-control w-full"
                    >
                        <option value="all">Todas as contas</option>
                        {financialAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {formatStoredIconPrefix(account.icon)}{account.name}{account.isArchived ? ' (arquivada)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {formMode === 'transaction' && (
                    <div className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Nova transação</h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="Fechar formulário de transação"
                                title="Fechar"
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={transactionForm.handleSubmit(onSubmitTransaction)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Tipo</label>
                                <select
                                    {...transactionForm.register('type')}
                                    className="app-control w-full"
                                >
                                    <option value="">Selecione...</option>
                                    <option value="INCOME">Receita</option>
                                    <option value="CREDIT_CASH">Crédito à vista</option>
                                    <option value="DEBIT">Débito</option>
                                    <option value="PIX">Pix</option>
                                    <option value="CASH">Dinheiro</option>
                                </select>
                                {transactionForm.formState.errors.type && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.type.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Valor (R$)</label>
                                <input
                                    {...transactionForm.register('amount', { valueAsNumber: true })}
                                    type="number" step="0.01" placeholder="0,00"
                                    className="app-control w-full"
                                />
                                {transactionForm.formState.errors.amount && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Data</label>
                                <input
                                    {...transactionForm.register('date')}
                                    type="date"
                                    className="app-control w-full"
                                />
                                {transactionForm.formState.errors.date && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.date.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Categoria</label>
                                <select
                                    {...transactionForm.register('categoryId')}
                                    className="app-control w-full"
                                >
                                    <option value="">Selecione...</option>
                                    {transactionCategories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>{formatStoredIconPrefix(cat.icon)}{cat.name}</option>
                                    ))}
                                </select>
                                {transactionForm.formState.errors.categoryId && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.categoryId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Conta</label>
                                <select
                                    {...transactionForm.register('financialAccountId')}
                                    className="app-control w-full"
                                >
                                    <option value="">Selecione...</option>
                                    {activeFinancialAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {formatStoredIconPrefix(account.icon)}{account.name}
                                        </option>
                                    ))}
                                </select>
                                {transactionForm.formState.errors.financialAccountId && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.financialAccountId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Descrição (opcional)</label>
                                <input
                                    {...transactionForm.register('description')}
                                    type="text" placeholder="Ex: Almoço com cliente"
                                    className="app-control w-full"
                                />
                            </div>

                            <label className="app-checkbox-row h-fit sm:mt-6">
                                <input
                                    {...transactionForm.register('isPending')}
                                    type="checkbox" id="isPending"
                                    className="app-checkbox"
                                    onChange={(e) => transactionForm.setValue('isPending', e.target.checked)}
                                />
                                <span className="text-sm">
                                    Transação pendente
                                </span>
                            </label>

                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={transactionForm.formState.isSubmitting}
                                    className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto"
                                >
                                    {transactionForm.formState.isSubmitting ? 'Salvando...' : 'Salvar transação'}
                                </button>
                            </div>

                        </form>
                    </div>
                )}

                {/* ─── Formulário Parcelamento ─── */}
                {formMode === 'installment' && (
                    <div className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Novo parcelamento</h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="Fechar formulário de parcelamento"
                                title="Fechar"
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={installmentForm.handleSubmit(onSubmitInstallment)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Valor total (R$)</label>
                                <input
                                    {...installmentForm.register('totalAmount', { valueAsNumber: true })}
                                    type="number" step="0.01" placeholder="0,00"
                                    className="app-control app-control-purple w-full"
                                />
                                {installmentForm.formState.errors.totalAmount && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.totalAmount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Número de parcelas</label>
                                <input
                                    {...installmentForm.register('totalInstallments', { valueAsNumber: true })}
                                    type="number" min="2" placeholder="Ex: 12"
                                    className="app-control app-control-purple w-full"
                                />
                                {installmentForm.formState.errors.totalInstallments && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.totalInstallments.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Data da primeira parcela</label>
                                <input
                                    {...installmentForm.register('firstInstallmentDate')}
                                    type="date"
                                    className="app-control app-control-purple w-full"
                                />
                                {installmentForm.formState.errors.firstInstallmentDate && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.firstInstallmentDate.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Categoria</label>
                                <select
                                    {...installmentForm.register('categoryId')}
                                    className="app-control app-control-purple w-full"
                                >
                                    <option value="">Selecione...</option>
                                    {installmentCategories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>{formatStoredIconPrefix(cat.icon)}{cat.name}</option>
                                    ))}
                                </select>
                                {installmentForm.formState.errors.categoryId && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.categoryId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Conta</label>
                                <select
                                    {...installmentForm.register('financialAccountId')}
                                    className="app-control app-control-purple w-full"
                                >
                                    <option value="">Selecione...</option>
                                    {activeFinancialAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {formatStoredIconPrefix(account.icon)}{account.name}
                                        </option>
                                    ))}
                                </select>
                                {installmentForm.formState.errors.financialAccountId && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.financialAccountId.message}</p>
                                )}
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Descrição (opcional)</label>
                                <input
                                    {...installmentForm.register('description')}
                                    type="text" placeholder="Ex: iPhone 16 Pro"
                                    className="app-control app-control-purple w-full"
                                />
                            </div>


                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={installmentForm.formState.isSubmitting}
                                    className="w-full rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-purple-700 disabled:bg-purple-400 sm:w-auto"
                                >
                                    {installmentForm.formState.isSubmitting ? 'Criando parcelas...' : 'Criar parcelamento'}
                                </button>
                            </div>

                        </form>
                    </div>
                )}

                {/* ─── Formulário Editar Transação ─── */}
                {formMode === 'edit' && editingTransaction && (
                    <div className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Editar transação</h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="Fechar edição de transação"
                                title="Fechar"
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={updateForm.handleSubmit(onSubmitUpdate)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                            {editingTransaction.type !== 'CREDIT_INSTALLMENT' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Tipo</label>
                                    <select
                                        {...updateForm.register('type')}
                                        className="app-control w-full"
                                    >
                                        <option value="INCOME">Receita</option>
                                        <option value="CREDIT_CASH">Crédito à vista</option>
                                        <option value="DEBIT">Débito</option>
                                        <option value="PIX">Pix</option>
                                        <option value="CASH">Dinheiro</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Valor (R$)</label>
                                <input
                                    {...updateForm.register('amount', { valueAsNumber: true })}
                                    type="number" step="0.01"
                                    className="app-control w-full"
                                />
                                {updateForm.formState.errors.amount && (
                                    <p className="text-red-500 text-sm mt-1">{updateForm.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Data</label>
                                <input
                                    {...updateForm.register('date')}
                                    type="date"
                                    className="app-control w-full"
                                />
                                {updateForm.formState.errors.date && (
                                    <p className="text-red-500 text-sm mt-1">{updateForm.formState.errors.date.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Categoria</label>
                                <select
                                    {...updateForm.register('categoryId')}
                                    className="app-control w-full"
                                >
                                    {updateCategories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {formatStoredIconPrefix(cat.icon)}{cat.name}{cat.isArchived ? ' (arquivada)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Conta</label>
                                <select
                                    {...updateForm.register('financialAccountId')}
                                    className="app-control w-full"
                                >
                                    {editableFinancialAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {formatStoredIconPrefix(account.icon)}{account.name}{account.isArchived ? ' (arquivada)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {updateForm.formState.errors.financialAccountId && (
                                    <p className="text-red-500 text-sm mt-1">{updateForm.formState.errors.financialAccountId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>Descrição (opcional)</label>
                                <input
                                    {...updateForm.register('description')}
                                    type="text"
                                    className="app-control w-full"
                                />
                            </div>

                            <label className="app-checkbox-row h-fit sm:mt-6">
                                <input
                                    {...updateForm.register('isPending')}
                                    type="checkbox" id="isPendingEdit"
                                    className="app-checkbox"
                                    onChange={(e) => updateForm.setValue('isPending', e.target.checked)}
                                />
                                <span className="text-sm">
                                    Transação pendente
                                </span>
                            </label>

                            {editingTransaction.type === 'CREDIT_INSTALLMENT' && (
                                <div className="app-inline-alert app-inline-alert-warning px-4 py-3 sm:col-span-2">
                                    <p className="text-sm">
                                        ⚠️ Parcela {editingTransaction.currentInstallment}/{editingTransaction.totalInstallments}x — tipo e dados de parcelamento são imutáveis
                                    </p>
                                </div>
                            )}


                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={updateForm.formState.isSubmitting}
                                    className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto"
                                >
                                    {updateForm.formState.isSubmitting ? 'Salvando...' : 'Salvar alterações'}
                                </button>
                            </div>

                        </form>
                    </div>
                )}

                {/* ─── Tabela ─── */}
                {isLoading ? (
                    <div className="flex items-center justify-center h-48">
                        <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    </div>
                ) : sortedTransactions.length === 0 ? (
                    <div className="glass flex items-center justify-center h-48 rounded-2xl"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <p style={{ color: 'var(--color-text-muted)' }}>Nenhuma transação encontrada</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {sortedTransactions.map((t) => (
                                <div
                                    key={t.id}
                                    className="glass rounded-2xl p-4"
                                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold leading-5" style={{ color: 'var(--color-text)' }}>
                                                {t.description ?? 'Sem descrição'}
                                            </p>
                                            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatDate(t.date)} · {formatStoredIconPrefix(t.category.icon)}{t.category.name}{t.category.isArchived ? ' (arquivada)' : ''} · {formatStoredIconPrefix(t.financialAccount?.icon)}{t.financialAccount?.name ?? 'Conta não encontrada'}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 text-right text-sm font-semibold ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                                            {t.type === 'INCOME' ? '+' : '-'} {formatCurrency(t.amount)}
                                        </span>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${typeColor[t.type]}`}>
                                            {transactionTypeLabel(t.type)}
                                        </span>
                                        {t.totalInstallments && (
                                            <span className="inline-flex items-center whitespace-nowrap text-xs text-purple-500">
                                                {t.currentInstallment}/{t.totalInstallments}x
                                            </span>
                                        )}
                                        {t.isPending && (
                                            <span className="app-chip app-chip-warning inline-flex items-center whitespace-nowrap px-2 py-0.5 text-xs">
                                                Pendente
                                            </span>
                                        )}
                                        <ImportSourceBadge source={getImportSource(t)} />
                                    </div>

                                    <div className="mt-3 flex justify-end gap-2">
                                        <button
                                            type="button"
                                            aria-label="Editar transação"
                                            onClick={() => handleOpenEdit(t)}
                                            className="app-icon-control rounded-lg p-2"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Deletar transação"
                                            onClick={() => handleDelete(t)}
                                            className="app-icon-control rounded-lg p-2"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="glass hidden overflow-x-auto rounded-2xl md:block"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <table className="w-full min-w-[860px]">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                                        <th className="text-left px-6 py-3">
                                            <SortHeader label="Data" sort="date" activeSort={sortKey} onSort={handleSort} />
                                        </th>
                                        <th className="text-left px-6 py-3">
                                            <SortHeader label="Descrição" sort="description" activeSort={sortKey} onSort={handleSort} />
                                        </th>
                                        <th className="text-left px-6 py-3">
                                            <SortHeader label="Categoria" sort="category" activeSort={sortKey} onSort={handleSort} />
                                        </th>
                                        <th className="text-left px-6 py-3">
                                            <SortHeader label="Conta" sort="account" activeSort={sortKey} onSort={handleSort} />
                                        </th>
                                        <th className="text-left px-6 py-3">
                                            <SortHeader label="Tipo" sort="type" activeSort={sortKey} onSort={handleSort} />
                                        </th>
                                        <th className="text-right px-6 py-3">
                                            <SortHeader label="Valor" sort="amount" activeSort={sortKey} onSort={handleSort} align="right" />
                                        </th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedTransactions.map((t) => (
                                        <tr key={t.id} className="transition"
                                            style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td className="px-6 py-4 text-sm whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatDate(t.date)}
                                            </td>
                                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--color-text)' }}>
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="break-words leading-5">
                                                        {t.description ?? '—'}
                                                    </span>
                                                    {(t.totalInstallments || t.isPending) && (
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {t.totalInstallments && (
                                                                <span className="inline-flex items-center whitespace-nowrap text-xs text-purple-500">
                                                                    {t.currentInstallment}/{t.totalInstallments}x
                                                                </span>
                                                            )}
                                                            {t.isPending && (
                                                                <span className="app-chip app-chip-warning inline-flex items-center whitespace-nowrap px-2 py-0.5 text-xs">
                                                                    Pendente
                                                                </span>
                                                            )}
                                                            <ImportSourceBadge source={getImportSource(t)} />
                                                        </div>
                                                    )}
                                                    {!t.totalInstallments && !t.isPending && (
                                                        <ImportSourceBadge source={getImportSource(t)} />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatStoredIconPrefix(t.category.icon)}{t.category.name}{t.category.isArchived ? ' (arquivada)' : ''}
                                            </td>
                                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatStoredIconPrefix(t.financialAccount?.icon)}{t.financialAccount?.name ?? 'Conta não encontrada'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`whitespace-nowrap text-xs font-medium px-2.5 py-1 rounded-full ${typeColor[t.type]}`}>
                                                    {transactionTypeLabel(t.type)}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 text-sm font-semibold text-right whitespace-nowrap ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-500'}`}>
                                                {t.type === 'INCOME' ? '+' : '-'} {formatCurrency(t.amount)}
                                            </td>
                                            <td className="px-6 py-4 flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(t)}
                                                    aria-label="Editar transação"
                                                    title="Editar transação"
                                                    className="p-1.5 rounded-lg transition hover:bg-blue-50"
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(t)}
                                                    aria-label="Deletar transação"
                                                    title="Deletar transação"
                                                    className="p-1.5 rounded-lg transition hover:bg-red-50"
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

            </div>
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                secondaryAction={confirmModal.secondaryAction}
            />

        </Layout>
    )
}
