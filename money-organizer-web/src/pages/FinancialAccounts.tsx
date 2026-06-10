import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'react-hot-toast'
import { AlertTriangle, Archive, Check, Pencil, Plus, RotateCcw, WalletCards, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import ConfirmModal from '../components/ConfirmModal'
import {
    archiveFinancialAccount,
    createFinancialAccount,
    getFinancialAccounts,
    updateFinancialAccount,
} from '../api/financialAccounts'
import type { FinancialAccount, FinancialAccountType } from '../types'
import {
    financialAccountSchema,
    type FinancialAccountFormData,
} from '../schemas'
import { formatCurrency } from '../utils'

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

function sanitizeAccountPayload(data: FinancialAccountFormData) {
    return {
        ...data,
        institutionName: data.institutionName?.trim() || undefined,
        icon: data.icon?.trim() || undefined,
        color: data.color?.trim() || undefined,
    }
}

export function FinancialAccounts() {
    const [accounts, setAccounts] = useState<FinancialAccount[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState<FinancialAccount | null>(null)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        accountId: string | null
    }>({ isOpen: false, accountId: null })
    const [initialBalanceConfirm, setInitialBalanceConfirm] = useState<{
        isOpen: boolean
        payload: ReturnType<typeof sanitizeAccountPayload> | null
    }>({ isOpen: false, payload: null })

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FinancialAccountFormData>({
        resolver: zodResolver(financialAccountSchema),
        defaultValues: DEFAULT_FORM_VALUES,
    })

    useEffect(() => {
        getFinancialAccounts()
            .then((res) => setAccounts(res.data))
            .finally(() => setIsLoading(false))
    }, [])

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

    const saveAccount = async (payload: ReturnType<typeof sanitizeAccountPayload>) => {
        try {
            if (editing) {
                const res = await updateFinancialAccount(editing.id, payload)
                setAccounts((prev) =>
                    prev.map((account) => account.id === editing.id ? res.data : account)
                )
                toast.success('Conta financeira atualizada!')
            } else {
                const res = await createFinancialAccount(payload)
                setAccounts((prev) => [...prev, res.data])
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
            toast.success('Conta reativada!')
        } catch {
            toast.error('Erro ao reativar a conta!')
        }
    }

    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Contas</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Organize bancos, carteiras e origens do dinheiro</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 sm:w-auto"
                    >
                        <Plus size={16} />
                        Nova conta
                    </button>
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
                                    <div className="mt-2 flex gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs leading-5 text-yellow-800">
                                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                        <span>
                                            Alterar o saldo inicial reescreve a base histórica desta conta. Use isso só se o saldo de abertura estava errado; para corrigir diferença real, o ideal futuramente será conciliação ou ajuste de saldo.
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>Ícone</label>
                                <input
                                    {...register('icon')}
                                    type="text"
                                    placeholder="🏦"
                                    maxLength={8}
                                    className="app-control w-full"
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
                                                {account.icon || <WalletCards size={20} />}
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
                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
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
        </Layout>
    )
}
