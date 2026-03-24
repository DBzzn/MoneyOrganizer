import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Layout } from '../components/Layout'
import {
    getTransactions,
    updateTransaction,
    deleteTransaction,
    createTransaction,
    createInstallment,
} from '../api/transactions'
import { getCategories } from '../api/categories'
import type { Transaction, Category } from '../types'
import {
    transactionSchema,
    installmentSchema,
    type TransactionFormData,
    type InstallmentFormData,
    type UpdateTransactionFormData,
    updateTransactionSchema,
} from '../schemas'
import { formatCurrency, formatDate, transactionTypeLabel } from '../utils'
import { Plus, Trash2, X, CreditCard, Pencil } from 'lucide-react'

type FormMode = 'transaction' | 'installment' | 'edit' | null

function toInputDate(isoString: string): string {
    const isoD = new Date(isoString)
    const y = isoD.getFullYear()
    const m = String(isoD.getMonth() + 1).padStart(2, '0')
    const d = String(isoD.getDate()).padStart(2,'0')
    return `${y}-${m}-${d}`
}

export function Transactions() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [formMode, setFormMode] = useState<FormMode>(null)
    const [serverError, setServerError] = useState<string | null>(null)
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)


    const transactionForm = useForm<TransactionFormData>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            isPending: false,
            amount: 0.01
        }
    })

    const installmentForm = useForm<InstallmentFormData>({
        resolver: zodResolver(installmentSchema),
        defaultValues: {
            isPending: true,
            totalAmount: 0.01,
            totalInstallments: 2
        } //naturalmente um ou mais parcelamentos estão pendentes!
    })

    const updateForm = useForm<UpdateTransactionFormData>({
        resolver: zodResolver(updateTransactionSchema),
        defaultValues: { amount: 0.01 }

    })

    useEffect(() => {
        if (!editingTransaction) return
        console.log('data bruta da API:', editingTransaction.date)
        console.log('data convertida:', toInputDate(editingTransaction.date))
        updateForm.reset({
            amount: editingTransaction.amount,
            date: toInputDate(editingTransaction.date),
            categoryId: editingTransaction.categoryId,
            isPending: editingTransaction.isPending,
            description: editingTransaction.description ?? '',
            type: editingTransaction.type,
        })
    }, [editingTransaction])

    useEffect(() => {
        Promise.all([getTransactions(), getCategories()])
            .then(([transRes, catRes]) => {
                setTransactions(transRes.data),
                    setCategories(catRes.data)
            })
            .finally(() => setIsLoading(false))

    }, [])

    const handleClose = () => {
        setFormMode(null)
        setServerError(null)
        setEditingTransaction(null)
        transactionForm.reset()
        installmentForm.reset()
        updateForm.reset()
    }

    const handleOpenEdit = (tx: Transaction) => {
        setEditingTransaction(tx)        
        setFormMode('edit')
        setServerError(null)
    }

    const onSubmitTransaction = async (data: TransactionFormData) => {
        setServerError(null)
        try {
            const payload = {
                ...data,
                isPending: data.isPending ?? false
            }
            const res = await createTransaction(payload)
            setTransactions((prev) => [res.data, ...prev])
            handleClose()
        } catch (error) {
            setServerError('Erro ao criar a transação! Verifique os dados.')
            console.log(error)
        }
    }

    const onSubmitInstallment = async (data: InstallmentFormData) => {
        setServerError(null)
        try {
            await createInstallment(data)
            const res = await getTransactions()
            setTransactions(res.data)
            handleClose()
        } catch (error) {
            setServerError('Erro ao criar o parcelamento! Verifique os dados.')
            console.log(error)
        }
    }

    const onSubmitUpdate = async (data: UpdateTransactionFormData) => {
        if (!editingTransaction) return
        setServerError(null)
        try {
            const res = await updateTransaction(editingTransaction.id, data)
            setTransactions((prev) =>
                prev.map((t) => (t.id === editingTransaction.id ? res.data : t)),
            )
            handleClose()
        } catch (error) {
            setServerError('Erro ao atualizar a transação! Por favor, verifique os dados.')
            console.log(error)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Você tem certeza que deseja remover essa transação?')) return
        try {
            await deleteTransaction(id)
            setTransactions((prev) => prev.filter((t) => t.id !== id))
        } catch (error) {
            alert('Erro ao remover a transação!')
            console.log(error)
        }
    }

    const typeColor: Record<string, string> = {
        INCOME: 'bg-green-100 text-green-700',
        CREDIT_CASH: 'bg-blue-100 text-blue-700',
        CREDIT_INSTALLMENT: 'bg-purple-100 text-purple-700',
        DEBIT: 'bg-orange-100 text-orange-700',
        PIX: 'bg-teal-100 text-teal-700',
        CASH: 'bg-gray-100 text-gray-700',
    }

    return (
        <Layout>
            <div className="space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Transações</h1>
                        <p className="text-gray-500 mt-1">Gerencie suas movimentações</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setFormMode('installment'); setServerError(null) }} //FORMULARIO DE PARCELAS (PARCELAR)
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
                        >
                            <CreditCard size={16} />
                            Parcelar
                        </button>
                        <button
                            onClick={() => { setFormMode('transaction'); setServerError(null) }} //FORMULARIO DE TRANSAÇÕES
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
                        >
                            <Plus size={16} />
                            Nova transação
                        </button>
                    </div>
                </div>

                {formMode === 'transaction' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Nova transação</h2>
                            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={transactionForm.handleSubmit(onSubmitTransaction)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select
                                    {...transactionForm.register('type')}
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                                <input
                                    {...transactionForm.register('amount', { valueAsNumber: true })}
                                    type="number"
                                    step="0.01"
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {transactionForm.formState.errors.amount && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                                <input
                                    {...transactionForm.register('date')}
                                    type="date"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {transactionForm.formState.errors.date && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.date.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                <select
                                    {...transactionForm.register('categoryId')}
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Selecione...</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.icon} {cat.name}
                                        </option>
                                    ))}
                                </select>
                                {transactionForm.formState.errors.categoryId && (
                                    <p className="text-red-500 text-sm mt-1">{transactionForm.formState.errors.categoryId.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
                                <input
                                    {...transactionForm.register('description')}
                                    type="text"
                                    placeholder="Ex: Almoço com cliente"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-6">
                                <input
                                    {...transactionForm.register('isPending')}
                                    type="checkbox"
                                    id="isPending"
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                    onChange={(e) => transactionForm.setValue('isPending', e.target.checked)}
                                />
                                <label htmlFor="isPending" className="text-sm text-gray-700">
                                    Transação pendente
                                </label>
                            </div>

                            {serverError && (
                                <div className="sm:col-span-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                    <p className="text-red-600 text-sm">{serverError}</p>
                                </div>
                            )}

                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={transactionForm.formState.isSubmitting}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition"
                                >
                                    {transactionForm.formState.isSubmitting ? 'Salvando...' : 'Salvar transação'}
                                </button>
                            </div>

                        </form>
                    </div>
                )}

                {formMode === 'installment' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Novo parcelamento</h2>
                            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={installmentForm.handleSubmit(onSubmitInstallment)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valor total (R$)</label>
                                <input
                                    {...installmentForm.register('totalAmount', { valueAsNumber: true })}
                                    type="number"
                                    step="0.01"
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                {installmentForm.formState.errors.totalAmount && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.totalAmount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número de parcelas</label>
                                <input
                                    {...installmentForm.register('totalInstallments', { valueAsNumber: true })}
                                    type="number"
                                    min="2"
                                    placeholder="Ex: 12"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                {installmentForm.formState.errors.totalInstallments && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.totalInstallments.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Data da primeira parcela</label>
                                <input
                                    {...installmentForm.register('firstInstallmentDate')}
                                    type="date"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                {installmentForm.formState.errors.firstInstallmentDate && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.firstInstallmentDate.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                <select
                                    {...installmentForm.register('categoryId')}
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="">Selecione...</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.icon} {cat.name}
                                        </option>
                                    ))}
                                </select>
                                {installmentForm.formState.errors.categoryId && (
                                    <p className="text-red-500 text-sm mt-1">{installmentForm.formState.errors.categoryId.message}</p>
                                )}
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
                                <input
                                    {...installmentForm.register('description')}
                                    type="text"
                                    placeholder="Ex: iPhone 16 Pro"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            {serverError && (
                                <div className="sm:col-span-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                    <p className="text-red-600 text-sm">{serverError}</p>
                                </div>
                            )}

                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={installmentForm.formState.isSubmitting}
                                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition"
                                >
                                    {installmentForm.formState.isSubmitting ? 'Criando parcelas...' : 'Criar parcelamento'}
                                </button>
                            </div>

                        </form>
                    </div>
                )}

                {formMode === 'edit' && editingTransaction && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Editar transação</h2>
                            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={updateForm.handleSubmit(onSubmitUpdate)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                            {editingTransaction.type !== 'CREDIT_INSTALLMENT' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                    <select
                                        {...updateForm.register('type')}
                                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                                <input
                                    {...updateForm.register('amount', { valueAsNumber: true })}
                                    type="number"
                                    step="0.01"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {updateForm.formState.errors.amount && (
                                    <p className="text-red-500 text-sm mt-1">{updateForm.formState.errors.amount.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                                <input
                                    {...updateForm.register('date')}
                                    type="date"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {updateForm.formState.errors.date && (
                                    <p className="text-red-500 text-sm mt-1">{updateForm.formState.errors.date.message}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                <select
                                    {...updateForm.register('categoryId')}
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.icon} {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
                                <input
                                    {...updateForm.register('description')}
                                    type="text"
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-6">
                                <input
                                    {...updateForm.register('isPending')}
                                    type="checkbox"
                                    id="isPendingEdit"
                                    className="w-4 h-4 rounded border-gray-300"
                                    onChange={(e) => updateForm.setValue('isPending', e.target.checked)}
                                />
                                <label htmlFor="isPendingEdit" className="text-sm text-gray-700">
                                    Transação pendente
                                </label>
                            </div>

                            {editingTransaction.type === 'CREDIT_INSTALLMENT' && (
                                <div className="sm:col-span-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                                    <p className="text-yellow-700 text-sm">
                                        ⚠️ Parcela {editingTransaction.currentInstallment}/{editingTransaction.totalInstallments}x — tipo e dados de parcelamento são imutáveis
                                    </p>
                                </div>
                            )}

                            {serverError && (
                                <div className="sm:col-span-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                    <p className="text-red-600 text-sm">{serverError}</p>
                                </div>
                            )}

                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={updateForm.formState.isSubmitting}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition"
                                >
                                    {updateForm.formState.isSubmitting ? 'Salvando...' : 'Salvar alterações'}
                                </button>
                            </div>

                        </form>
                    </div>
                )}





                {isLoading ? (
                    <div className="flex items-center justify-center h-48">
                        <p className="text-gray-400">Carregando...</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-200">
                        <p className="text-gray-400">Nenhuma transação encontrada</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Data</th>
                                    <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Descrição</th>
                                    <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Categoria</th>
                                    <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Tipo</th>
                                    <th className="text-right text-xs font-medium text-gray-500 px-6 py-3">Valor</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {transactions.map((t) => (
                                    <tr key={t.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                            {formatDate(t.date)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-800">
                                            {t.description ?? '—'}
                                            {t.totalInstallments && (
                                                <span className="ml-2 text-xs text-purple-600">
                                                    {t.currentInstallment}/{t.totalInstallments}x
                                                </span>
                                            )}
                                            {t.isPending && (
                                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                                                    Pendente
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {t.category.icon} {t.category.name}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeColor[t.type]}`}>
                                                {transactionTypeLabel(t.type)}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-sm font-semibold text-right whitespace-nowrap ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                            {t.type === 'INCOME' ? '+' : '-'} {formatCurrency(t.amount)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleOpenEdit(t)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            >
                                                <Pencil size={15} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(t.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

            </div>
        </Layout>
    )
}