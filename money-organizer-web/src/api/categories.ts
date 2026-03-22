import api from './axios'
import type { Category } from "../types"

interface CategoryPayload {
    name: string
    icon?: string
}

export const getCategories = () =>
    api.get<Category[]>('/categories')

export const createCategory = (data: CategoryPayload) =>
    api.post<Category>('/categories', data)

export const updateCategory = (id: string, data: CategoryPayload) =>
    api.patch<Category>(`/categories/${id}`, data)

export const deleteCategory = (id: string) =>
    api.delete<{ message: string }>(`/categories/${id}`)


