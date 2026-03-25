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
import type { Category } from '../types'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
  })

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data))
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
    } catch (error) {
      toast.error('Erro ao salvar a categoria!')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover essa categoria?')) return
    try {
      await deleteCategory(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      toast.success('Categoria removida com sucesso!')
    } catch (error) {
      toast.error('Erro ao remover a categoria!')
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
          <div className="rounded-2xl p-6"
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
              <div className="w-24">
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                  Ícone
                </label>
                <input
                  {...register('icon')}
                  type="text"
                  placeholder="🍔"
                  className="w-full px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    border: '1px solid var(--color-input-border)',
                    color: 'var(--color-text)'
                  }}
                />
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
          <div className="flex items-center justify-center h-48 rounded-2xl"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>Nenhuma categoria encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl p-5 flex items-center justify-between"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{category.icon ?? '📁'}</span>
                  <span className="font-medium" style={{ color: 'var(--color-text)' }}>{category.name}</span>
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
                    onClick={() => handleDelete(category.id)}
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
    </Layout>
  )
}