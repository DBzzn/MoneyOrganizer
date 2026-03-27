import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { getMonthlyBalance, getEvolution, getTotalsByCategory } from '../api/transactions'
import { formatCurrency, formatMonth } from '../utils'
import type { MonthlyBalance, EvolutionEntry, CategoryTotal } from '../types'
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
import { TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react'

export function Dashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryTotal[]>([])
  const [evolution, setEvolution] = useState<EvolutionEntry[]>([])
  const [balance, setBalance] = useState<MonthlyBalance | null>(null)

  useEffect(() => {
    Promise.all([getMonthlyBalance(), getEvolution(), getTotalsByCategory()])
      .then(([balanceRes, evolutionRes, categoriesRes]) => {
        setBalance(balanceRes.data)
        setEvolution(evolutionRes.data)
        setCategories(categoriesRes.data)
      })
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Carregando...</p>
        </div>
      </Layout>
    )
  }

  const cards = [
  {
    label: 'Receitas do mês',
    value: formatCurrency(balance?.income ?? 0),
    icon: TrendingUp,
    color: 'var(--color-income)',
    bg: 'var(--color-income-bg)',
  },
  {
    label: 'Despesas do mês',
    value: formatCurrency(balance?.expenses ?? 0),
    icon: TrendingDown,
    color: 'var(--color-expense)',
    bg: 'var(--color-expense-bg)',
  },
  {
    label: 'Saldo do mês',
    value: formatCurrency(balance?.balance ?? 0),
    icon: Wallet,
    color: (balance?.balance ?? 0) >= 0 ? 'var(--color-balance)' : 'var(--color-expense)',
    bg: (balance?.balance ?? 0) >= 0 ? 'var(--color-balance-bg)' : 'var(--color-expense-bg)',
  },
  {
    label: 'Transações',
    value: balance?.transactionCount.total ?? 0,
    icon: Receipt,
    color: 'var(--color-count)',
    bg: 'var(--color-count-bg)',
  },
]

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

  const pieData = categories
    .filter((c) => parseFloat(String(c.totalAmount)) > 0)
    .map((c) => ({
      name: `${c.categoryIcon ?? ''} ${c.categoryName}`,
      value: parseFloat(String(c.totalAmount)),
    }))


  return (
    <Layout>
      <div className="space-y-8">

        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Dashboard</h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Visão geral das suas finanças</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl p-6 flex items-center gap-4"
              style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <div className="p-3 rounded-xl" style={{ backgroundColor: card.bg }}>
                <card.icon size={22} className={card.color} />
              </div>
              <div>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                <p className="text-xl font-bold" style={{ color: card.color }}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6"
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
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text)',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                />
                <Area type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2} fill="url(#colorReceitas)" />
                <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#colorDespesas)" />
                <Area type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#colorSaldo)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl p-6"
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
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text)',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
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