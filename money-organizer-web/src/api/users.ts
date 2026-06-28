import api from './axios'
import type { User } from '../types'

export interface UpdateUserProfilePayload {
  name?: string
  email?: string
  currentPassword: string
}

export interface UpdateUserPasswordPayload {
  currentPassword: string
  newPassword: string
}

export interface UpdateUserPreferencesPayload {
  reserveTargetMonths?: number
}

export interface ConfirmUserPasswordPayload {
  password: string
}

export const updateUserProfile = (data: UpdateUserProfilePayload) =>
  api.patch<User>('/users/me', data)

export const updateUserPassword = (data: UpdateUserPasswordPayload) =>
  api.patch<{ message: string }>('/users/me/password', data)

export const updateUserPreferences = (data: UpdateUserPreferencesPayload) =>
  api.patch<User>('/users/me/preferences', data)

export const clearUserData = (data: ConfirmUserPasswordPayload) =>
  api.post<{ message: string }>('/users/me/clear-data', data)

export const deleteMyAccount = (data: ConfirmUserPasswordPayload) =>
  api.delete<{ message: string }>('/users/me', { data })
