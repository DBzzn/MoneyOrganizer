import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
  const [serverError, setServerError] = useState<string | null>(null)

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
    setServerError(null)
  }

  const handleOpenEdit = (category: Category) => {
    setEditing(category)
    reset({ name: category.name, icon: category.icon ?? '' })
    setShowForm(true)
    setServerError(null)
  }

  const handleClose = () => {
    setShowForm(false)
    setEditing(null)
    reset()
    setServerError(null)
  }

  const onSubmit = async (data: CategoryFormData) => {
    setServerError(null)
    try {
      if (editing) {
        const res = await updateCategory(editing.id, data)
        setCategories((prev) =>
          prev.map((c) => (c.id === editing.id ? res.data : c))
        )
      } else {
        const res = await createCategory(data)
        setCategories((prev) => [...prev, res.data])
      }
      handleClose()
    } catch (error) {
      setServerError('Erro ao salvar a categoria! Tente novamente')
      console.log(error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover essa categoria?')) return
    try {
      await deleteCategory(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
    } catch (error) {
      alert('Erro ao remover a categoria!')
      console.log(error)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
            <p className="text-gray-500 mt-1">Gerencie suas categorias</p>
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
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {editing ? 'Editar categoria' : 'Nova categoria'}
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4 items-start">
              <div className="w-24">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ícone
                </label>
                <input
                  {...register('icon')}
                  type="text"
                  placeholder="🍔"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl"
                />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome
                </label>
                <input
                  {...register('name')}
                  type="text"
                  placeholder="Ex: Alimentação"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              {serverError && (
                <p className="text-red-500 text-sm mt-1">{serverError}</p>
              )}

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
            <p className="text-gray-400">Carregando...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex items-center justify-center h-48 bg-white rounded-2xl border border-gray-200">
            <p className="text-gray-400">Nenhuma categoria encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{category.icon ?? '📁'}</span>
                  <span className="font-medium text-gray-800">{category.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(category)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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