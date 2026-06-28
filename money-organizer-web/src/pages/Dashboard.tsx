import { Layout } from '../components/Layout'
import { useState, useEffect, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { getMonthlyBalance, getEvolution, getTransactions } from '../api/transactions'
import { getFinancialAccounts } from '../api/financialAccounts'
import { getReminders } from '../api/reminders'
import { buildAccountIdsParam, formatCurrency, formatDate, formatMonth } from '../utils'
import { ChartTooltip } from '../components/ChartTooltip'
import { AccountFilter } from '../components/AccountFilter'
import { formatStoredIconPrefix } from '../components/storedIconRegistry'
import { StoredIcon } from '../components/StoredIcon'
import type { FinancialAccount, MonthlyBalance, EvolutionEntry, Reminder, Transaction, TransactionType } from '../types'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  Landmark,
  Scale,
  Tag,
  TrendingUp,
  TrendingDown,
  Wallet,
  WalletCards,
  Receipt,
  type LucideIcon,
} from 'lucide-react'

const EXPENSE_TRANSACTION_TYPES: TransactionType[] = [
  'CREDIT_CASH',
  'CREDIT_INSTALLMENT',
  'DEBIT',
  'PIX',
  'CASH',
]

function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  return `${year}-${String(month).padStart(2, '0')}`
}

function getMonthRange(monthKey: string): { month: string; startDate: string; endDate: string } {
  const [year, month] = monthKey.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()

  return {
    month: monthKey,
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

function getMonthTransactionFilters(monthKey: string): { startDate: string; endDate: string } {
  const { startDate, endDate } = getMonthRange(monthKey)

  return { startDate, endDate }
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)

  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const nextDate = new Date(year, month - 1 + offset, 1)

  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
}

function getEvolutionRange(endMonth: string): { startMonth: string; endMonth: string } {
  return {
    startMonth: shiftMonth(endMonth, -5),
    endMonth,
  }
}

function getTransactionAmount(transaction: Transaction): number {
  return Number(transaction.amount) || 0
}

function isExpenseTransaction(transaction: Transaction): boolean {
  return EXPENSE_TRANSACTION_TYPES.includes(transaction.type)
}

function isExpenseCategoryTransaction(transaction: Transaction): boolean {
  return isExpenseTransaction(transaction) && transaction.category.kind !== 'INCOME'
}

function getAccountBalance(account: FinancialAccount): number {
  return Number(account.currentBalance) || 0
}

function getTodayInputDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')

  return `${y}-${m}-${d}`
}

function toInputDate(isoString: string): string {
  const date = new Date(isoString)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')

  return `${y}-${m}-${d}`
}

function getReminderAmount(reminder: Reminder): number {
  return Number(reminder.amount ?? 0) || 0
}

function isReminderOverdue(reminder: Reminder): boolean {
  return reminder.status === 'PENDING' && toInputDate(reminder.dueDate) < getTodayInputDate()
}

function reminderMatchesSelectedAccounts(
  reminder: Reminder,
  selectedAccountIds: string[],
  allAccountCount: number,
): boolean {
  if (!reminder.financialAccountId) {
    return true
  }

  if (selectedAccountIds.length === 0 || selectedAccountIds.length === allAccountCount) {
    return true
  }

  return selectedAccountIds.includes(reminder.financialAccountId)
}

function getDashboardDefaultAccountIds(accounts: FinancialAccount[]): string[] {
  const dashboardAccounts = accounts.filter((account) => !account.isArchived && account.includeInDashboard)

  if (dashboardAccounts.length > 0) {
    return dashboardAccounts.map((account) => account.id)
  }

  const activeAccounts = accounts.filter((account) => !account.isArchived)

  return (activeAccounts.length > 0 ? activeAccounts : accounts).map((account) => account.id)
}

function sortAccountsByCurrentBalance(accounts: FinancialAccount[]): FinancialAccount[] {
  return [...accounts].sort((a, b) => {
    const balanceDiff = getAccountBalance(b) - getAccountBalance(a)

    return balanceDiff !== 0 ? balanceDiff : a.name.localeCompare(b.name)
  })
}

