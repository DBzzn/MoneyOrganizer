import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AxiosError } from 'axios'
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../api/categories'
import { ChevronDown, FolderArchive, Plus, Pencil, Trash2, X, Check, RotateCcw } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import { getTotalsByCategory } from '../api/transactions'
import type { Category, CategoryTotal, TransactionType } from '../types'
import { formatCurrency } from '../utils'
import { StoredIcon, StoredIconPicker } from '../components/StoredIcon'
import { getStoredIconOption } from '../components/storedIconRegistry'


const categorySchema = z.object({
    name: z.string().min(1, 'O Nome é obrigatório!'),
    icon: z.string().max(64, 'Icone muito longo').optional(),
    kind: z.enum(['EXPENSE', 'INCOME', 'BOTH']),
})

type CategoryFormData = z.infer<typeof categorySchema>

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AxiosError) {
        const message = error.response?.data?.message

        if (typeof message === 'string') {
            return message
        }
    }

    return fallback
}

const EXPENSE_TYPES: TransactionType[] = ['CREDIT_CASH', 'CREDIT_INSTALLMENT', 'DEBIT', 'PIX', 'CASH']

const CATEGORY_KIND_LABELS: Record<Category['kind'], string> = {
    EXPENSE: 'Despesa',
    INCOME: 'Receita',
    BOTH: 'Mista',
}

function mergeCategoryTotals(groups: CategoryTotal[][]): CategoryTotal[] {
    const totals = new Map<string, CategoryTotal>()

    groups.flat().forEach((item) => {
        const current = totals.get(item.categoryId)
        const nextAmount = Number(current?.totalAmount ?? 0) + Number(item.totalAmount)
        const nextCount = (current?.transactionCount ?? 0) + item.transactionCount

        totals.set(item.categoryId, {
            ...item,
            totalAmount: nextAmount.toFixed(2),
            transactionCount: nextCount,
        })
    })

    return Array.from(totals.values())
}

function movementLabel(count: number, singular: string, plural: string) {
    return `${count} ${count === 1 ? singular : plural}`
}

function sanitizeCategoryPayload(data: CategoryFormData): CategoryFormData {
    const icon = data.icon?.trim()

    return {
        ...data,
        icon: icon && getStoredIconOption(icon) ? icon : '',
    }
}

