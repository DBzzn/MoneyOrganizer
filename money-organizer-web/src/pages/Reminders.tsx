import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import {
    Bell,
    CalendarClock,
    Check,
    CircleSlash,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import ConfirmModal from '../components/ConfirmModal'
import { getCategories } from '../api/categories'
import { getFinancialAccounts } from '../api/financialAccounts'
import {
    createReminder,
    deleteReminder,
    getReminders,
    updateReminder,
} from '../api/reminders'
import { reminderSchema, type ReminderFormData } from '../schemas'
import type { Category, FinancialAccount, Reminder, ReminderStatus } from '../types'
import { formatCurrency, formatDate } from '../utils'
import { formatStoredIconPrefix } from '../components/storedIconRegistry'

type StatusFilter = ReminderStatus | 'ALL'
type FormMode = 'create' | 'edit' | null

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'PENDING', label: 'Pendentes' },
    { value: 'DONE', label: 'Concluídos' },
    { value: 'CANCELED', label: 'Cancelados' },
]

const STATUS_LABELS: Record<ReminderStatus, string> = {
    PENDING: 'Pendente',
    DONE: 'Concluído',
    CANCELED: 'Cancelado',
}

function getTodayInputDate(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function getCurrentMonth(): string {
    return getTodayInputDate().slice(0, 7)
}

function monthToRange(month: string): { startDate: string; endDate: string } {
    const [year, monthNumber] = month.split('-').map(Number)
    const lastDay = new Date(year, monthNumber, 0).getDate()

    return {
        startDate: `${month}-01`,
        endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    }
}

function toInputDate(isoString: string): string {
    const date = new Date(isoString)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function statusClass(status: ReminderStatus): string {
    if (status === 'DONE') return 'app-chip app-chip-success'
    if (status === 'CANCELED') return 'app-chip app-chip-muted'
    return 'app-chip app-chip-warning'
}

function isOverdue(reminder: Reminder): boolean {
    return reminder.status === 'PENDING' && toInputDate(reminder.dueDate) < getTodayInputDate()
}

function accountLabel(account: FinancialAccount): string {
    return `${formatStoredIconPrefix(account.icon)}${account.name}${account.isArchived ? ' (arquivada)' : ''}`
}

function categoryLabel(category: Category): string {
    return `${formatStoredIconPrefix(category.icon)}${category.name}${category.isArchived ? ' (arquivada)' : ''}`
}

function buildReminderPayload(data: ReminderFormData) {
    return {
        title: data.title.trim(),
        dueDate: data.dueDate,
        amount: data.amount ?? null,
        status: data.status,
        note: data.note?.trim() || null,
        financialAccountId: data.financialAccountId || null,
        categoryId: data.categoryId || null,
    }
}

export function Reminders() {
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [formMode, setFormMode] = useState<FormMode>(null)
    const [editingReminder, setEditingReminder] = useState<Reminder | null>(null)
    const [currentMonth, setCurrentMonth] = useState(getCurrentMonth)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
    const [accountFilter, setAccountFilter] = useState('all')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        reminderId: string | null
    }>({ isOpen: false, reminderId: null })

    const form = useForm<ReminderFormData>({
        resolver: zodResolver(reminderSchema),
        defaultValues: {
            title: '',
            dueDate: getTodayInputDate(),
            amount: null,
            status: 'PENDING',
            note: '',
            financialAccountId: '',
            categoryId: '',
        },
    })

    const activeFinancialAccounts = financialAccounts.filter((account) => !account.isArchived)
    const activeCategories = categories.filter((category) => !category.isArchived)
    const editableFinancialAccounts = editingReminder
        ? financialAccounts.filter((account) =>
            !account.isArchived || account.id === editingReminder.financialAccountId
        )
        : activeFinancialAccounts
    const editableCategories = editingReminder
        ? categories.filter((category) =>
            !category.isArchived || category.id === editingReminder.categoryId
        )
        : activeCategories

    const buildFilters = useCallback(() => {
        const range = monthToRange(currentMonth)

        return {
            ...range,
            ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
            ...(accountFilter !== 'all' ? { financialAccountId: accountFilter } : {}),
            ...(categoryFilter !== 'all' ? { categoryId: categoryFilter } : {}),
        }
    }, [accountFilter, categoryFilter, currentMonth, statusFilter])

    const loadData = useCallback(async () => {
        const [remindersRes, accountsRes, categoriesRes] = await Promise.all([
            getReminders(buildFilters()),
            getFinancialAccounts(),
            getCategories(),
        ])

        setReminders(remindersRes.data)
        setFinancialAccounts(accountsRes.data)
        setCategories(categoriesRes.data)
    }, [buildFilters])

    useEffect(() => {
        let isActive = true

        setIsLoading(true)
        loadData()
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao carregar lembretes.')
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

    const resetForm = () => {
        form.reset({
            title: '',
            dueDate: getTodayInputDate(),
            amount: null,
            status: 'PENDING',
            note: '',
            financialAccountId: '',
            categoryId: '',
        })
    }

    const handleOpenCreate = () => {
        setEditingReminder(null)
        resetForm()
        setFormMode('create')
    }

    const handleOpenEdit = (reminder: Reminder) => {
        setEditingReminder(reminder)
        form.reset({
            title: reminder.title,
            dueDate: toInputDate(reminder.dueDate),
            amount: reminder.amount === null || reminder.amount === undefined ? null : Number(reminder.amount),
            status: reminder.status,
            note: reminder.note ?? '',
            financialAccountId: reminder.financialAccountId ?? '',
            categoryId: reminder.categoryId ?? '',
        })
        setFormMode('edit')
    }

    const handleClose = () => {
        setFormMode(null)
        setEditingReminder(null)
        resetForm()
    }

    const handleSubmitReminder = async (data: ReminderFormData) => {
        try {
            const payload = buildReminderPayload(data)

            if (editingReminder) {
                await updateReminder(editingReminder.id, payload)
                toast.success('Lembrete atualizado!')
            } else {
                await createReminder(payload)
                toast.success('Lembrete criado!')
            }

            await loadData()
            handleClose()
        } catch {
            toast.error('Erro ao salvar lembrete. Verifique os campos.')
        }
    }

    const handleStatusChange = async (reminder: Reminder, status: ReminderStatus) => {
        try {
            await updateReminder(reminder.id, { status })
            await loadData()
            toast.success('Status atualizado!')
        } catch {
            toast.error('Erro ao atualizar status do lembrete.')
        }
    }

    const handleDelete = async () => {
        if (!confirmModal.reminderId) return

        try {
            await deleteReminder(confirmModal.reminderId)
            await loadData()
            toast.success('Lembrete removido!')
        } catch {
            toast.error('Erro ao remover lembrete.')
        } finally {
            setConfirmModal({ isOpen: false, reminderId: null })
        }
    }

    const pendingCount = reminders.filter((reminder) => reminder.status === 'PENDING').length
    const overdueCount = reminders.filter(isOverdue).length
    const expectedAmount = reminders
        .filter((reminder) => reminder.status === 'PENDING')
        .reduce((sum, reminder) => sum + Number(reminder.amount ?? 0), 0)

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Lembretes</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            Vencimentos e anotações financeiras sem alterar o saldo das contas.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto"
                    >
                        <Plus size={16} />
                        Novo lembrete
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {[
                        {
                            label: 'Pendentes',
                            value: pendingCount,
                            icon: Bell,
                            color: 'var(--color-brand)',
                            bg: 'var(--color-balance-bg)',
                        },
                        {
                            label: 'Vencidos',
                            value: overdueCount,
                            icon: CalendarClock,
                            color: overdueCount > 0 ? 'var(--color-expense)' : 'var(--color-income)',
                            bg: overdueCount > 0 ? 'var(--color-expense-bg)' : 'var(--color-income-bg)',
                        },
                        {
                            label: 'Valor previsto',
                            value: formatCurrency(expectedAmount),
                            icon: Bell,
                            color: 'var(--color-text)',
                            bg: 'var(--color-bg-muted-card)',
                        },
                    ].map((card) => (
                        <div
                            key={card.label}
                            className="glass flex items-center gap-4 rounded-2xl p-5"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: card.bg }}>
                                <card.icon size={21} style={{ color: card.color }} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                                <p className="break-words text-xl font-bold leading-tight" style={{ color: card.color }}>
                                    {card.value}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    className="glass rounded-2xl p-4"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <input
                            type="month"
                            value={currentMonth}
                            onChange={(event) => setCurrentMonth(event.target.value)}
                            className="app-control text-sm"
                            aria-label="Mês dos lembretes"
                        />
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                            className="app-control text-sm"
                        >
                            {STATUS_FILTERS.map((status) => (
                                <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                        </select>
                        <select
                            value={accountFilter}
                            onChange={(event) => setAccountFilter(event.target.value)}
                            className="app-control text-sm"
                        >
                            <option value="all">Todas as contas</option>
                            {financialAccounts.map((account) => (
                                <option key={account.id} value={account.id}>{accountLabel(account)}</option>
                            ))}
                        </select>
                        <select
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            className="app-control text-sm"
                        >
                            <option value="all">Todas as categorias</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.id}>{categoryLabel(category)}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => {
                                setStatusFilter('PENDING')
                                setAccountFilter('all')
                                setCategoryFilter('all')
                                setCurrentMonth(getCurrentMonth())
                            }}
                            className="app-icon-control flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm"
                        >
                            <RotateCcw size={15} />
                            Limpar
                        </button>
                    </div>
                </div>

                {formMode && (
                    <div
                        className="glass rounded-2xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                    >
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                {editingReminder ? 'Editar lembrete' : 'Novo lembrete'}
                            </h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="Fechar formulário"
                                title="Fechar formulário"
                                className="app-icon-control rounded-lg p-2"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={form.handleSubmit(handleSubmitReminder)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Título</label>
                                <input
                                    {...form.register('title')}
                                    className="app-control"
                                    placeholder="Ex: Pagar fatura"
                                />
                                {form.formState.errors.title && (
                                    <p className="mt-1 text-sm text-red-500">{form.formState.errors.title.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Vencimento</label>
                                <input
                                    {...form.register('dueDate')}
                                    type="date"
                                    className="app-control"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Valor previsto</label>
                                <input
                                    {...form.register('amount', {
                                        setValueAs: (value) =>
                                            value === '' || value === null || value === undefined ? null : Number(value),
                                    })}
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    className="app-control"
                                    placeholder="Opcional"
                                />
                                {form.formState.errors.amount && (
                                    <p className="mt-1 text-sm text-red-500">{form.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Status</label>
                                <select {...form.register('status')} className="app-control">
                                    <option value="PENDING">Pendente</option>
                                    <option value="DONE">Concluído</option>
                                    <option value="CANCELED">Cancelado</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Conta</label>
                                <select {...form.register('financialAccountId')} className="app-control">
                                    <option value="">Sem conta vinculada</option>
                                    {editableFinancialAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>{accountLabel(account)}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Categoria</label>
                                <select {...form.register('categoryId')} className="app-control">
                                    <option value="">Sem categoria</option>
                                    {editableCategories.map((category) => (
                                        <option key={category.id} value={category.id}>{categoryLabel(category)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Observação</label>
                                <textarea
                                    {...form.register('note')}
                                    rows={3}
                                    className="app-control"
                                    placeholder="Detalhes opcionais"
                                />
                            </div>

                            <div className="flex justify-end gap-3 md:col-span-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="rounded-lg px-4 py-2 text-sm font-medium transition"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={form.formState.isSubmitting}
                                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                                >
                                    <Check size={16} />
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div
                    className="glass rounded-2xl p-5"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    {isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <p style={{ color: 'var(--color-text-muted)' }}>Carregando lembretes...</p>
                        </div>
                    ) : reminders.length === 0 ? (
                        <div className="flex h-32 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum lembrete encontrado</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {reminders.map((reminder) => (
                                    <div
                                        key={reminder.id}
                                        className="rounded-xl border p-4"
                                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                    {reminder.title}
                                                </p>
                                                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatDate(reminder.dueDate)}
                                                    {reminder.category ? ` · ${categoryLabel(reminder.category as Category)}` : ''}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(reminder.status)}`}>
                                                {STATUS_LABELS[reminder.status]}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                                                {reminder.amount ? formatCurrency(reminder.amount) : 'Sem valor'}
                                            </div>
                                            {isOverdue(reminder) && (
                                                <span className="app-chip app-chip-danger px-2.5 py-1 text-xs font-medium">
                                                    Vencido
                                                </span>
                                            )}
                                        </div>

                                        {reminder.note && (
                                            <p className="mt-2 break-words text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                {reminder.note}
                                            </p>
                                        )}

                                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                                            {reminder.status !== 'DONE' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusChange(reminder, 'DONE')}
                                                    className="app-icon-control rounded-lg p-2"
                                                    aria-label="Concluir lembrete"
                                                    title="Concluir lembrete"
                                                >
                                                    <Check size={15} />
                                                </button>
                                            )}
                                            {reminder.status !== 'PENDING' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusChange(reminder, 'PENDING')}
                                                    className="app-icon-control rounded-lg p-2"
                                                    aria-label="Reabrir lembrete"
                                                    title="Reabrir lembrete"
                                                >
                                                    <RotateCcw size={15} />
                                                </button>
                                            )}
                                            {reminder.status !== 'CANCELED' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusChange(reminder, 'CANCELED')}
                                                    className="app-icon-control rounded-lg p-2"
                                                    aria-label="Cancelar lembrete"
                                                    title="Cancelar lembrete"
                                                >
                                                    <CircleSlash size={15} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleOpenEdit(reminder)}
                                                className="app-icon-control rounded-lg p-2"
                                                aria-label="Editar lembrete"
                                                title="Editar lembrete"
                                            >
                                                <Pencil size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmModal({ isOpen: true, reminderId: reminder.id })}
                                                className="app-icon-control rounded-lg p-2 text-red-500"
                                                aria-label="Remover lembrete"
                                                title="Remover lembrete"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[760px]">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Lembrete</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Vencimento</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Vínculos</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Valor</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reminders.map((reminder) => (
                                            <tr key={reminder.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{reminder.title}</p>
                                                    {reminder.note && (
                                                        <p className="mt-1 max-w-xs truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>{reminder.note}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatDate(reminder.dueDate)}
                                                    {isOverdue(reminder) && (
                                                        <span className="app-chip app-chip-danger ml-2 px-2 py-0.5 text-xs font-medium">
                                                            Vencido
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                    <div className="space-y-1">
                                                        <p>{reminder.financialAccount ? accountLabel(reminder.financialAccount as FinancialAccount) : 'Sem conta'}</p>
                                                        <p>{reminder.category ? categoryLabel(reminder.category as Category) : 'Sem categoria'}</p>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                    {reminder.amount ? formatCurrency(reminder.amount) : '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(reminder.status)}`}>
                                                        {STATUS_LABELS[reminder.status]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-2">
                                                        {reminder.status !== 'DONE' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusChange(reminder, 'DONE')}
                                                                className="app-icon-control rounded-lg p-2"
                                                                aria-label="Concluir lembrete"
                                                                title="Concluir lembrete"
                                                            >
                                                                <Check size={15} />
                                                            </button>
                                                        )}
                                                        {reminder.status !== 'PENDING' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusChange(reminder, 'PENDING')}
                                                                className="app-icon-control rounded-lg p-2"
                                                                aria-label="Reabrir lembrete"
                                                                title="Reabrir lembrete"
                                                            >
                                                                <RotateCcw size={15} />
                                                            </button>
                                                        )}
                                                        {reminder.status !== 'CANCELED' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusChange(reminder, 'CANCELED')}
                                                                className="app-icon-control rounded-lg p-2"
                                                                aria-label="Cancelar lembrete"
                                                                title="Cancelar lembrete"
                                                            >
                                                                <CircleSlash size={15} />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEdit(reminder)}
                                                            className="app-icon-control rounded-lg p-2"
                                                            aria-label="Editar lembrete"
                                                            title="Editar lembrete"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmModal({ isOpen: true, reminderId: reminder.id })}
                                                            className="app-icon-control rounded-lg p-2 text-red-500"
                                                            aria-label="Remover lembrete"
                                                            title="Remover lembrete"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message="Tem certeza que deseja remover este lembrete?"
                confirmLabel="Remover"
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ isOpen: false, reminderId: null })}
            />
        </Layout>
    )
}
