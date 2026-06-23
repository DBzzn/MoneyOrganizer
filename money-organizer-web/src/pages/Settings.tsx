import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  CircleHelp,
  Database,
  FileUp,
  LockKeyhole,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Tag,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../contexts/useAuth'
import { useTheme } from '../contexts/useTheme'

const HELP_PREF_KEY = 'money-organizer.settings.context-help'

function readContextHelpPreference() {
  if (typeof window === 'undefined') {
    return true
  }

  return localStorage.getItem(HELP_PREF_KEY) !== 'off'
}

type StatusTone = 'green' | 'yellow' | 'blue' | 'gray'

const statusToneClassName: Record<StatusTone, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  gray: 'border-slate-200 bg-slate-50 text-slate-700',
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
      <div className="mt-5 space-y-3">{children}</div>
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

export function Settings() {
  const { isDark, toggleTheme } = useTheme()
  const { user } = useAuth()
  const [showContextHelp, setShowContextHelp] = useState(readContextHelpPreference)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const displayName = useMemo(() => user?.name?.trim() || 'Usuario', [user?.name])
  const displayEmail = user?.email ?? 'Sem email carregado'

  const handleContextHelpChange = () => {
    setShowContextHelp((current) => {
      const next = !current
      localStorage.setItem(HELP_PREF_KEY, next ? 'on' : 'off')
      return next
    })
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Preferencias
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-normal">Configuracoes</h1>
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

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <SettingsCard
              title="Conta"
              description="Sessao autenticada e identidade usada nas operacoes."
              icon={LockKeyhole}
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
            </SettingsCard>

            <SettingsCard
              title="Aparencia"
              description="Preferencias locais salvas neste navegador."
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
                description={showContextHelp ? 'Botoes de ajuda ficam disponiveis.' : 'Botoes de ajuda ficam discretos.'}
                checked={showContextHelp}
                onChange={handleContextHelpChange}
              />
            </SettingsCard>
          </div>

          <div className="space-y-5">
            <SettingsCard
              title="Modulos"
              description="Estado funcional dos fluxos principais do produto."
              icon={SlidersHorizontal}
            >
              <StatusRow
                icon={FileUp}
                label="Importacao"
                description="Lotes, revisao, conciliacao, sugestoes e apply de transacoes/transferencias."
                badge="Ativo"
                tone="green"
                to="/statement-imports"
              />
              <StatusRow
                icon={Tag}
                label="Categorias"
                description="Natureza de categoria validada por entrada, saida ou ambos."
                badge="Ativo"
                tone="green"
                to="/categories"
              />
              <StatusRow
                icon={WalletCards}
                label="Ajuste de saldo"
                description="Disponivel no ledger; apply por import ainda nao liberado."
                badge="Parcial"
                tone="yellow"
                to="/accounts"
              />
              <StatusRow
                icon={Database}
                label="XLSX"
                description="Bloqueado ate existir fixture real e decisao de dependencia."
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

            <SettingsCard
              title="Seguranca"
              description="Regras de operacao financeira que continuam preservadas."
              icon={ShieldCheck}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  'Saldo muda somente em apply confirmado.',
                  'Movimento aplicado exige undo antes de edicao.',
                  'Pix externo nao vira transferencia sozinho.',
                  'Dados ficam vinculados ao usuario autenticado.',
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border p-3 text-sm leading-6"
                    style={{
                      borderColor: 'var(--color-border-soft)',
                      backgroundColor: 'var(--color-bg-input)',
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </SettingsCard>
          </div>
        </div>
      </div>

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
