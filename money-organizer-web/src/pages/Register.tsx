import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { login, register as registerUser } from '../api/auth'
import { useAuth } from '../contexts/useAuth'
import { registerSchema } from '../schemas'
import type { RegisterFormData } from '../schemas'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/useTheme'

export function Register() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useTheme()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null)
    try {
      await registerUser(data)
      const loginResponse = await login({ email: data.email, password: data.password })
      await signIn(loginResponse.data.access_token)
      navigate('/dashboard')
    } catch {
      setServerError('Erro ao criar conta. Este email já pode estar em uso.')
    }
  }

  return (
    <div className="register-scene relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="register-motion-bg" aria-hidden="true">
        <span className="register-track register-track-a" />
        <span className="register-track register-track-b" />
        <span className="register-ledger-card register-ledger-card-a" />
        <span className="register-ledger-card register-ledger-card-b" />
        <span className="register-step register-step-a" />
        <span className="register-step register-step-b" />
        <span className="register-step register-step-c" />
        <span className="register-balance-strip register-balance-strip-a" />
        <span className="register-balance-strip register-balance-strip-b" />
      </div>

      <div className="glass-heavy relative z-10 w-full max-w-md rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>

        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Criar conta</h1>
            <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Comece a organizar suas finanças hoje</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-lg transition"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)'
            }}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              Nome
            </label>
            <input
              {...register('name')}
              type="text"
              placeholder="Seu nome"
              className="app-control w-full"
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="seu@email.com"
              className="app-control w-full"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              Senha
            </label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="app-control w-full"
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-red-600 text-sm">{serverError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition"
          >
            {isSubmitting ? 'Criando conta...' : 'Criar conta'}
          </button>

        </form>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--color-text-muted)' }}>
          Já tem conta?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">
            Entrar
          </Link>
        </p>

      </div>
    </div>
  )
}
