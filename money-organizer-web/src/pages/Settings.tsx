import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import {
  AlertTriangle,
  Bell,
  CircleHelp,
  Database,
  Eraser,
  FileUp,
  Loader2,
  Moon,
  PiggyBank,
  Save,
  SlidersHorizontal,
  Sun,
  Tag,
  Trash2,
  UserRound,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import { Layout } from '../components/Layout'
import {
  clearUserData,
  deleteMyAccount,
  updateUserPreferences,
  updateUserPassword,
  updateUserProfile,
} from '../api/users'
import { useAuth } from '../contexts/useAuth'
import { useTheme } from '../contexts/useTheme'

const HELP_PREF_KEY = 'money-organizer.settings.context-help'

function readContextHelpPreference() {
  if (typeof window === 'undefined') {
    return true
  }

  return localStorage.getItem(HELP_PREF_KEY) !== 'off'
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message

    if (Array.isArray(message)) {
      return message[0] ?? fallback
    }

    if (typeof message === 'string') {
      return message
    }
  }

  return fallback
}

type StatusTone = 'green' | 'yellow' | 'blue' | 'gray'
type SavingAction = 'account' | 'preferences' | null
type DangerAction = 'clear' | 'delete'

const statusToneClassName: Record<StatusTone, string> = {
  green: 'app-chip app-chip-success',
  yellow: 'app-chip app-chip-warning',
  blue: 'app-chip app-chip-info',
  gray: 'app-chip app-chip-muted',
}

const dangerCopy: Record<
  DangerAction,
  {
    title: string
    message: string
    confirmLabel: string
    buttonClassName: string
    details: string[]
  }
> = {
  clear: {
    title: 'Limpar todos os dados',
    message: 'Digite sua senha para confirmar a limpeza da sua conta.',
    confirmLabel: 'Limpar dados',
    buttonClassName: 'bg-amber-600 hover:bg-amber-700',
    details: [
      'Remove transações, transferências, ajustes, lembretes, imports, categorias e contas.',
      'Mantém seu usuário, email, nome e senha.',
      'Cria novamente as categorias padrão e a Conta inicial.',
    ],
  },
  delete: {
    title: 'Excluir todos os meus dados',
    message: 'Digite sua senha para confirmar a exclusão definitiva da sua conta.',
    confirmLabel: 'Excluir conta',
    buttonClassName: 'bg-red-600 hover:bg-red-700',
    details: [
      'Remove todos os dados financeiros e históricos do usuário.',
      'Remove também seu usuário do banco de dados.',
      'Depois da confirmação, sua sessão será encerrada.',
    ],
  },
}

function SettingsCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <section
      className="glass rounded-2xl p-5 sm:p-6"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: 'var(--color-bg-muted-card)',
            color: 'var(--color-brand)',
          }}
        >
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition hover:opacity-90"
      style={{
        borderColor: 'var(--color-border-soft)',
        backgroundColor: 'var(--color-bg-input)',
      }}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-blue-600' : 'bg-slate-400'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </span>
    </button>
  )
}

