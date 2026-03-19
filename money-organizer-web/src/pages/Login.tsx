import { useState} from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate} from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { login } from '../api/auth'
import { loginSchema } from '../schemas'
import type { LoginFormData } from '../schemas'

export function Login() {
    const { signIn } = useAuth()
    const navigate = useNavigate()
    const [serverError, setServerError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        formState: {errors, isSubmitting },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema)
    })


    const onSubmit = async (data: LoginFormData) => {
        setServerError(null)
        try {
            const response = await login(data)
            await signIn(response.data.access_token)
            navigate('/dashboard')            
        } catch {
            setServerError('Email ou senha inválidos!')
        }
    }

    return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Bem-vindo de volta</h1>
          <p className="text-gray-500 mt-1">Entre na sua conta para continuar</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="seu@email.com"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
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
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>

        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          Não tem conta?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            Criar conta
          </Link>
        </p>

      </div>
    </div>
  )
}