export function Categories() {
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState<Category | null>(null)
    const [expenseTotals, setExpenseTotals] = useState<CategoryTotal[]>([])
    const [incomeTotals, setIncomeTotals] = useState<CategoryTotal[]>([])
    const [showArchivedCategories, setShowArchivedCategories] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        categoryId: string | null
    }>({ isOpen: false, categoryId: null })

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<CategoryFormData>({
        resolver: zodResolver(categorySchema),
    })

    const selectedIcon = watch('icon') ?? ''

    useEffect(() => {
        const range = getCurrentMonthRange()
        Promise.all([
            getCategories(),
            Promise.all(EXPENSE_TYPES.map((type) => getTotalsByCategory({ ...range, type }))),
            getTotalsByCategory({ ...range, type: 'INCOME' }),
        ])
            .then(([catRes, expenseResponses, incomeRes]) => {
                setCategories(catRes.data)
                setExpenseTotals(mergeCategoryTotals(expenseResponses.map((res) => res.data)))
                setIncomeTotals(incomeRes.data)
            })
            .finally(() => setIsLoading(false))
    }, [])

    const handleOpenCreate = () => {
        setEditing(null)
        reset({ name: '', icon: '', kind: 'EXPENSE' })
        setShowForm(true)
    }

    const handleOpenEdit = (category: Category) => {
        setEditing(category)
        reset({ name: category.name, icon: category.icon ?? '', kind: category.kind })
        setShowForm(true)
    }

    const handleClose = () => {
        setShowForm(false)
        setEditing(null)
        reset()
    }

    const onSubmit = async (data: CategoryFormData) => {
        const payload = sanitizeCategoryPayload(data)

        try {
            if (editing) {
                const res = await updateCategory(editing.id, payload)
                setCategories((prev) =>
                    prev.map((c) => (c.id === editing.id ? res.data : c))
                )
                toast.success('Categoria atualizada com sucesso!')
            } else {
                const res = await createCategory(payload)
                setCategories((prev) => [...prev, res.data])
                toast.success('Categoria criada!')
            }
            handleClose()
        } catch {
            toast.error('Erro ao salvar a categoria!')
        }
    }

    const handleDelete = async () => {
        if (!confirmModal.categoryId) return
        try {
            const res = await deleteCategory(confirmModal.categoryId)
            const { category, deleted, message } = res.data

            if (deleted) {
                setCategories((prev) => prev.filter((c) => c.id !== confirmModal.categoryId))
            } else if (category) {
                setCategories((prev) =>
                    prev.map((c) => (c.id === category.id ? category : c))
                )
            }

            toast.success(message)
        } catch (error) {
            toast.error(getErrorMessage(error, 'Erro ao remover a categoria!'))
        } finally {
            setConfirmModal({ isOpen: false, categoryId: null })
        }
    }

    const handleRestore = async (category: Category) => {
        try {
            const res = await updateCategory(category.id, { isArchived: false })
            setCategories((prev) =>
                prev.map((c) => (c.id === category.id ? res.data : c))
            )
            toast.success('Categoria reativada com sucesso!')
        } catch {
            toast.error('Erro ao reativar a categoria!')
        }
    }

    const getTotalsForCategory = (categoryId: string) => ({
        expenses: expenseTotals.find((total) => total.categoryId === categoryId),
        income: incomeTotals.find((total) => total.categoryId === categoryId),
    })

    const activeCategories = categories.filter((category) => !category.isArchived)
    const archivedCategories = categories.filter((category) => category.isArchived)

    function getCurrentMonthRange() {
        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth() + 1
        const lastDay = new Date(y, m, 0).getDate()
        const pad = (n: number) => String(n).padStart(2, '0')
        return {
            startDate: `${y}-${pad(m)}-01`,
            endDate: `${y}-${pad(m)}-${pad(lastDay)}`,
        }
    }



    return (
        <Layout>
            <div className="space-y-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Categorias</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Gerencie categorias ativas e arquivadas</p>
                    </div>
                    <button
                        onClick={handleOpenCreate}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto"
                    >
                        <Plus size={16} />
                        Nova categoria
                    </button>
                </div>

                {showForm && (
                    <div className="glass rounded-2xl p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                {editing ? 'Editar categoria' : 'Nova categoria'}
                            </h2>
                            <button
                                onClick={handleClose}
                                className="transition"
                                style={{ color: 'var(--color-text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 sm:flex-row sm:items-start">
                            <div className="w-full sm:w-72">
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                                    Icone
                                </label>
                                <StoredIconPicker
                                    value={selectedIcon}
                                    onChange={(value) => setValue('icon', value, { shouldDirty: true, shouldValidate: true })}
                                    fallback={FolderArchive}
                                />
                            </div>


                            <div className="w-full flex-1">
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                                    Nome
                                </label>
                                <input
                                    {...register('name')}
                                    type="text"
                                    placeholder="Ex: Alimentação"
                                    className="app-control w-full"
                                />
                                {errors.name && (
                                    <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                                )}
                            </div>

                            <div className="w-full sm:w-48">
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                                    Natureza
                                </label>
                                <select {...register('kind')} className="app-control w-full">
                                    <option value="EXPENSE">Despesa</option>
                                    <option value="INCOME">Receita</option>
                                    <option value="BOTH">Mista</option>
                                </select>
                            </div>

                            <div className="w-full sm:w-auto sm:pt-6">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:bg-blue-400 sm:w-auto"
                                >
                                    <Check size={16} />
                                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center h-48">
                        <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    </div>
                ) : categories.length === 0 ? (
                    <div className="glass flex items-center justify-center h-48 rounded-2xl"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <p style={{ color: 'var(--color-text-muted)' }}>Nenhuma categoria encontrada</p>
                    </div>
                ) : (
                    <>
                    {activeCategories.length === 0 ? (
                        <div className="glass flex items-center justify-center h-40 rounded-2xl"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <p style={{ color: 'var(--color-text-muted)' }}>Nenhuma categoria ativa</p>
                        </div>
                    ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {activeCategories.map((category) => (
                            <div
                                key={category.id}
                                className="glass flex items-center justify-between gap-3 rounded-2xl p-5"
                                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: 'var(--color-bg)' }}>
                                        <StoredIcon value={category.icon} fallback={FolderArchive} size={20} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="block break-words font-medium leading-5" style={{ color: 'var(--color-text)' }}>
                                                {category.name}
                                            </span>
                                            {category.isArchived && (
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                    Arquivada
                                                </span>
                                            )}
                                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                                {CATEGORY_KIND_LABELS[category.kind]}
                                            </span>
                                        </div>
                                        {(() => {
                                            const totals = getTotalsForCategory(category.id)
                                            const hasExpenses = !!totals.expenses
                                            const hasIncome = !!totals.income

                                            return hasExpenses || hasIncome ? (
                                                <span className="block text-xs leading-4" style={{ color: 'var(--color-text-muted)' }}>
                                                    {totals.expenses && (
                                                        <span className="block">
                                                            {movementLabel(totals.expenses.transactionCount, 'saída', 'saídas')} · {formatCurrency(totals.expenses.totalAmount)}
                                                        </span>
                                                    )}
                                                    {totals.income && (
                                                        <span className="block">
                                                            {movementLabel(totals.income.transactionCount, 'entrada', 'entradas')} · {formatCurrency(totals.income.totalAmount)}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="block text-xs leading-4" style={{ color: 'var(--color-text-muted)' }}>
                                                    Sem movimentações este mês
                                                </span>
                                            )
                                        })()}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        onClick={() => handleOpenEdit(category)}
                                        title="Editar categoria"
                                        className="p-2 rounded-lg transition hover:bg-blue-50"
                                        style={{ color: 'var(--color-text-muted)' }}
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    {category.isArchived ? (
                                        <button
                                            onClick={() => handleRestore(category)}
                                            title="Reativar categoria"
                                            className="p-2 rounded-lg transition hover:bg-green-50"
                                            style={{ color: 'var(--color-text-muted)' }}
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmModal({ isOpen: true, categoryId: category.id })}
                                            title="Remover ou arquivar categoria"
                                            className="p-2 rounded-lg transition hover:bg-red-50"
                                            style={{ color: 'var(--color-text-muted)' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    )}

                    {archivedCategories.length > 0 && (
                        <div
                            className="glass rounded-2xl p-4"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <button
                                type="button"
                                onClick={() => setShowArchivedCategories((current) => !current)}
                                className="flex w-full items-center justify-between gap-3 text-left"
                                style={{ color: 'var(--color-text)' }}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <FolderArchive size={18} style={{ color: 'var(--color-text-muted)' }} />
                                    <span className="font-medium">Categorias arquivadas</span>
                                    <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                                        style={{ backgroundColor: 'var(--color-bg-muted-card)', color: 'var(--color-muted-text)' }}>
                                        {archivedCategories.length}
                                    </span>
                                </span>
                                <ChevronDown
                                    size={18}
                                    className={`shrink-0 transition ${showArchivedCategories ? 'rotate-180' : ''}`}
                                    style={{ color: 'var(--color-text-muted)' }}
                                />
                            </button>

                            {showArchivedCategories && (
                                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {archivedCategories.map((category) => (
                                        <div
                                            key={category.id}
                                            className="app-archived-card flex items-center justify-between gap-3 rounded-2xl p-5"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xl grayscale opacity-70" style={{ backgroundColor: 'var(--color-bg-card)' }}>
                                                    <StoredIcon value={category.icon} fallback={FolderArchive} size={20} />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="block break-words font-medium leading-5">
                                                            {category.name}
                                                        </span>
                                                        <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                                                            style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-muted-text)' }}>
                                                            Arquivada
                                                        </span>
                                                        <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                                                            style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-muted-text)' }}>
                                                            {CATEGORY_KIND_LABELS[category.kind]}
                                                        </span>
                                                    </div>
                                                    {(() => {
                                                        const totals = getTotalsForCategory(category.id)
                                                        const hasExpenses = !!totals.expenses
                                                        const hasIncome = !!totals.income

                                                        return hasExpenses || hasIncome ? (
                                                            <span className="block text-xs leading-4">
                                                                {totals.expenses && (
                                                                    <span className="block">
                                                                        {movementLabel(totals.expenses.transactionCount, 'saída', 'saídas')} · {formatCurrency(totals.expenses.totalAmount)}
                                                                    </span>
                                                                )}
                                                                {totals.income && (
                                                                    <span className="block">
                                                                        {movementLabel(totals.income.transactionCount, 'entrada', 'entradas')} · {formatCurrency(totals.income.totalAmount)}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className="block text-xs leading-4">
                                                                Sem movimentações este mês
                                                            </span>
                                                        )
                                                    })()}
                                                </div>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-2">
                                                <button
                                                    onClick={() => handleOpenEdit(category)}
                                                    title="Editar categoria"
                                                    className="app-icon-control rounded-lg p-2"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleRestore(category)}
                                                    title="Reativar categoria"
                                                    className="app-icon-control rounded-lg p-2"
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    </>
                )}

            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message="Se essa categoria tiver transações vinculadas, ela será arquivada para preservar o histórico. Se não tiver movimentações, será removida de vez."
                confirmLabel="Continuar"
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ isOpen: false, categoryId: null })}
            />


        </Layout>
    )
}
