import api from './axios'
import type { Reminder, ReminderStatus } from '../types'

interface ReminderPayload {
    title: string
    dueDate: string
    amount?: number | null
    status?: ReminderStatus
    note?: string | null
    financialAccountId?: string | null
    categoryId?: string | null
}

interface ReminderFilters {
    status?: ReminderStatus
    startDate?: string
    endDate?: string
    financialAccountId?: string
    categoryId?: string
}

export const getReminders = (filters?: ReminderFilters) =>
    api.get<Reminder[]>('/reminders', { params: filters })

export const getReminder = (id: string) =>
    api.get<Reminder>(`/reminders/${id}`)

export const createReminder = (data: ReminderPayload) =>
    api.post<Reminder>('/reminders', data)

export const updateReminder = (id: string, data: Partial<ReminderPayload>) =>
    api.patch<Reminder>(`/reminders/${id}`, data)

export const deleteReminder = (id: string) =>
    api.delete<{ message: string }>(`/reminders/${id}`)