function StatusRow({
  icon: Icon,
  label,
  description,
  badge,
  tone,
  to,
}: {
  icon: LucideIcon
  label: string
  description: string
  badge: string
  tone: StatusTone
  to?: string
}) {
  const content = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-muted-card)' }}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </span>
      </span>
      <span
        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClassName[tone]}`}
      >
        {badge}
      </span>
    </>
  )

  const className =
    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:opacity-90'
  const style = {
    borderColor: 'var(--color-border-soft)',
    backgroundColor: 'var(--color-bg-input)',
  }

  if (to) {
    return (
      <Link to={to} className={className} style={style}>
        {content}
      </Link>
    )
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  )
}

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function SaveButton({
  label,
  isLoading,
}: {
  label: string
  isLoading: boolean
}) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
    >
      {isLoading ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
      {isLoading ? 'Salvando...' : label}
    </button>
  )
}

export function Settings() {
  const { isDark, toggleTheme } = useTheme()
  const { user, refreshUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [showContextHelp, setShowContextHelp] = useState(readContextHelpPreference)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [savingAction, setSavingAction] = useState<SavingAction>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [reserveTargetMonths, setReserveTargetMonths] = useState(
    String(user?.reserveTargetMonths ?? 6),
  )
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isAccountConfirmOpen, setIsAccountConfirmOpen] = useState(false)
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('')
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null)
  const [dangerPassword, setDangerPassword] = useState('')
  const [isDangerSubmitting, setIsDangerSubmitting] = useState(false)
  const displayName = useMemo(() => user?.name?.trim() || 'Usuário', [user?.name])
  const displayEmail = user?.email ?? 'Sem email carregado'
  const activeDangerCopy = dangerAction ? dangerCopy[dangerAction] : null

  useEffect(() => {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
    setReserveTargetMonths(String(user?.reserveTargetMonths ?? 6))
  }, [user?.email, user?.name, user?.reserveTargetMonths])

  const handleContextHelpChange = () => {
    setShowContextHelp((current) => {
      const next = !current
      localStorage.setItem(HELP_PREF_KEY, next ? 'on' : 'off')
      return next
    })
  }

  const getAccountChanges = () => {
    const trimmedName = name.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const currentName = user?.name?.trim() ?? ''
    const currentEmail = user?.email?.trim().toLowerCase() ?? ''
    const profileChanged = trimmedName !== currentName || normalizedEmail !== currentEmail
    const passwordChanged = newPassword.length > 0 || confirmNewPassword.length > 0

    return {
      currentEmail,
      currentName,
      normalizedEmail,
      passwordChanged,
      profileChanged,
      trimmedName,
    }
  }

  const handleAccountSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { normalizedEmail, passwordChanged, profileChanged, trimmedName } = getAccountChanges()

    if (!trimmedName) {
      toast.error('Informe um nome válido.')
      return
    }

    if (!normalizedEmail) {
      toast.error('Informe um email válido.')
      return
    }

    if (passwordChanged && newPassword.length < 6) {
      toast.error('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (passwordChanged && newPassword !== confirmNewPassword) {
      toast.error('A confirmação da nova senha não confere.')
      return
    }

    if (!profileChanged && !passwordChanged) {
      toast('Nenhuma alteração para salvar.')
      return
    }

    setAccountConfirmPassword('')
    setIsAccountConfirmOpen(true)
  }

  const closeAccountConfirmModal = () => {
    if (savingAction === 'account') {
      return
    }

    setIsAccountConfirmOpen(false)
    setAccountConfirmPassword('')
  }

  const handleAccountConfirm = async () => {
    if (!accountConfirmPassword) {
      toast.error('Digite sua senha para confirmar.')
      return
    }

    const {
      currentEmail,
      currentName,
      normalizedEmail,
      passwordChanged,
      profileChanged,
      trimmedName,
    } = getAccountChanges()

    setSavingAction('account')
    try {
      if (profileChanged) {
        await updateUserProfile({
          ...(trimmedName !== currentName ? { name: trimmedName } : {}),
          ...(normalizedEmail !== currentEmail ? { email: normalizedEmail } : {}),
          currentPassword: accountConfirmPassword,
        })
      }

      if (passwordChanged) {
        await updateUserPassword({
          currentPassword: accountConfirmPassword,
          newPassword,
        })
      }

      await refreshUser()
      setIsAccountConfirmOpen(false)
      setAccountConfirmPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      toast.success('Configurações salvas.')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Erro ao salvar as configurações.'))
    } finally {
      setSavingAction(null)
    }
  }

  const handlePreferencesSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedReserveTargetMonths = Number(reserveTargetMonths)

    if (
      !Number.isInteger(parsedReserveTargetMonths) ||
      parsedReserveTargetMonths < 1 ||
      parsedReserveTargetMonths > 36
    ) {
      toast.error('Informe uma meta de reserva entre 1 e 36 meses.')
      return
    }

    if (parsedReserveTargetMonths === (user?.reserveTargetMonths ?? 6)) {
      toast('Nenhuma preferência para salvar.')
      return
    }

    setSavingAction('preferences')
    try {
      await updateUserPreferences({
        reserveTargetMonths: parsedReserveTargetMonths,
      })
      await refreshUser()
      toast.success('Preferências salvas.')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Erro ao salvar as preferências.'))
    } finally {
      setSavingAction(null)
    }
  }

  const closeDangerModal = () => {
    if (isDangerSubmitting) {
      return
    }

    setDangerAction(null)
    setDangerPassword('')
  }

  const handleDangerConfirm = async () => {
    if (!dangerAction) {
      return
    }

    if (!dangerPassword) {
      toast.error('Digite sua senha para confirmar.')
      return
    }

    setIsDangerSubmitting(true)
    try {
      if (dangerAction === 'clear') {
        const response = await clearUserData({ password: dangerPassword })
        setDangerAction(null)
        setDangerPassword('')
        toast.success(response.data.message)
        navigate('/dashboard')
        return
      }

      const response = await deleteMyAccount({ password: dangerPassword })
      setDangerAction(null)
      setDangerPassword('')
      toast.success(response.data.message)
      signOut()
      navigate('/login')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Erro ao confirmar a ação.'))
    } finally {
      setIsDangerSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Preferências
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-normal">Configurações</h1>
          </div>
          <button
            type="button"
            aria-label="Ajuda"
            title="Ajuda"
            onClick={() => setIsHelpOpen(true)}
            className="app-icon-control inline-flex h-11 w-11 items-center justify-center rounded-xl"
          >
            <CircleHelp size={20} />
          </button>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="space-y-5">
            <SettingsCard
              title="Planejamento"
              description="Meta pessoal usada para medir reserva, fôlego de caixa e relatórios."
              icon={PiggyBank}
            >
              <form onSubmit={handlePreferencesSubmit} className="space-y-4">
                <div
                  className="rounded-xl border p-4"
                  style={{
                    borderColor: 'var(--color-border-soft)',
                    backgroundColor: 'var(--color-bg-input)',
                  }}
                >
                  <FieldGroup label="Reserva mínima">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        value={reserveTargetMonths}
                        onChange={(event) => setReserveTargetMonths(event.target.value)}
                        type="number"
                        min={1}
                        max={36}
                        step={1}
                        inputMode="numeric"
                        className="app-control sm:max-w-40"
                      />
                      <span
                        className="text-sm"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        meses de despesas cobertos pelo saldo disponível.
                      </span>
                    </div>
                  </FieldGroup>
                  <p className="mt-3 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                    O Reports usa essa meta para calcular valor-alvo, falta para reserva e tempo estimado até a meta.
                  </p>
                </div>
                <div className="flex justify-end">
                  <SaveButton
                    label="Salvar preferências"
                    isLoading={savingAction === 'preferences'}
                  />
                </div>
              </form>
            </SettingsCard>

            <SettingsCard
              title="Conta"
              description="Identidade, acesso e dados vinculados ao usuário autenticado."
              icon={UserRound}
            >
              <div
                className="rounded-xl border p-4"
                style={{
                  borderColor: 'var(--color-border-soft)',
                  backgroundColor: 'var(--color-bg-input)',
                }}
              >
                <p className="text-sm font-semibold">{displayName}</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {displayEmail}
                </p>
              </div>

              <form onSubmit={handleAccountSubmit} className="border-t pt-4" style={{ borderColor: 'var(--color-border-soft)' }}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <FieldGroup label="Nome">
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      type="text"
                      className="app-control w-full"
                      placeholder="Seu nome"
                    />
                  </FieldGroup>
                  <FieldGroup label="Email">
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      className="app-control w-full"
                      placeholder="seu@email.com"
                    />
                  </FieldGroup>
                  <FieldGroup label="Nova senha">
                    <input
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      type="password"
                      className="app-control w-full"
                      placeholder="Opcional"
                      autoComplete="new-password"
                    />
                  </FieldGroup>
                  <FieldGroup label="Confirmar nova senha">
                    <input
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      type="password"
                      className="app-control w-full"
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                    />
                  </FieldGroup>
                </div>
                <div className="mt-4 flex justify-end">
                  <SaveButton label="Salvar alterações" isLoading={savingAction === 'account'} />
                </div>
              </form>
            </SettingsCard>

            <SettingsCard
              title="Dados da conta"
              description="Ações irreversíveis protegidas por confirmação de senha."
              icon={Trash2}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDangerAction('clear')}
                  className="flex min-h-28 flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:opacity-90"
                  style={{
                    borderColor: 'var(--color-border-soft)',
                    backgroundColor: 'var(--color-bg-input)',
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <Eraser size={18} />
                    LIMPAR TODOS OS MEUS DADOS
                  </span>
                  <span className="mt-3 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                    Mantém o usuário e recria a base inicial da conta.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDangerAction('delete')}
                  className="flex min-h-28 flex-col items-start justify-between rounded-xl border p-4 text-left transition hover:opacity-90"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.45)',
                    backgroundColor: 'var(--color-bg-input)',
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-red-600">
                    <Trash2 size={18} />
                    EXCLUIR TODOS OS MEUS DADOS
                  </span>
                  <span className="mt-3 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                    Remove os dados e também exclui o usuário do banco.
                  </span>
                </button>
              </div>
            </SettingsCard>
          </div>

          <div className="space-y-5">
            <SettingsCard
              title="Aparência"
              description="Preferências locais salvas neste navegador."
              icon={isDark ? Moon : Sun}
            >
              <ToggleRow
                label="Tema escuro"
                description={isDark ? 'Ativo neste navegador.' : 'Inativo neste navegador.'}
                checked={isDark}
                onChange={toggleTheme}
              />
              <ToggleRow
                label="Ajuda contextual"
                description={showContextHelp ? 'Botões de ajuda ficam disponíveis.' : 'Botões de ajuda ficam discretos.'}
                checked={showContextHelp}
                onChange={handleContextHelpChange}
              />
            </SettingsCard>

            <SettingsCard
              title="Módulos"
              description="Estado funcional dos fluxos principais do produto."
              icon={SlidersHorizontal}
            >
              <StatusRow
                icon={FileUp}
                label="Importação"
                description="Lotes, revisão, conciliação, sugestões e apply de transações/transferências."
                badge="Ativo"
                tone="green"
                to="/statement-imports"
              />
              <StatusRow
                icon={Tag}
                label="Categorias"
                description="Natureza de categoria validada por entrada, saída ou ambos."
                badge="Ativo"
                tone="green"
                to="/categories"
              />
              <StatusRow
                icon={WalletCards}
                label="Ajuste de saldo"
                description="Disponível no ledger; apply por import ainda não liberado."
                badge="Parcial"
                tone="yellow"
                to="/accounts"
              />
              <StatusRow
                icon={Database}
                label="XLSX"
                description="Bloqueado até existir fixture real e decisão de dependência."
                badge="Aguardando"
                tone="gray"
              />
              <StatusRow
                icon={Bell}
                label="Lembretes"
                description="CRUD com conta e categoria opcionais."
                badge="Ativo"
                tone="blue"
                to="/reminders"
              />
            </SettingsCard>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isAccountConfirmOpen}
        title="Confirmar alterações"
        message="Digite sua senha atual para salvar as alterações da conta."
        confirmLabel={savingAction === 'account' ? 'Salvando...' : 'Salvar'}
        confirmButtonClassName="bg-blue-600 hover:bg-blue-700"
        confirmDisabled={savingAction === 'account' || !accountConfirmPassword}
        confirmDisabledReason="Digite sua senha para confirmar."
        onCancel={closeAccountConfirmModal}
        onConfirm={handleAccountConfirm}
        maxWidthClassName="max-w-md"
      >
        <FieldGroup label="Senha atual">
          <input
            value={accountConfirmPassword}
            onChange={(event) => setAccountConfirmPassword(event.target.value)}
            type="password"
            className="app-control w-full"
            placeholder="Digite sua senha"
            autoComplete="current-password"
            autoFocus
          />
        </FieldGroup>
      </ConfirmModal>

      {activeDangerCopy && (
        <ConfirmModal
          isOpen
          title={activeDangerCopy.title}
          message={activeDangerCopy.message}
          confirmLabel={isDangerSubmitting ? 'Confirmando...' : activeDangerCopy.confirmLabel}
          confirmButtonClassName={activeDangerCopy.buttonClassName}
          confirmDisabled={isDangerSubmitting || !dangerPassword}
          confirmDisabledReason="Digite sua senha para confirmar."
          onCancel={closeDangerModal}
          onConfirm={handleDangerConfirm}
          maxWidthClassName="max-w-xl"
        >
          <div
            className="mb-4 rounded-xl border p-4"
            style={{
              borderColor: dangerAction === 'delete' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(217, 119, 6, 0.45)',
              backgroundColor: 'var(--color-bg-input)',
            }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle
                size={18}
                className={dangerAction === 'delete' ? 'text-red-600' : 'text-amber-700'}
              />
              <span>VOCÊ DESEJA MESMO ISSO?</span>
            </div>
            <ul className="space-y-2 text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
              {activeDangerCopy.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </div>
          <FieldGroup label="Senha atual">
            <input
              value={dangerPassword}
              onChange={(event) => setDangerPassword(event.target.value)}
              type="password"
              className="app-control w-full"
              placeholder="Digite sua senha"
              autoFocus
            />
          </FieldGroup>
        </ConfirmModal>
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end bg-black/50 p-3 sm:items-center sm:justify-center">
          <section
            className="glass-heavy w-full rounded-2xl p-5 shadow-xl sm:max-w-lg"
            style={{
              backgroundColor: 'var(--color-bg-modal)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Ajuda do Money Organizer</h2>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
                  Espaco reservado para o tutorial guiado e ajuda por tela.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar ajuda"
                title="Fechar ajuda"
                onClick={() => setIsHelpOpen(false)}
                className="app-icon-control flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
          </section>
        </div>
      )}
    </Layout>
  )
}
