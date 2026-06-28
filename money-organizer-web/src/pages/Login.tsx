import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { login } from '../api/auth'
import { loginSchema } from '../schemas'
import type { LoginFormData } from '../schemas'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/useTheme'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isDark, toggleTheme } = useTheme()
  const [serverError, setServerError] = useState<string | null>(null)
  const sessionExpired = searchParams.get('reason') === 'session-expired'
  const nextPath = searchParams.get('next')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  })


  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    try {
      const response = await login(data)
      await signIn(response.data.access_token)
      navigate(nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/dashboard')
    } catch {
      setServerError('Email ou senha inválidos!')
    }
  }

  return (
    <div className="login-scene relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="login-geometry-bg" aria-hidden="true">
        <span className="login-lane login-lane-a" />
        <span className="login-lane login-lane-b" />
        <span className="login-shape login-square login-shape-a" />
        <span className="login-shape login-square login-shape-b" />
        <span className="login-shape login-diamond login-shape-c" />
        <span className="login-shape login-triangle login-shape-d" />
        <span className="login-mini-card login-mini-card-a" />
        <span className="login-mini-card login-mini-card-b" />
      </div>

      <div className="glass-heavy relative z-10 w-full max-w-md rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div className='flex items-start justify-between'>
          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Bem-vindo de volta!</h1>
            <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Entre na sua conta para continuar</p>
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
            <div className="app-inline-alert app-inline-alert-danger px-4 py-3">
              <p className="text-sm">{serverError}</p>
            </div>
          )}

          {sessionExpired && !serverError && (
            <div
              className="rounded-lg border px-4 py-3"
              style={{ backgroundColor: 'var(--color-bg-input)', borderColor: 'var(--color-border-soft)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Sua sessão expirou. Entre novamente para continuar.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>

        </form>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--color-text-muted)' }}>
          Não tem conta?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            Criar conta
          </Link>
        </p>

      </div>
    </div>
  )
}


