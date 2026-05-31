import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../api/categories'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import { getTotalsByCategory } from '../api/transactions'
import type { Category, CategoryTotal } from '../types'
import { SmilePlus } from 'lucide-react'


const categorySchema = z.object({
    name: z.string().min(1, 'O Nome é obrigatório!'),
    icon: z.string().optional(),
})

type CategoryFormData = z.infer<typeof categorySchema>


export function Categories() {
    const [categories, setCategories] = useState<Category[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState<Category | null>(null)
    const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([])
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean
        categoryId: string | null
    }>({ isOpen: false, categoryId: null })

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<CategoryFormData>({
        resolver: zodResolver(categorySchema),
    })

    useEffect(() => {
        const range = getCurrentMonthRange()
        Promise.all([getCategories(), getTotalsByCategory(range)])
            .then(([catRes, totalsRes]) => {
                setCategories(catRes.data)
                setCategoryTotals(totalsRes.data)
            })
            .finally(() => setIsLoading(false))
    }, [])

    const handleOpenCreate = () => {
        setEditing(null)
        reset({ name: '', icon: '' })
        setShowForm(true)
    }

    const handleOpenEdit = (category: Category) => {
        setEditing(category)
        reset({ name: category.name, icon: category.icon ?? '' })
        setShowForm(true)
    }

    const handleClose = () => {
        setShowForm(false)
        setEditing(null)
        setShowEmojiPicker(false)
        reset()
    }

    const onSubmit = async (data: CategoryFormData) => {

        try {
            if (editing) {
                const res = await updateCategory(editing.id, data)
                setCategories((prev) =>
                    prev.map((c) => (c.id === editing.id ? res.data : c))
                )
                toast.success('Categoria atualizada com sucesso!')
            } else {
                const res = await createCategory(data)
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
            await deleteCategory(confirmModal.categoryId)
            setCategories((prev) => prev.filter((c) => c.id !== confirmModal.categoryId))
            toast.success('Categoria removida com sucesso!')
        } catch {
            toast.error('Erro ao remover a categoria!')
        } finally {
            setConfirmModal({ isOpen: false, categoryId: null })
        }
    }

    const getTotalForCategory = (categoryId: string) =>
        categoryTotals.find((t) => t.categoryId === categoryId)

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

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Categorias</h1>
                        <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Gerencie suas categorias</p>
                    </div>
                    <button
                        onClick={handleOpenCreate}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
                    >
                        <Plus size={16} />
                        Nova categoria
                    </button>
                </div>

                {showForm && (
                    <div className="glass rounded-2xl p-6"
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

                        <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4 items-start">
                            <div className="w-32 relative">
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                                    Ícone
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        {...register('icon')}
                                        type="text"
                                        placeholder="🍔"
                                        maxLength={2}
                                        className="w-full px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl"
                                        style={{
                                            backgroundColor: 'var(--color-input-bg)',
                                            border: '1px solid var(--color-input-border)',
                                            color: 'var(--color-text)',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowEmojiPicker((prev) => !prev)}
                                        className="p-2.5 rounded-lg transition"
                                        style={{
                                            backgroundColor: 'var(--color-input-bg)',
                                            border: '1px solid var(--color-input-border)',
                                            color: 'var(--color-text-muted)',
                                        }}
                                    >
                                        <SmilePlus size={18} />
                                    </button>
                                </div>

                                {showEmojiPicker && (
                                    <div
                                        className="absolute z-50 mt-2 p-3 rounded-xl shadow-xl overflow-y-auto"
                                        style={{
                                            top: '100%',
                                            left: 0,
                                            width: '320px',
                                            maxHeight: '280px',
                                            backgroundColor: 'var(--color-bg-card)',                                            
                                            border: '1px solid var(--color-border)',
                                            opacity: 1,
                                        }}
                                    >
                                        {[
                                            { label: '🍽️ Alimentação', emojis: ['🍔', '🍕', '🍣', '🍜', '🥗', '🍺', '☕', '🍰', '🛒', '🥤'] },
                                            { label: '🚗 Transporte', emojis: ['🚗', '🚌', '🚇', '✈️', '🛵', '⛽', '🚕', '🚲'] },
                                            { label: '🏠 Casa', emojis: ['🏠', '💡', '🔧', '🛋️', '📦', '🧹', '🪴', '🛁'] },
                                            { label: '❤️ Saúde', emojis: ['💊', '🏥', '🧘', '🏋️', '🩺', '🧴', '🩹'] },
                                            { label: '🎉 Lazer', emojis: ['🎮', '🎬', '🎵', '📚', '🎯', '🏖️', '🎲', '🎭'] },
                                            { label: '💼 Trabalho', emojis: ['💼', '💻', '📱', '🖨️', '📊', '🗂️'] },
                                            { label: '💰 Finanças', emojis: ['💰', '💳', '📈', '🏦', '💵', '🪙'] },
                                            { label: '🛍️ Outros', emojis: ['🎁', '👗', '✂️', '🐾', '🌱', '📷', '⚽', '🧳'] },
                                        ].map((group) => (
                                            <div key={group.label} className="mb-3">
                                                <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                                    {group.label}
                                                </p>
                                                <div className="flex flex-wrap gap-1">
                                                    {group.emojis.map((emoji) => (
                                                        <button
                                                            key={emoji}
                                                            type="button"
                                                            onClick={() => {
                                                                setValue('icon', emoji)
                                                                setShowEmojiPicker(false)
                                                            }}
                                                            className="text-xl w-9 h-9 flex items-center justify-center rounded-lg transition hover:scale-110"
                                                            style={{ backgroundColor: 'var(--color-bg)' }}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}

                                        <p className="text-xs mt-1 pt-2" style={{
                                            color: 'var(--color-text-muted)',
                                            borderTop: '1px solid var(--color-border)',
                                        }}>
                                            💡 Não achou? Cole o emoji que quiser no campo!
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1">
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                                    Nome
                                </label>
                                <input
                                    {...register('name')}
                                    type="text"
                                    placeholder="Ex: Alimentação"
                                    className="w-full px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    style={{
                                        backgroundColor: 'var(--color-input-bg)',
                                        border: '1px solid var(--color-input-border)',
                                        color: 'var(--color-text)'
                                    }}
                                />
                                {errors.name && (
                                    <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                                )}
                            </div>

                            <div className="pt-6">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {categories.map((category) => (
                            <div
                                key={category.id}
                                className="glass rounded-2xl p-5 flex items-center justify-between"
                                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{category.icon ?? '📁'}</span>
                                    <div>
                                        <span className="font-medium block" style={{ color: 'var(--color-text)' }}>
                                            {category.name}
                                        </span>
                                        {(() => {
                                            const total = getTotalForCategory(category.id)
                                            return total ? (
                                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {total.transactionCount} compra{total.transactionCount !== 1 ? 's' : ''} · R$ {parseFloat(total.totalAmount).toFixed(2).replace('.', ',')}
                                                </span>
                                            ) : (
                                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    Sem movimentações este mês
                                                </span>
                                            )
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleOpenEdit(category)}
                                        className="p-2 rounded-lg transition hover:bg-blue-50"
                                        style={{ color: 'var(--color-text-muted)' }}
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => setConfirmModal({ isOpen: true, categoryId: category.id })}
                                        className="p-2 rounded-lg transition hover:bg-red-50"
                                        style={{ color: 'var(--color-text-muted)' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message="Tem certeza que deseja remover essa categoria? Transações vinculadas não serão removidas."
                onConfirm={handleDelete}
                onCancel={() => setConfirmModal({ isOpen: false, categoryId: null })}
            />


        </Layout>
    )
}