function getTopTransactions(
  transactions: Transaction[],
  predicate: (transaction: Transaction) => boolean,
  limit: number,
): Transaction[] {
  return transactions
    .filter(predicate)
    .sort((a, b) => getTransactionAmount(b) - getTransactionAmount(a))
    .slice(0, limit)
}

function getDominantExpenseCategory(transactions: Transaction[]) {
  const totals = new Map<string, {
    name: string
    icon?: string
    total: number
  }>()

  transactions.filter(isExpenseCategoryTransaction).forEach((transaction) => {
    const current = totals.get(transaction.categoryId) ?? {
      name: transaction.category.name,
      icon: transaction.category.icon,
      total: 0,
    }

    current.total += getTransactionAmount(transaction)
    totals.set(transaction.categoryId, current)
  })

  return Array.from(totals.values()).sort((a, b) => b.total - a.total)[0]
}

function getExpenseCategoryChartData(transactions: Transaction[]) {
  const totals = new Map<string, {
    name: string
    icon?: string
    total: number
  }>()

  transactions.filter(isExpenseCategoryTransaction).forEach((transaction) => {
    const current = totals.get(transaction.categoryId) ?? {
      name: transaction.category.name,
      icon: transaction.category.icon,
      total: 0,
    }

    current.total += getTransactionAmount(transaction)
    totals.set(transaction.categoryId, current)
  })

  return Array.from(totals.values())
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((category) => ({
      name: `${formatStoredIconPrefix(category.icon)}${category.name}`,
      value: category.total,
    }))
}

