import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { AlertTriangle, Archive, ArrowDownLeft, ArrowUpRight, Check, Pencil, Plus, Repeat2, RotateCcw, Scale, Trash2, WalletCards, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import ConfirmModal from '../components/ConfirmModal'
import {
    createBalanceAdjustment,
    deleteBalanceAdjustment,
    getBalanceAdjustments,
    updateBalanceAdjustment,
} from '../api/balanceAdjustments'
import {
    archiveFinancialAccount,
    createFinancialAccount,
    getFinancialAccountLedger,
    getFinancialAccounts,
    updateFinancialAccount,
} from '../api/financialAccounts'
import type { AccountLedgerItem, AccountLedgerResponse, BalanceAdjustment, FinancialAccount, FinancialAccountType } from '../types'
import {
    balanceAdjustmentSchema,
    type BalanceAdjustmentFormData,
    financialAccountSchema,
    type FinancialAccountFormData,
} from '../schemas'
import { formatCurrency, formatDate, transactionTypeLabel } from '../utils'
import { StoredIcon, StoredIconPicker } from '../components/StoredIcon'
import { formatStoredIconPrefix, getStoredIconOption } from '../components/storedIconRegistry'

const ACCOUNT_TYPE_LABELS: Record<FinancialAccountType, string> = {
    BANK_ACCOUNT: 'Conta bancária',
    CASH_WALLET: 'Carteira física',
    OTHER: 'Outra',
}

const DEFAULT_FORM_VALUES: FinancialAccountFormData = {
    name: '',
    type: 'BANK_ACCOUNT',
    institutionName: '',
    icon: '',
    color: '#2563eb',
    initialBalance: 0,
    includeInDashboard: true,
}

function getTodayInputDate(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

const DEFAULT_ADJUSTMENT_FORM_VALUES: BalanceAdjustmentFormData = {
    amount: 0,
    date: getTodayInputDate(),
    financialAccountId: '',
    reason: '',
}

function sanitizeAccountPayload(data: FinancialAccountFormData) {
    const icon = data.icon?.trim()

    return {
        ...data,
        institutionName: data.institutionName?.trim() || undefined,
        icon: icon && getStoredIconOption(icon) ? icon : '',
        color: data.color?.trim() || undefined,
    }
}

function accountLabel(account: Pick<FinancialAccount, 'name' | 'icon' | 'isArchived'>): string {
    return `${formatStoredIconPrefix(account.icon)}${account.name}${account.isArchived ? ' (arquivada)' : ''}`
}

function ledgerMovementLabel(item: AccountLedgerItem): string {
    const labels: Record<AccountLedgerItem['movementType'], string> = {
        TRANSACTION_INCOME: 'Receita',
        TRANSACTION_EXPENSE: 'Despesa',
        TRANSFER_IN: 'Transferencia recebida',
        TRANSFER_OUT: 'Transferencia enviada',
        BALANCE_ADJUSTMENT: 'Ajuste de saldo',
    }

    return labels[item.movementType]
}

function ledgerItemDetail(item: AccountLedgerItem): string {
    if (item.sourceType === 'TRANSACTION') {
        const typeLabel = item.transactionType ? transactionTypeLabel(item.transactionType) : 'Transacao'
        const categoryName = item.category?.name

        return categoryName ? `${typeLabel} - ${categoryName}` : typeLabel
    }

    if (item.sourceType === 'TRANSFER') {
        return item.relatedAccount
            ? `Conta relacionada: ${accountLabel(item.relatedAccount)}`
            : 'Transferencia entre contas'
    }

    return 'Conciliação manual'
}

function ledgerStatusLabel(item: AccountLedgerItem): string {
    if (!item.affectsCurrentBalance) {
        return item.isPending ? 'Pendente futura' : 'Futuro'
    }

    return item.isPending ? 'Pendente' : 'Confirmado'
}

function ledgerStatusClass(item: AccountLedgerItem): string {
    if (!item.affectsCurrentBalance) {
        return 'app-chip app-chip-info'
    }

    return item.isPending
        ? 'app-chip app-chip-warning'
        : 'app-chip app-chip-success'
}

function LedgerMovementIcon({ item }: { item: AccountLedgerItem }) {
    if (item.movementType === 'TRANSACTION_INCOME' || item.movementType === 'TRANSFER_IN') {
        return <ArrowDownLeft size={17} />
    }

    if (item.movementType === 'TRANSFER_OUT') {
        return <Repeat2 size={17} />
    }

    if (item.movementType === 'BALANCE_ADJUSTMENT') {
        return <Scale size={17} />
    }

    return <ArrowUpRight size={17} />
}

export function FinancialAccounts() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [accounts, setAccounts] = useState<FinancialAccount[]>([])
    const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([])
    const [ledger, setLedger] = useState<AccountLedgerResponse | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isLedgerLoading, setIsLedgerLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [showAdjustmentForm, setShowAdjustmentForm] = useState(false)
    const [editing, setEditing] = useState<FinancialAccount | null>(null)
    const [editingAdjustment, setEditingAdjustment] = useState<BalanceAdjustment | null>(null)
    const [ledgerAccountId, setLedgerAccountId] = useState('')
    const [ledgerStartDate, setLedgerStartDate] = useState('')
    const [ledgerEndDate, setLedgerEndDate] = useState('')
    const [ledgerReloadKey, setLedgerReloadKey] = useState(0)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        accountId: string | null
    }>({ isOpen: false, accountId: null })
    const [adjustmentConfirmModal, setAdjustmentConfirmModal] = useState<{
        isOpen: boolean
        adjustmentId: string | null
    }>({ isOpen: false, adjustmentId: null })
    const [initialBalanceConfirm, setInitialBalanceConfirm] = useState<{
        isOpen: boolean
        payload: ReturnType<typeof sanitizeAccountPayload> | null
    }>({ isOpen: false, payload: null })
    const accountDeepLinkId = searchParams.get('account')
    const adjustmentDeepLinkId = searchParams.get('adjustment')

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<FinancialAccountFormData>({
        resolver: zodResolver(financialAccountSchema),
        defaultValues: DEFAULT_FORM_VALUES,
    })

    const selectedAccountIcon = watch('icon') ?? ''

    const adjustmentForm = useForm<BalanceAdjustmentFormData>({
        resolver: zodResolver(balanceAdjustmentSchema),
        defaultValues: DEFAULT_ADJUSTMENT_FORM_VALUES,
    })

    const activeAccounts = accounts.filter((account) => !account.isArchived)
    const adjustmentAccountOptions = editingAdjustment
        ? accounts.filter((account) =>
            !account.isArchived || account.id === editingAdjustment.financialAccountId
        )
        : activeAccounts
    const selectedLedgerAccount = accounts.find((account) => account.id === ledgerAccountId)
    const ledgerAccount = ledger?.account ?? selectedLedgerAccount
    const ledgerItems = ledger?.items ?? []
    const ledgerEffectiveNetChange = Number(ledger?.totals.effectiveNetChange ?? ledger?.totals.netChange ?? 0)

    const loadData = useCallback(async () => {
        const [accountsRes, adjustmentsRes] = await Promise.all([
            getFinancialAccounts(),
            getBalanceAdjustments(),
        ])

        setAccounts(accountsRes.data)
        setAdjustments(adjustmentsRes.data)
    }, [])

    useEffect(() => {
        let isActive = true

        setIsLoading(true)
        loadData()
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao carregar contas financeiras!')
                }
            })
            .finally(() => {
                if (isActive) {
                    setIsLoading(false)
                }
            })

        return () => {
            isActive = false
        }
    }, [loadData])

    useEffect(() => {
        if (accounts.length === 0) {
            setLedgerAccountId('')
            setLedger(null)
            return
        }

        setLedgerAccountId((currentId) => {
            if (accountDeepLinkId && accounts.some((account) => account.id === accountDeepLinkId)) {
                return accountDeepLinkId
            }

            if (currentId && accounts.some((account) => account.id === currentId)) {
                return currentId
            }

            return accounts[0].id
        })
    }, [accountDeepLinkId, accounts])

    useEffect(() => {
        if (!ledgerAccountId) {
            setLedger(null)
            return
        }

        let isActive = true

        setIsLedgerLoading(true)
        getFinancialAccountLedger(ledgerAccountId, {
            startDate: ledgerStartDate || undefined,
            endDate: ledgerEndDate || undefined,
        })
            .then((res) => {
                if (isActive) {
                    setLedger(res.data)
                }
            })
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao carregar o extrato da conta!')
                    setLedger(null)
                }
            })
            .finally(() => {
                if (isActive) {
                    setIsLedgerLoading(false)
                }
            })

        return () => {
            isActive = false
        }
    }, [ledgerAccountId, ledgerStartDate, ledgerEndDate, ledgerReloadKey])

    const handleOpenCreate = () => {
        setEditing(null)
        reset(DEFAULT_FORM_VALUES)
        setShowForm(true)
    }

    const handleOpenEdit = (account: FinancialAccount) => {
        setEditing(account)
        reset({
            name: account.name,
            type: account.type,
            institutionName: account.institutionName ?? '',
            icon: account.icon ?? '',
            color: account.color ?? '#2563eb',
            initialBalance: Number(account.initialBalance),
            includeInDashboard: account.includeInDashboard,
            isArchived: account.isArchived,
        })
        setShowForm(true)
    }

    const handleClose = () => {
        setShowForm(false)
        setEditing(null)
        setInitialBalanceConfirm({ isOpen: false, payload: null })
        reset(DEFAULT_FORM_VALUES)
    }

    const handleOpenAdjustment = () => {
        const firstActiveAccount = activeAccounts[0]

        setEditingAdjustment(null)
        adjustmentForm.reset({
            ...DEFAULT_ADJUSTMENT_FORM_VALUES,
            date: getTodayInputDate(),
            financialAccountId: firstActiveAccount?.id ?? '',
        })
        setShowAdjustmentForm(true)
    }

    const handleOpenEditAdjustment = useCallback((adjustment: BalanceAdjustment) => {
        setEditingAdjustment(adjustment)
        adjustmentForm.reset({
            amount: Number(adjustment.amount),
            date: adjustment.date.slice(0, 10),
            financialAccountId: adjustment.financialAccountId,
            reason: adjustment.reason,
        })
        setLedgerAccountId(adjustment.financialAccountId)
        setShowAdjustmentForm(true)
    }, [adjustmentForm])

    const handleOpenLedgerItem = (item: AccountLedgerItem) => {
        if (item.sourceType === 'TRANSACTION') {
            navigate(`/transactions?edit=${item.sourceId}`)
            return
        }

        if (item.sourceType === 'TRANSFER') {
            navigate(`/transfers?edit=${item.sourceId}`)
            return
        }

        const adjustment = adjustments.find((entry) => entry.id === item.sourceId)

        if (!adjustment) {
            toast.error('Ajuste não encontrado na lista atual.')
            return
        }

        handleOpenEditAdjustment(adjustment)
    }

    const handleCloseAdjustment = () => {
        setShowAdjustmentForm(false)
        setEditingAdjustment(null)
        adjustmentForm.reset(DEFAULT_ADJUSTMENT_FORM_VALUES)
    }

    const handleSubmitAdjustment = async (data: BalanceAdjustmentFormData) => {
        try {
            if (editingAdjustment) {
                await updateBalanceAdjustment(editingAdjustment.id, {
                    amount: data.amount,
                    date: data.date,
                    reason: data.reason.trim(),
                })
            } else {
                await createBalanceAdjustment({
                    ...data,
                    reason: data.reason.trim(),
                })
            }
            await loadData()
            setLedgerReloadKey((current) => current + 1)
            handleCloseAdjustment()
            toast.success(editingAdjustment ? 'Ajuste atualizado!' : 'Ajuste de saldo criado!')
        } catch {
            toast.error('Erro ao salvar o ajuste de saldo!')
        }
    }

    const handleDeleteAdjustment = async () => {
        if (!adjustmentConfirmModal.adjustmentId) return

        try {
            await deleteBalanceAdjustment(adjustmentConfirmModal.adjustmentId)
            await loadData()
            setLedgerReloadKey((current) => current + 1)
            toast.success('Ajuste removido com sucesso!')
        } catch {
            toast.error('Erro ao remover o ajuste de saldo!')
        } finally {
            setAdjustmentConfirmModal({ isOpen: false, adjustmentId: null })
        }
    }

    const saveAccount = async (payload: ReturnType<typeof sanitizeAccountPayload>) => {
        try {
            if (editing) {
                const res = await updateFinancialAccount(editing.id, payload)
                setAccounts((prev) =>
                    prev.map((account) => account.id === editing.id ? res.data : account)
                )
                setLedgerReloadKey((current) => current + 1)
                toast.success('Conta financeira atualizada!')
            } else {
                const res = await createFinancialAccount(payload)
                setAccounts((prev) => [...prev, res.data])
                setLedgerAccountId(res.data.id)
                setLedgerReloadKey((current) => current + 1)
                toast.success('Conta financeira criada!')
            }
            handleClose()
        } catch {
            toast.error('Erro ao salvar a conta financeira!')
        }
    }

    const onSubmit = async (data: FinancialAccountFormData) => {
        const payload = sanitizeAccountPayload(data)
        const initialBalanceChanged =
            editing && Number(data.initialBalance) !== Number(editing.initialBalance)

        if (initialBalanceChanged) {
            setInitialBalanceConfirm({ isOpen: true, payload })
            return
        }

        await saveAccount(payload)
    }

    const handleConfirmInitialBalanceChange = async () => {
        if (!initialBalanceConfirm.payload) return

        const payload = initialBalanceConfirm.payload
        setInitialBalanceConfirm({ isOpen: false, payload: null })
        await saveAccount(payload)
    }

    const handleArchive = async () => {
        if (!confirmModal.accountId) return

        try {
            await archiveFinancialAccount(confirmModal.accountId)
            setAccounts((prev) =>
                prev.map((account) =>
                    account.id === confirmModal.accountId
                        ? { ...account, isArchived: true }
                        : account
                )
            )
            setLedgerReloadKey((current) => current + 1)
            toast.success('Conta arquivada com sucesso!')
        } catch {
            toast.error('Erro ao arquivar a conta!')
        } finally {
            setConfirmModal({ isOpen: false, accountId: null })
        }
    }

    const handleRestore = async (account: FinancialAccount) => {
        try {
            const res = await updateFinancialAccount(account.id, { isArchived: false })
            setAccounts((prev) =>
                prev.map((item) => item.id === account.id ? res.data : item)
            )
            setLedgerReloadKey((current) => current + 1)
            toast.success('Conta reativada!')
        } catch {
            toast.error('Erro ao reativar a conta!')
        }
    }

    useEffect(() => {
        if (!accountDeepLinkId || isLoading) return

        const account = accounts.find((entry) => entry.id === accountDeepLinkId)
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('account')

        if (!account) {
            toast.error('Conta não encontrada para abrir o extrato.')
            setSearchParams(nextParams, { replace: true })
            return
        }

        setLedgerAccountId(account.id)
        setSearchParams(nextParams, { replace: true })
    }, [
        accountDeepLinkId,
        accounts,
        isLoading,
        searchParams,
        setSearchParams,
    ])

    useEffect(() => {
        if (!adjustmentDeepLinkId || isLoading) return

        const adjustment = adjustments.find((entry) => entry.id === adjustmentDeepLinkId)
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('adjustment')

        if (!adjustment) {
            toast.error('Ajuste não encontrado para edição.')
            setSearchParams(nextParams, { replace: true })
            return
        }

        handleOpenEditAdjustment(adjustment)
        setSearchParams(nextParams, { replace: true })
    }, [
        adjustmentDeepLinkId,
        adjustments,
        handleOpenEditAdjustment,
        isLoading,
        searchParams,
        setSearchParams,
    ])

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Contas</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Organize bancos, carteiras e origens do dinheiro</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <button
                            type="button"
                            onClick={handleOpenAdjustment}
                            disabled={activeAccounts.length === 0}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto"
                        >
                            <Scale size={16} />
                            Novo ajuste
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenCreate}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto"
                        >
                            <Plus size={16} />
                            Nova conta
                        </button>
                    </div>
                </div>

                {showForm && (
                    <div className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                {editing ? 'Editar conta' : 'Nova conta'}
                            </h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Nome</label>
                                <input
                                    {...register('name')}
                                    type="text"
                                    placeholder="Ex: Nubank"
                                    className="app-control w-full"
                                />
                                {errors.name && (
                                    <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Tipo</label>
                                <select {...register('type')} className="app-control w-full">
                                    <option value="BANK_ACCOUNT">Conta bancária</option>
                                    <option value="CASH_WALLET">Carteira física</option>
                                    <option value="OTHER">Outra</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Instituição</label>
                                <input
                                    {...register('institutionName')}
                                    type="text"
                                    placeholder="Ex: Itaú, Inter, Caixa"
                                    className="app-control w-full"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Saldo inicial</label>
                                <input
                                    {...register('initialBalance', { valueAsNumber: true })}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="app-control w-full"
                                />
                                {errors.initialBalance && (
                                    <p className="mt-1 text-sm text-red-500">{errors.initialBalance.message}</p>
                                )}
                                {editing && (
                                    <div className="app-inline-alert app-inline-alert-warning mt-2 flex gap-2 px-3 py-2 text-xs leading-5">
                                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                        <span>
                                            Alterar o saldo inicial reescreve a base histórica desta conta. Use isso só se o saldo de abertura estava errado; para corrigir diferença real, o ideal futuramente será conciliação ou ajuste de saldo.
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Ícone</label>
                                <input type="hidden" {...register('icon')} />
                                <StoredIconPicker
                                    value={selectedAccountIcon}
                                    onChange={(value) => setValue('icon', value, { shouldDirty: true, shouldValidate: true })}
                                    fallback={WalletCards}
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Cor</label>
                                <input
                                    {...register('color')}
                                    type="color"
                                    className="app-control h-11 w-full p-1"
                                />
                            </div>

                            <label className="app-checkbox-row sm:col-span-2">
                                <input
                                    {...register('includeInDashboard')}
                                    type="checkbox"
                                    className="app-checkbox"
                                />
                                <span className="text-sm">Incluir no dashboard</span>
                            </label>

                            <div className="flex justify-end sm:col-span-2">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto"
                                >
                                    <Check size={16} />
                                    {isSubmitting ? 'Salvando...' : 'Salvar conta'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {showAdjustmentForm && (
                    <div
                        className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                {editingAdjustment ? 'Editar ajuste de saldo' : 'Novo ajuste de saldo'}
                            </h2>
                            <button
                                type="button"
                                onClick={handleCloseAdjustment}
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={adjustmentForm.handleSubmit(handleSubmitAdjustment)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Conta</label>
                                <select
                                    {...adjustmentForm.register('financialAccountId')}
                                    disabled={!!editingAdjustment}
                                    className="app-control w-full disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    <option value="">Selecione...</option>
                                    {adjustmentAccountOptions.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {accountLabel(account)}
                                        </option>
                                    ))}
                                </select>
                                {adjustmentForm.formState.errors.financialAccountId && (
                                    <p className="mt-1 text-sm text-red-500">{adjustmentForm.formState.errors.financialAccountId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Data</label>
                                <input
                                    {...adjustmentForm.register('date')}
                                    type="date"
                                    className="app-control w-full"
                                />
                                {adjustmentForm.formState.errors.date && (
                                    <p className="mt-1 text-sm text-red-500">{adjustmentForm.formState.errors.date.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Valor do ajuste</label>
                                <input
                                    {...adjustmentForm.register('amount', { valueAsNumber: true })}
                                    type="number"
                                    step="0.01"
                                    className="app-control w-full"
                                />
                                {adjustmentForm.formState.errors.amount && (
                                    <p className="mt-1 text-sm text-red-500">{adjustmentForm.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Motivo</label>
                                <input
                                    {...adjustmentForm.register('reason')}
                                    type="text"
                                    maxLength={240}
                                    className="app-control w-full"
                                    placeholder="Ex: Conferência com banco"
                                />
                                {adjustmentForm.formState.errors.reason && (
                                    <p className="mt-1 text-sm text-red-500">{adjustmentForm.formState.errors.reason.message}</p>
                                )}
                            </div>

                            <div className="flex gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800 sm:col-span-2">
                                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                <span>
                                    Use valor positivo para aumentar o saldo calculado e negativo para reduzir. Este registro não entra como receita ou despesa.
                                </span>
                            </div>

                            <div className="flex justify-end sm:col-span-2">
                                <button
                                    type="submit"
                                    disabled={adjustmentForm.formState.isSubmitting}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:bg-emerald-300 sm:w-auto"
                                >
                                    <Check size={16} />
                                    {adjustmentForm.formState.isSubmitting
                                        ? 'Salvando...'
                                        : editingAdjustment ? 'Salvar alteracoes' : 'Salvar ajuste'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                        <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    </div>
                ) : accounts.length === 0 ? (
                    <div className="glass flex h-48 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <p style={{ color: 'var(--color-text-muted)' }}>Nenhuma conta financeira encontrada</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                        {accounts.map((account) => (
                            <div
                                key={account.id}
                                className="glass flex min-h-44 flex-col justify-between gap-4 rounded-2xl p-5"
                                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                                                style={{ backgroundColor: account.color ?? 'var(--color-bg)' }}
                                            >
                                                <StoredIcon value={account.icon} fallback={WalletCards} size={20} />
                                            </span>
                                            <div className="min-w-0">
                                                <h2 className="break-words font-semibold leading-5" style={{ color: 'var(--color-text)' }}>
                                                    {account.name}
                                                </h2>
                                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {ACCOUNT_TYPE_LABELS[account.type]}
                                                    {account.institutionName ? ` · ${account.institutionName}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {account.isArchived && (
                                        <span className="app-chip app-chip-muted px-2.5 py-1 text-xs font-medium">
                                            Arquivada
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Saldo atual</p>
                                    <p
                                        className="text-lg font-semibold"
                                        style={{ color: Number(account.currentBalance) < 0 ? '#f87171' : 'var(--color-text)' }}
                                    >
                                        {formatCurrency(account.currentBalance)}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        Saldo inicial: {formatCurrency(account.initialBalance)}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        {account.includeInDashboard ? 'Incluída no dashboard' : 'Fora do dashboard'}
                                    </p>
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        aria-label="Editar conta"
                                        onClick={() => handleOpenEdit(account)}
                                        className="app-icon-control rounded-lg p-2"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    {account.isArchived ? (
                                        <button
                                            type="button"
                                            aria-label="Reativar conta"
                                            onClick={() => handleRestore(account)}
                                            className="app-icon-control rounded-lg p-2"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            aria-label="Arquivar conta"
                                            onClick={() => setConfirmModal({ isOpen: true, accountId: account.id })}
                                            className="app-icon-control rounded-lg p-2"
                                        >
                                            <Archive size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div
                    className="glass rounded-2xl p-5 sm:p-6"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Extrato da conta</h2>
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                Transações, transferências e ajustes em ordem cronológica
                            </p>
                        </div>

                        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-[220px_150px_150px_auto]">
                            <select
                                value={ledgerAccountId}
                                onChange={(event) => setLedgerAccountId(event.target.value)}
                                disabled={accounts.length === 0}
                                className="app-control w-full text-sm"
                            >
                                {accounts.length === 0 ? (
                                    <option value="">Sem contas</option>
                                ) : (
                                    accounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {accountLabel(account)}
                                        </option>
                                    ))
                                )}
                            </select>

                            <input
                                type="date"
                                value={ledgerStartDate}
                                onChange={(event) => setLedgerStartDate(event.target.value)}
                                className="app-control w-full text-sm"
                            />

                            <input
                                type="date"
                                value={ledgerEndDate}
                                onChange={(event) => setLedgerEndDate(event.target.value)}
                                className="app-control w-full text-sm"
                            />

                            <button
                                type="button"
                                onClick={() => {
                                    setLedgerStartDate('')
                                    setLedgerEndDate('')
                                }}
                                disabled={!ledgerStartDate && !ledgerEndDate}
                                className="app-icon-control flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                title="Limpar período"
                            >
                                <X size={15} />
                                <span className="lg:hidden xl:inline">Limpar</span>
                            </button>
                        </div>
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Conta</p>
                            <p className="mt-1 truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                {ledgerAccount ? accountLabel(ledgerAccount) : 'Nenhuma conta'}
                            </p>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Saldo atual</p>
                            <p
                                className="mt-1 text-sm font-semibold"
                                style={{ color: ledgerAccount && Number(ledgerAccount.currentBalance) < 0 ? '#f87171' : 'var(--color-text)' }}
                            >
                                {ledgerAccount ? formatCurrency(ledgerAccount.currentBalance) : '-'}
                            </p>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Abertura</p>
                            <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                {ledger ? formatCurrency(ledger.openingBalance) : '-'}
                            </p>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Fechamento</p>
                            <p
                                className="mt-1 text-sm font-semibold"
                                style={{ color: ledger && Number(ledger.closingBalance) < 0 ? '#f87171' : 'var(--color-text)' }}
                            >
                                {ledger ? formatCurrency(ledger.closingBalance) : '-'}
                            </p>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Movimento efetivo</p>
                            <p
                                className="mt-1 text-sm font-semibold"
                                style={{ color: ledgerEffectiveNetChange < 0 ? '#f87171' : '#16a34a' }}
                            >
                                {ledger ? formatCurrency(ledger.totals.effectiveNetChange) : '-'}
                            </p>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Pendencias</p>
                            <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                {ledger ? ledger.totals.pendingCount : 0}
                            </p>
                        </div>
                    </div>

                    {isLedgerLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <p style={{ color: 'var(--color-text-muted)' }}>Carregando extrato...</p>
                        </div>
                    ) : ledgerItems.length === 0 ? (
                        <div className="flex h-32 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum movimento encontrado para esta conta</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {ledgerItems.map((item) => {
                                    const signedAmount = Number(item.signedAmount)

                                    return (
                                        <div
                                            key={item.id}
                                            className="rounded-xl border p-3"
                                            style={{ borderColor: 'var(--color-border)' }}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex min-w-0 gap-3">
                                                    <span
                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                                        style={{ backgroundColor: 'var(--color-bg)', color: signedAmount < 0 ? '#f87171' : '#16a34a' }}
                                                    >
                                                        <LedgerMovementIcon item={item} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="break-words text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                            {item.title}
                                                        </p>
                                                        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                            {ledgerMovementLabel(item)} - {formatDate(item.date)}
                                                        </p>
                                                        <p className="mt-1 break-words text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                            {ledgerItemDetail(item)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span
                                                    className="shrink-0 text-sm font-semibold"
                                                    style={{ color: signedAmount < 0 ? '#f87171' : '#16a34a' }}
                                                >
                                                    {formatCurrency(signedAmount)}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ledgerStatusClass(item)}`}>
                                                        {ledgerStatusLabel(item)}
                                                    </span>
                                                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                        Saldo: {formatCurrency(item.balanceAfter)}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenLedgerItem(item)}
                                                    className="app-icon-control flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs"
                                                >
                                                    <Pencil size={14} />
                                                    Abrir
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[980px]">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Data</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Movimento</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Detalhe</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Valor</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Saldo</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledgerItems.map((item) => {
                                            const signedAmount = Number(item.signedAmount)

                                            return (
                                                <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td className="whitespace-nowrap px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                        {formatDate(item.date)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <span
                                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                                                style={{ backgroundColor: 'var(--color-bg)', color: signedAmount < 0 ? '#f87171' : '#16a34a' }}
                                                            >
                                                                <LedgerMovementIcon item={item} />
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                                    {item.title}
                                                                </p>
                                                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                                    {ledgerMovementLabel(item)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                        {ledgerItemDetail(item)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ledgerStatusClass(item)}`}>
                                                            {ledgerStatusLabel(item)}
                                                        </span>
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold"
                                                        style={{ color: signedAmount < 0 ? '#f87171' : '#16a34a' }}
                                                    >
                                                        {formatCurrency(signedAmount)}
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold"
                                                        style={{ color: Number(item.balanceAfter) < 0 ? '#f87171' : 'var(--color-text)' }}
                                                    >
                                                        {formatCurrency(item.balanceAfter)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            aria-label="Abrir movimento"
                                                            title="Abrir movimento"
                                                            onClick={() => handleOpenLedgerItem(item)}
                                                            className="app-icon-control rounded-lg p-2"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                <div
                    className="glass rounded-2xl p-5 sm:p-6"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Ajustes recentes</h2>
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                Conciliacoes manuais que alteram o saldo das contas
                            </p>
                        </div>
                    </div>

                    {isLoading ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    ) : adjustments.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum ajuste de saldo registrado</p>
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {adjustments.map((adjustment) => {
                                    const amount = Number(adjustment.amount)

                                    return (
                                        <div
                                            key={adjustment.id}
                                            className="rounded-xl border p-3"
                                            style={{ borderColor: 'var(--color-border)' }}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="break-words text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                        {adjustment.reason}
                                                    </p>
                                                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                        {accountLabel(adjustment.financialAccount)} - {formatDate(adjustment.date)}
                                                    </p>
                                                </div>
                                                <span
                                                    className="shrink-0 text-sm font-semibold"
                                                    style={{ color: amount < 0 ? '#f87171' : '#16a34a' }}
                                                >
                                                    {formatCurrency(amount)}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    aria-label="Editar ajuste"
                                                    onClick={() => handleOpenEditAdjustment(adjustment)}
                                                    className="app-icon-control rounded-lg p-2"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="Remover ajuste"
                                                    onClick={() => setAdjustmentConfirmModal({ isOpen: true, adjustmentId: adjustment.id })}
                                                    className="app-icon-control rounded-lg p-2"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[720px]">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Data</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Conta</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Motivo</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Valor</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {adjustments.map((adjustment) => {
                                            const amount = Number(adjustment.amount)

                                            return (
                                                <tr key={adjustment.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td className="whitespace-nowrap px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                        {formatDate(adjustment.date)}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text)' }}>
                                                        {accountLabel(adjustment.financialAccount)}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                        {adjustment.reason}
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold"
                                                        style={{ color: amount < 0 ? '#f87171' : '#16a34a' }}
                                                    >
                                                        {formatCurrency(amount)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            aria-label="Editar ajuste"
                                                            onClick={() => handleOpenEditAdjustment(adjustment)}
                                                            className="app-icon-control mr-1 rounded-lg p-2"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            aria-label="Remover ajuste"
                                                            onClick={() => setAdjustmentConfirmModal({ isOpen: true, adjustmentId: adjustment.id })}
                                                            className="app-icon-control rounded-lg p-2"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message="Arquivar essa conta? As transações antigas continuarão vinculadas a ela."
                onConfirm={handleArchive}
                onCancel={() => setConfirmModal({ isOpen: false, accountId: null })}
                confirmLabel="Arquivar"
            />
            <ConfirmModal
                isOpen={initialBalanceConfirm.isOpen}
                message="Tem certeza que deseja alterar o saldo inicial? Isso reescreve a base histórica da conta e recalcula o saldo atual. Não há desfazer automático para essa alteração."
                onConfirm={handleConfirmInitialBalanceChange}
                onCancel={() => setInitialBalanceConfirm({ isOpen: false, payload: null })}
                confirmLabel="Alterar saldo inicial"
            />
            <ConfirmModal
                isOpen={adjustmentConfirmModal.isOpen}
                message="Remover este ajuste recalcula o saldo da conta vinculada. Deseja continuar?"
                onConfirm={handleDeleteAdjustment}
                onCancel={() => setAdjustmentConfirmModal({ isOpen: false, adjustmentId: null })}
                confirmLabel="Remover ajuste"
            />
        </Layout>
    )
}
