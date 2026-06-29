import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import {
    ArrowRightLeft,
    Check,
    ChevronLeft,
    ChevronRight,
    FileSearch,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import ConfirmModal from '../components/ConfirmModal'
import { getFinancialAccounts } from '../api/financialAccounts'
import {
    createTransfer,
    deleteTransfer,
    getTransfer,
    getTransfers,
    updateTransfer,
} from '../api/transfers'
import { transferSchema, type TransferFormData } from '../schemas'
import type { AppliedImportSource, FinancialAccount, Transfer } from '../types'
import { formatCurrency, formatDate } from '../utils'
import { formatStoredIconPrefix } from '../components/storedIconRegistry'

type FormMode = 'create' | 'edit' | null
type QuickFilter = 'all' | 'pending' | 'confirmed'

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'confirmed', label: 'Confirmadas' },
]

function getCurrentMonth(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
}

function getTodayInputDate(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
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

function toInputDate(isoString: string): string {
    const date = new Date(isoString)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function getTransferDescription(transfer: Transfer): string {
    return transfer.description?.trim() || 'Transferência entre contas'
}

function matchesQuickFilter(transfer: Transfer, filter: QuickFilter): boolean {
    if (filter === 'pending') return transfer.isPending
    if (filter === 'confirmed') return !transfer.isPending
    return true
}

function getQuickFilterCount(transfers: Transfer[], filter: QuickFilter): number {
    return transfers.filter((transfer) => matchesQuickFilter(transfer, filter)).length
}

function accountLabel(account: FinancialAccount): string {
    return `${formatStoredIconPrefix(account.icon)}${account.name}${account.isArchived ? ' (arquivada)' : ''}`
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

function getImportSource(transfer: Transfer): AppliedImportSource | null {
    return transfer.importedMovements?.[0] ?? null
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

export function Transfers() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [transfers, setTransfers] = useState<Transfer[]>([])
    const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [formMode, setFormMode] = useState<FormMode>(null)
    const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)
    const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
    const [accountFilter, setAccountFilter] = useState('all')
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
    const editTransferId = searchParams.get('edit')
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        transferId: string | null
    }>({ isOpen: false, transferId: null })

    const form = useForm<TransferFormData>({
        resolver: zodResolver(transferSchema),
        defaultValues: {
            amount: 0.01,
            date: getTodayInputDate(),
            fromAccountId: '',
            toAccountId: '',
            isPending: false,
            description: '',
        },
    })

    const activeFinancialAccounts = financialAccounts.filter((account) => !account.isArchived)
    const editableFinancialAccounts = editingTransfer
        ? financialAccounts.filter((account) =>
            !account.isArchived ||
            account.id === editingTransfer.fromAccountId ||
            account.id === editingTransfer.toAccountId
        )
        : activeFinancialAccounts

    const getDefaultTransferValues = useCallback((): TransferFormData => ({
        amount: 0.01,
        date: getTodayInputDate(),
        fromAccountId: activeFinancialAccounts[0]?.id ?? '',
        toAccountId: activeFinancialAccounts[1]?.id ?? '',
        isPending: false,
        description: '',
    }), [activeFinancialAccounts])

    const buildTransferFilters = useCallback(() => {
        const range = monthToRange(currentMonth)

        return {
            ...range,
            ...(accountFilter !== 'all' ? { financialAccountId: accountFilter } : {}),
        }
    }, [accountFilter, currentMonth])

    const loadData = useCallback(async () => {
        const [transfersRes, accountsRes] = await Promise.all([
            getTransfers(buildTransferFilters()),
            getFinancialAccounts(),
        ])

        setTransfers(transfersRes.data)
        setFinancialAccounts(accountsRes.data)
    }, [buildTransferFilters])

    useEffect(() => {
        let isActive = true

        setIsLoading(true)
        loadData()
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao carregar transferências.')
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
        if (!editTransferId || financialAccounts.length === 0) return

        let isActive = true

        getTransfer(editTransferId)
            .then((res) => {
                if (!isActive) return

                setCurrentMonth(toInputDate(res.data.date).slice(0, 7))
                setEditingTransfer(res.data)
                form.reset({
                    amount: Number(res.data.amount),
                    date: toInputDate(res.data.date),
                    fromAccountId: res.data.fromAccountId,
                    toAccountId: res.data.toAccountId,
                    isPending: res.data.isPending,
                    description: res.data.description ?? '',
                })
                setFormMode('edit')

                const nextParams = new URLSearchParams(searchParams)
                nextParams.delete('edit')
                setSearchParams(nextParams, { replace: true })
            })
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao abrir a transferência pelo extrato.')
                }
            })

        return () => {
            isActive = false
        }
    }, [editTransferId, financialAccounts.length, form, searchParams, setSearchParams])

    const handleClose = () => {
        setFormMode(null)
        setEditingTransfer(null)
        form.reset(getDefaultTransferValues())
    }

    const handleOpenCreate = () => {
        form.reset(getDefaultTransferValues())
        setEditingTransfer(null)
        setFormMode('create')
    }

    const handleOpenEdit = (transfer: Transfer) => {
        setEditingTransfer(transfer)
        form.reset({
            amount: Number(transfer.amount),
            date: toInputDate(transfer.date),
            fromAccountId: transfer.fromAccountId,
            toAccountId: transfer.toAccountId,
            isPending: transfer.isPending,
            description: transfer.description ?? '',
        })
        setFormMode('edit')
    }

    const handleSubmitTransfer = async (data: TransferFormData) => {
        try {
            if (editingTransfer) {
                await updateTransfer(editingTransfer.id, data)
                toast.success('Transferência atualizada com sucesso!')
            } else {
                await createTransfer(data)
                toast.success('Transferência criada com sucesso!')
            }

            await loadData()
            handleClose()
        } catch {
            toast.error('Erro ao salvar a transferência. Verifique as contas e o valor.')
        }
    }

    const handleDelete = async () => {
        if (!confirmModal.transferId) return

        try {
            await deleteTransfer(confirmModal.transferId)
            setTransfers((prev) => prev.filter((transfer) => transfer.id !== confirmModal.transferId))
            toast.success('Transferência removida com sucesso!')
        } catch (error) {
            toast.error(apiErrorMessage(error, 'Erro ao remover a transferência.'))
        } finally {
            setConfirmModal({ isOpen: false, transferId: null })
        }
    }

    const goToPrevMonth = () => {
        const [y, m] = currentMonth.split('-').map(Number)
        const prev = new Date(y, m - 2, 1)
        setCurrentMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`)
    }

    const goToNextMonth = () => {
        const [y, m] = currentMonth.split('-').map(Number)
        const next = new Date(y, m, 1)
        setCurrentMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
    }

    const filteredTransfers = transfers.filter((transfer) =>
        matchesQuickFilter(transfer, quickFilter)
    )

    const canCreateTransfer = activeFinancialAccounts.length >= 2

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Transferências</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Movimente dinheiro entre suas contas</p>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:w-auto lg:flex-row lg:items-center">
                        <div
                            className="glass flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 sm:w-auto"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <button
                                onClick={goToPrevMonth}
                                aria-label="Mês anterior"
                                className="app-icon-control flex h-9 w-9 items-center justify-center rounded-lg"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="min-w-0 flex-1 text-center text-sm font-medium capitalize sm:w-36 sm:flex-none" style={{ color: 'var(--color-text)' }}>
                                {formatMonthLabel(currentMonth)}
                            </span>
                            <button
                                onClick={goToNextMonth}
                                aria-label="Próximo mês"
                                className="app-icon-control flex h-9 w-9 items-center justify-center rounded-lg"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={handleOpenCreate}
                            disabled={!canCreateTransfer}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
                        >
                            <Plus size={16} />
                            Nova transferência
                        </button>
                    </div>
                </div>

                <div
                    className="glass grid w-full gap-3 rounded-2xl p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    <div className="grid w-full grid-cols-3 gap-1 rounded-xl p-1"
                        style={{ backgroundColor: 'var(--color-bg)' }}>
                        {QUICK_FILTERS.map((filter) => {
                            const isActive = quickFilter === filter.key
                            const count = getQuickFilterCount(transfers, filter.key)

                            return (
                                <button
                                    key={filter.key}
                                    type="button"
                                    aria-label={`${filter.label} ${count}`}
                                    onClick={() => setQuickFilter(filter.key)}
                                    className="rounded-lg px-3 py-2 text-sm font-medium transition"
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

                    <select
                        value={accountFilter}
                        onChange={(event) => setAccountFilter(event.target.value)}
                        className="app-control w-full"
                    >
                        <option value="all">Todas as contas</option>
                        {financialAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                                {accountLabel(account)}
                            </option>
                        ))}
                    </select>
                </div>

                {!canCreateTransfer && (
                    <div
                        className="glass rounded-2xl p-4 text-sm"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                    >
                        Cadastre pelo menos duas contas ativas para criar transferências.
                    </div>
                )}

                {formMode && (
                    <div
                        className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                {formMode === 'edit' ? 'Editar transferência' : 'Nova transferência'}
                            </h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="Fechar formulário de transferência"
                                title="Fechar"
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={form.handleSubmit(handleSubmitTransfer)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Valor (R$)</label>
                                <input
                                    {...form.register('amount', { valueAsNumber: true })}
                                    type="number"
                                    step="0.01"
                                    className="app-control w-full"
                                />
                                {form.formState.errors.amount && (
                                    <p className="mt-1 text-sm text-red-500">{form.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Data</label>
                                <input
                                    {...form.register('date')}
                                    type="date"
                                    className="app-control w-full"
                                />
                                {form.formState.errors.date && (
                                    <p className="mt-1 text-sm text-red-500">{form.formState.errors.date.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Conta de origem</label>
                                <select {...form.register('fromAccountId')} className="app-control w-full">
                                    <option value="">Selecione...</option>
                                    {editableFinancialAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {accountLabel(account)}
                                        </option>
                                    ))}
                                </select>
                                {form.formState.errors.fromAccountId && (
                                    <p className="mt-1 text-sm text-red-500">{form.formState.errors.fromAccountId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Conta de destino</label>
                                <select {...form.register('toAccountId')} className="app-control w-full">
                                    <option value="">Selecione...</option>
                                    {editableFinancialAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {accountLabel(account)}
                                        </option>
                                    ))}
                                </select>
                                {form.formState.errors.toAccountId && (
                                    <p className="mt-1 text-sm text-red-500">{form.formState.errors.toAccountId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Descrição (opcional)</label>
                                <input
                                    {...form.register('description')}
                                    type="text"
                                    className="app-control w-full"
                                    placeholder="Ex: Envio para reserva"
                                />
                            </div>

                            <label className="app-checkbox-row h-fit sm:mt-6">
                                <input
                                    {...form.register('isPending')}
                                    type="checkbox"
                                    id="transfer-is-pending"
                                    className="app-checkbox"
                                    onChange={(event) => form.setValue('isPending', event.target.checked)}
                                />
                                <span className="text-sm">
                                    Transferência pendente
                                </span>
                            </label>

                            <div className="flex justify-end sm:col-span-2">
                                <button
                                    type="submit"
                                    disabled={form.formState.isSubmitting}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto"
                                >
                                    <Check size={16} />
                                    {form.formState.isSubmitting ? 'Salvando...' : 'Salvar transferência'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                        <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    </div>
                ) : filteredTransfers.length === 0 ? (
                    <div
                        className="glass flex h-48 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                    >
                        <p style={{ color: 'var(--color-text-muted)' }}>Nenhuma transferência encontrada</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {filteredTransfers.map((transfer) => (
                                <div
                                    key={transfer.id}
                                    className="glass rounded-2xl p-4"
                                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold leading-5" style={{ color: 'var(--color-text)' }}>
                                                {getTransferDescription(transfer)}
                                            </p>
                                            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatDate(transfer.date)}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-right text-sm font-semibold text-blue-600">
                                            {formatCurrency(transfer.amount)}
                                        </span>
                                    </div>

                                    <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                        <span className="min-w-0 truncate">{accountLabel(transfer.fromAccount)}</span>
                                        <ArrowRightLeft size={15} className="shrink-0" />
                                        <span className="min-w-0 truncate">{accountLabel(transfer.toAccount)}</span>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        {transfer.isPending ? (
                                            <span className="app-chip app-chip-warning px-2.5 py-1 text-xs font-medium">Pendente</span>
                                        ) : (
                                            <span className="app-chip app-chip-success px-2.5 py-1 text-xs font-medium">Confirmada</span>
                                        )}
                                        <ImportSourceBadge source={getImportSource(transfer)} />

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                aria-label="Editar transferência"
                                                onClick={() => handleOpenEdit(transfer)}
                                                className="app-icon-control rounded-lg p-2"
                                            >
                                                <Pencil size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Remover transferência"
                                                onClick={() => setConfirmModal({ isOpen: true, transferId: transfer.id })}
                                                className="app-icon-control rounded-lg p-2"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div
                            className="glass hidden overflow-x-auto rounded-2xl md:block"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <table className="w-full min-w-[820px]">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                                        <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Data</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Descrição</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Origem</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Destino</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Valor</th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransfers.map((transfer) => (
                                        <tr key={transfer.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                {formatDate(transfer.date)}
                                            </td>
                                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--color-text)' }}>
                                                <div className="flex flex-col gap-1.5">
                                                    <span>{getTransferDescription(transfer)}</span>
                                                    <ImportSourceBadge source={getImportSource(transfer)} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                {accountLabel(transfer.fromAccount)}
                                            </td>
                                            <td className="px-6 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                {accountLabel(transfer.toAccount)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {transfer.isPending ? (
                                                    <span className="app-chip app-chip-warning px-2.5 py-1 text-xs font-medium">Pendente</span>
                                                ) : (
                                                    <span className="app-chip app-chip-success px-2.5 py-1 text-xs font-medium">Confirmada</span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-blue-600">
                                                {formatCurrency(transfer.amount)}
                                            </td>
                                            <td className="flex gap-1 px-6 py-4">
                                                <button
                                                    onClick={() => handleOpenEdit(transfer)}
                                                    className="rounded-lg p-1.5 transition hover:bg-blue-50"
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    onClick={() => setConfirmModal({ isOpen: true, transferId: transfer.id })}
                                                    className="rounded-lg p-1.5 transition hover:bg-red-50"
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
                message="Remover esta transferência ajusta o saldo das contas envolvidas. Deseja continuar?"
                confirmLabel="Remover"
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ isOpen: false, transferId: null })}
            />
        </Layout>
    )
}