function TransactionRanking({
  title,
  icon: Icon,
  items,
  amountPrefix,
  amountColor,
  emptyMessage,
}: {
  title: string
  icon: LucideIcon
  items: Transaction[]
  amountPrefix: '+' | '-'
  amountColor: string
  emptyMessage: string
}) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} style={{ color: amountColor }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {transaction.description ?? 'Sem descrição'}
                </p>
                <p className="mt-1 truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {formatDate(transaction.date)} · {formatStoredIconPrefix(transaction.category.icon)}{transaction.category.name}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold" style={{ color: amountColor }}>
                {amountPrefix} {formatCurrency(getTransactionAmount(transaction))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)
  const [evolution, setEvolution] = useState<EvolutionEntry[]>([])
  const [balance, setBalance] = useState<MonthlyBalance | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])

  useEffect(() => {
    getFinancialAccounts()
      .then((res) => {
        const accountIds = res.data.map((account) => account.id)
        const defaultAccountIds = getDashboardDefaultAccountIds(res.data)

        setFinancialAccounts(res.data)
        setSelectedAccountIds((currentIds) => {
          if (currentIds.length === 0) {
            return defaultAccountIds
          }

          const validIds = currentIds.filter((id) => accountIds.includes(id))

          return validIds.length > 0 ? validIds : defaultAccountIds
        })
      })
  }, [])

  const accountIdsParam = buildAccountIdsParam(selectedAccountIds, financialAccounts.length)

  useEffect(() => {
    let isActive = true
    const monthRange = getMonthRange(selectedMonth)
    const monthTransactionFilters = getMonthTransactionFilters(selectedMonth)
    const evolutionRange = getEvolutionRange(selectedMonth)
    const accountFilters = accountIdsParam ? { financialAccountIds: accountIdsParam } : {}

    Promise.all([
      getMonthlyBalance({ month: monthRange.month, ...accountFilters }),
      getEvolution({ ...evolutionRange, ...accountFilters }),
      getTransactions({ ...monthTransactionFilters, ...accountFilters }),
      getReminders({ status: 'PENDING', endDate: monthRange.endDate }),
    ])
      .then(([balanceRes, evolutionRes, transactionsRes, remindersRes]) => {
        if (!isActive) return

        setBalance(balanceRes.data)
        setEvolution(evolutionRes.data)
        setTransactions(transactionsRes.data)
        setReminders(remindersRes.data)
      })
      .finally(() => {
        if (!isActive) return

        setIsLoading(false)
        setIsRefreshing(false)
      })

    return () => {
      isActive = false
    }
  }, [accountIdsParam, selectedMonth])

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Carregando...</p>
        </div>
      </Layout>
    )
  }

  const monthlyIncome = Number(balance?.income ?? 0)
  const monthlyExpenses = Number(balance?.expenses ?? 0)
  const monthlyBalance = Number(balance?.balance ?? 0)
  const selectedAccounts = financialAccounts.filter((account) => selectedAccountIds.includes(account.id))
  const sortedSelectedAccounts = sortAccountsByCurrentBalance(selectedAccounts)
  const currentCashBalance = selectedAccounts.reduce((total, account) => total + getAccountBalance(account), 0)
  const activeAccountCount = financialAccounts.filter((account) => !account.isArchived).length
  const includedDashboardAccountCount = financialAccounts.filter(
    (account) => !account.isArchived && account.includeInDashboard,
  ).length
  const hiddenDashboardAccountCount = financialAccounts.filter(
    (account) => !account.isArchived && !account.includeInDashboard,
  ).length
  const negativeAccountCount = selectedAccounts.filter((account) => getAccountBalance(account) < 0).length
  const selectedMonthLabel = getMonthLabel(selectedMonth)
  const expenseUsagePercent = monthlyIncome > 0 ? (monthlyExpenses / monthlyIncome) * 100 : null
  const topExpenses = getTopTransactions(transactions, isExpenseCategoryTransaction, 5)
  const topIncome = getTopTransactions(transactions, (transaction) => transaction.type === 'INCOME', 3)
  const dominantExpenseCategory = getDominantExpenseCategory(transactions)
  const pendingReminders = reminders
    .filter((reminder) => reminderMatchesSelectedAccounts(reminder, selectedAccountIds, financialAccounts.length))
    .sort((a, b) => {
      const dueDateDiff = toInputDate(a.dueDate).localeCompare(toInputDate(b.dueDate))

      return dueDateDiff !== 0 ? dueDateDiff : a.title.localeCompare(b.title)
    })
  const upcomingReminders = pendingReminders.slice(0, 5)
  const overdueReminderCount = pendingReminders.filter(isReminderOverdue).length
  const expectedReminderAmount = pendingReminders.reduce((total, reminder) => total + getReminderAmount(reminder), 0)
  const expenseUsageColor =
    expenseUsagePercent === null
      ? 'var(--color-text-muted)'
      : expenseUsagePercent >= 100
        ? 'var(--color-expense)'
        : expenseUsagePercent >= 80
          ? '#f59e0b'
          : 'var(--color-income)'

  const insightItems = [
    {
      label: 'Despesas sobre receitas',
      value: expenseUsagePercent === null ? 'Sem receita' : `${expenseUsagePercent.toFixed(0)}%`,
      description: expenseUsagePercent === null
        ? monthlyExpenses > 0
          ? 'Há despesas no mês, mas nenhuma receita registrada.'
          : 'Ainda não há receitas ou despesas registradas no mês.'
        : `Suas despesas consumiram ${expenseUsagePercent.toFixed(0)}% das receitas do mês.`,
      icon: AlertTriangle,
      color: expenseUsageColor,
    },
    {
      label: 'Saldo do mês',
      value: formatCurrency(monthlyBalance),
      description: monthlyBalance >= 0
        ? 'O mês está com saldo positivo até agora.'
        : 'O mês está com saldo negativo até agora.',
      icon: monthlyBalance >= 0 ? Wallet : TrendingDown,
      color: monthlyBalance >= 0 ? 'var(--color-balance)' : 'var(--color-expense)',
    },
    {
      label: 'Categoria dominante',
      value: dominantExpenseCategory ? formatCurrency(dominantExpenseCategory.total) : 'Sem gastos',
      description: dominantExpenseCategory
        ? `${formatStoredIconPrefix(dominantExpenseCategory.icon)}${dominantExpenseCategory.name} é a maior categoria de gastos do mês.`
        : 'Nenhuma despesa registrada no mês atual.',
      icon: Tag,
      color: dominantExpenseCategory ? '#8b5cf6' : 'var(--color-text-muted)',
    },
  ]

  const cards = [
  {
    label: 'Receitas do mês',
    value: formatCurrency(monthlyIncome),
    icon: TrendingUp,
    color: 'var(--color-income)',
    bg: 'var(--color-income-bg)',
  },
  {
    label: 'Despesas do mês',
    value: formatCurrency(monthlyExpenses),
    icon: TrendingDown,
    color: 'var(--color-expense)',
    bg: 'var(--color-expense-bg)',
  },
  {
    label: 'Saldo do mês',
    value: formatCurrency(monthlyBalance),
    icon: monthlyBalance >= 0 ? Wallet : TrendingDown,
    color: monthlyBalance >= 0 ? 'var(--color-balance)' : 'var(--color-expense)',
    bg: monthlyBalance >= 0 ? 'var(--color-balance-bg)' : 'var(--color-expense-bg)',
  },
  {
    label: 'Transações',
    value: balance?.transactionCount.total ?? 0,
    icon: Receipt,
    color: 'var(--color-count)',
    bg: 'var(--color-count-bg)',
  },
]

  const cashPositionCards = [
    {
      label: 'Saldo atual',
      value: formatCurrency(currentCashBalance),
      detail: `${selectedAccounts.length} de ${financialAccounts.length} contas selecionadas`,
      icon: Wallet,
      color: currentCashBalance < 0 ? 'var(--color-expense)' : 'var(--color-balance)',
      bg: currentCashBalance < 0 ? 'var(--color-expense-bg)' : 'var(--color-balance-bg)',
    },
    {
      label: 'Contas ativas',
      value: activeAccountCount,
      detail: `${includedDashboardAccountCount} incluídas no dashboard`,
      icon: Landmark,
      color: 'var(--color-brand)',
      bg: 'var(--color-balance-bg)',
    },
    {
      label: 'Saldos negativos',
      value: negativeAccountCount,
      detail: negativeAccountCount === 0 ? 'Nenhuma conta selecionada abaixo de zero' : 'Revisar no extrato',
      icon: Scale,
      color: negativeAccountCount > 0 ? 'var(--color-expense)' : 'var(--color-income)',
      bg: negativeAccountCount > 0 ? 'var(--color-expense-bg)' : 'var(--color-income-bg)',
    },
    {
      label: 'Fora do dashboard',
      value: hiddenDashboardAccountCount,
      detail: hiddenDashboardAccountCount === 0 ? 'Todas as ativas participam' : 'Ocultas por configuração',
      icon: EyeOff,
      color: 'var(--color-text-muted)',
      bg: 'var(--color-bg-muted-card)',
    },
  ]

  const reminderSummaryCards = [
    {
      label: 'Pendentes',
      value: pendingReminders.length,
      detail: `Até o fim de ${selectedMonthLabel}`,
      icon: Bell,
      color: 'var(--color-brand)',
      bg: 'var(--color-balance-bg)',
    },
    {
      label: 'Vencidos',
      value: overdueReminderCount,
      detail: overdueReminderCount === 0 ? 'Nenhum atraso pendente' : 'Revisar vencimentos',
      icon: AlertTriangle,
      color: overdueReminderCount > 0 ? 'var(--color-expense)' : 'var(--color-income)',
      bg: overdueReminderCount > 0 ? 'var(--color-expense-bg)' : 'var(--color-income-bg)',
    },
    {
      label: 'Valor previsto',
      value: formatCurrency(expectedReminderAmount),
      detail: 'Não altera saldo automaticamente',
      icon: CalendarClock,
      color: 'var(--color-text)',
      bg: 'var(--color-bg-muted-card)',
    },
  ]

  const goToPreviousMonth = () => {
    setIsRefreshing(true)
    setSelectedMonth((currentMonth) => shiftMonth(currentMonth, -1))
  }

  const goToNextMonth = () => {
    setIsRefreshing(true)
    setSelectedMonth((currentMonth) => shiftMonth(currentMonth, 1))
  }

  const handleMonthChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value) return
    if (event.target.value === selectedMonth) return

    setIsRefreshing(true)
    setSelectedMonth(event.target.value)
  }

  const chartData = evolution.map((e) => ({
    month: formatMonth(e.month),
    Receitas: e.income,
    Despesas: e.expenses,
    Saldo: e.balance,
  }))

  const PIE_COLORS = [
    '#3b82f6', '#22c55e', '#ef4444', '#f59e0b',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  ]

  const pieData = getExpenseCategoryChartData(transactions)

  const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0)

  return (
    <Layout>
      <div className="space-y-8">

        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Dashboard</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Visão geral das suas finanças</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start">
          <div
            className="glass grid w-full grid-cols-[20%_45%_20%] items-center justify-between rounded-2xl p-2 sm:w-fit sm:grid-cols-[2.5rem_14rem_2.5rem] sm:gap-2"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <button
              type="button"
              onClick={goToPreviousMonth}
              disabled={isRefreshing}
              aria-label="Mês anterior"
              title="Mês anterior"
              className="app-icon-control flex h-10 w-full items-center justify-center rounded-xl sm:w-10"
            >
              <ChevronLeft size={18} />
            </button>

            <label htmlFor="dashboard-month" className="sr-only">
              Mês do dashboard
            </label>
            <div
              className="app-control-shell flex h-10 min-w-0 items-center gap-2 rounded-xl px-2 sm:px-3"
            >
              <Calendar size={16} className="hidden shrink-0 sm:block" style={{ color: 'var(--color-text-muted)' }} />
              <input
                id="dashboard-month"
                type="month"
                value={selectedMonth}
                onChange={handleMonthChange}
                disabled={isRefreshing}
                aria-label={`Mês selecionado: ${selectedMonthLabel}`}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none disabled:cursor-not-allowed"
                style={{ color: 'var(--color-text)' }}
              />
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              disabled={isRefreshing}
              aria-label="Próximo mês"
              title="Próximo mês"
              className="app-icon-control flex h-10 w-full items-center justify-center rounded-xl sm:w-10"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <AccountFilter
            accounts={financialAccounts}
            selectedAccountIds={selectedAccountIds}
            onChange={setSelectedAccountIds}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="glass flex items-center gap-4 rounded-2xl p-5 sm:p-6"
              style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: card.bg }}>
                <card.icon size={22} style={{ color: card.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                <p className="break-words text-lg font-bold leading-tight sm:text-xl" style={{ color: card.color }}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Posição de caixa</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Saldo atual das contas consideradas no dashboard
              </p>
            </div>
            <Link
              to="/accounts"
              className="app-icon-control inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium sm:w-auto"
            >
              <ExternalLink size={16} />
              Extratos
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cashPositionCards.map((card) => (
              <div
                key={card.label}
                className="glass flex min-h-[7rem] items-start gap-4 rounded-2xl p-5"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: card.bg }}>
                  <card.icon size={21} style={{ color: card.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                  <p className="break-words text-xl font-bold leading-tight" style={{ color: card.color }}>
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                    {card.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {sortedSelectedAccounts.length === 0 ? (
            <div
              className="glass flex min-h-[8rem] items-center justify-center rounded-2xl p-6"
              style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhuma conta cadastrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {sortedSelectedAccounts.map((account) => {
                const accountBalance = getAccountBalance(account)
                const accountColor = accountBalance < 0 ? 'var(--color-expense)' : 'var(--color-text)'

                return (
                  <Link
                    key={account.id}
                    to={`/accounts?account=${account.id}`}
                    className="glass flex min-h-[8rem] min-w-0 items-center justify-between gap-4 rounded-2xl p-5 transition hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                        style={{ backgroundColor: 'var(--color-bg)', color: account.color ?? 'var(--color-brand)' }}
                      >
                        <StoredIcon value={account.icon} fallback={WalletCards} size={21} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                            {account.name}
                          </p>
                          {account.isArchived && (
                            <span className="app-chip app-chip-muted px-2 py-0.5 text-xs">
                              Arquivada
                            </span>
                          )}
                          {!account.includeInDashboard && !account.isArchived && (
                            <span className="app-chip app-chip-muted px-2 py-0.5 text-xs">
                              Fora
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {account.institutionName || 'Sem instituição'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold leading-tight sm:text-lg" style={{ color: accountColor }}>
                        {formatCurrency(account.currentBalance)}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Extrato</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Próximos vencimentos</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Lembretes pendentes tratados fora do saldo e do fluxo mensal
              </p>
            </div>
            <Link
              to="/reminders"
              className="app-icon-control inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium sm:w-auto"
            >
              <ExternalLink size={16} />
              Lembretes
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {reminderSummaryCards.map((card) => (
              <div
                key={card.label}
                className="glass flex min-h-[7rem] items-start gap-4 rounded-2xl p-5"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: card.bg }}>
                  <card.icon size={21} style={{ color: card.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                  <p className="break-words text-xl font-bold leading-tight" style={{ color: card.color }}>
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                    {card.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="glass rounded-2xl p-5 sm:p-6"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            {upcomingReminders.length === 0 ? (
              <div className="flex min-h-[8rem] items-center justify-center">
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Nenhum lembrete pendente até o fim de {selectedMonthLabel}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingReminders.map((reminder) => {
                  const overdue = isReminderOverdue(reminder)
                  const amount = getReminderAmount(reminder)

                  return (
                    <Link
                      key={reminder.id}
                      to="/reminders"
                      className="flex min-w-0 flex-col gap-3 rounded-xl border p-4 transition hover:opacity-90 sm:flex-row sm:items-center sm:justify-between"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="break-words text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                            {reminder.title}
                          </p>
                          {overdue && (
                            <span className="app-chip app-chip-danger px-2 py-0.5 text-xs font-medium">
                              Vencido
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDate(reminder.dueDate)}
                          {reminder.category ? ` · ${formatStoredIconPrefix(reminder.category.icon)}${reminder.category.name}` : ''}
                          {reminder.financialAccount ? ` · ${reminder.financialAccount.name}` : ' · Sem conta vinculada'}
                        </p>
                      </div>

                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-sm font-semibold" style={{ color: amount > 0 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                          {amount > 0 ? formatCurrency(amount) : 'Sem valor'}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Abrir lembretes
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <TransactionRanking
            title="Top gastos do mês"
            icon={ArrowDownRight}
            items={topExpenses}
            amountPrefix="-"
            amountColor="var(--color-expense)"
            emptyMessage="Nenhuma despesa registrada"
          />

          <TransactionRanking
            title="Top receitas do mês"
            icon={ArrowUpRight}
            items={topIncome}
            amountPrefix="+"
            amountColor="var(--color-income)"
            emptyMessage="Nenhuma receita registrada"
          />

          <div className="glass rounded-2xl p-5 sm:p-6"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
              Sinais do mês
            </h2>

            <div className="space-y-4">
              {insightItems.map((item) => (
                <div
                  key={item.label}
                  className="flex gap-3 border-b pb-4 last:border-b-0 last:pb-0"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="p-2 rounded-lg h-fit" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <item.icon size={16} style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {item.label}
                      </p>
                      <p className="text-sm font-semibold" style={{ color: item.color }}>
                        {item.value}
                      </p>
                    </div>
                    <p className="mt-1 text-sm leading-5" style={{ color: 'var(--color-text-muted)' }}>
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 sm:p-6"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-text)' }}>
            Evolução dos últimos 6 meses
          </h2>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p style={{ color: 'var(--color-text-muted)' }}>Nenhum dado disponível ainda</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <Tooltip
                  content={<ChartTooltip valueFormatter={formatCurrency} />}
                />
                <Area type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2} fill="url(#colorReceitas)" />
                <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#colorDespesas)" />
                <Area type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#colorSaldo)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-2xl p-5 sm:p-6"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-text)' }}>
            Gastos por categoria
          </h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p style={{ color: 'var(--color-text-muted)' }}>Nenhum dado disponível ainda</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={<ChartTooltip valueFormatter={formatCurrency} showPercentage total={pieTotal} />}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>
    </Layout>
  )
}
