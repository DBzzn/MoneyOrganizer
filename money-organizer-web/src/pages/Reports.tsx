import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { getMonthlyBalance, getEvolution, getProjection } from '../api/transactions'
import { formatCurrency, formatMonth } from '../utils'
import type { MonthlyBalance, EvolutionEntry, ProjectionEntry } from '../types'
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar,
    Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Clock } from 'lucide-react'


export function Reports() {

    const currentMonth = new Date().toISOString().slice(0, 7)
    const sixMonthsAgo = (() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 5)
        return d.toISOString().slice(0, 7)
    })()

    const sixMonthsAhead = (() => {
        const d = new Date()
        d.setMonth(d.getMonth() + 5)
        return d.toISOString().slice(0, 7)
    })()

    const [isLoading, setIsLoading] = useState(true)
    const [balance, setBalance] = useState<MonthlyBalance | null>(null)
    const [evolution, setEvolution] = useState<EvolutionEntry[]>([])
    const [projection, setProjection] = useState<ProjectionEntry[]>([])

    const [balanceMonth, setBalanceMonth] = useState(currentMonth)
    const [evolutionStart, setEvolutionStart] = useState(sixMonthsAgo)
    const [evolutionEnd, setEvolutionEnd] = useState(sixMonthsAhead)
    const [projectionStart, setProjectionStart] = useState(currentMonth)
    const [projectionEnd, setProjectionEnd] = useState(sixMonthsAhead)

    useEffect(() => {
        setIsLoading(true)
        Promise.all([
            getMonthlyBalance({ month: balanceMonth }),
            getEvolution({ startMonth: evolutionStart, endMonth: evolutionEnd }),
            getProjection({ startMonth: projectionStart, endMonth: projectionEnd }),
        ])
            .then(([balanceRes, evolutionRes, projectionRes]) => {
                setBalance(balanceRes.data)
                setEvolution(evolutionRes.data)
                setProjection(projectionRes.data)
            })
            .finally(() => setIsLoading(false))
    }, [balanceMonth, evolutionStart, evolutionEnd, projectionStart, projectionEnd])

    const evolutionChartData = evolution.map((e) => ({
        month: formatMonth(e.month),
        Receitas: Number(e.income),
        Despesas: Number(e.expenses),
        Saldo: Number(e.balance),
    }))

    const projectionChartData = projection.map((p) => ({
        month: formatMonth(p.month),
        Confirmado: Number(p.projectedIncome) - Number(p.projectedExpenses),
        Pendente: Number(p.pendingTransactions),
        'Saldo Projetado': Number(p.projectedBalance)
    }))

    return (
        <Layout>
            <div className="space-y-8">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Relatórios</h1>
                    <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Análise detalhada das suas finanças</p>
                </div>

                {/* ─── Balanço Mensal ─── */}
                <div className="rounded-2xl p-6 space-y-4"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Balanço Mensal</h2>
                        <input
                            type="month"
                            value={balanceMonth}
                            onChange={(e) => setBalanceMonth(e.target.value)}
                            className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
                        />
                    </div>
                    {isLoading ? (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            {[
                                { label: 'Receitas', value: formatCurrency(balance?.income ?? 0), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
                                { label: 'Despesas', value: formatCurrency(balance?.expenses ?? 0), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
                                {
                                    label: 'Saldo',
                                    value: formatCurrency(balance?.balance ?? 0),
                                    icon: Wallet,
                                    color: Number(balance?.balance ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600',
                                    bg: Number(balance?.balance ?? 0) >= 0 ? 'bg-blue-50' : 'bg-red-50',
                                },
                                { label: 'Transações', value: balance?.transactionCount?.total ?? 0, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
                            ].map((card) => (
                                <div key={card.label} className="flex items-center gap-4 p-4 rounded-xl"
                                    style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                                    <div className={`${card.bg} p-3 rounded-xl`}>
                                        <card.icon size={20} className={card.color} />
                                    </div>
                                    <div>
                                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                                        <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── Evolução ─── */}
                <div className="rounded-2xl p-6 space-y-4"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Evolução por período</h2>
                        <div className="flex items-center gap-2 text-sm">
                            <input
                                type="month"
                                value={evolutionStart}
                                onChange={(e) => setEvolutionStart(e.target.value)}
                                className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
                            />
                            <span style={{ color: 'var(--color-text-muted)' }}>até</span>
                            <input
                                type="month"
                                value={evolutionEnd}
                                onChange={(e) => setEvolutionEnd(e.target.value)}
                                className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
                            />
                        </div>
                    </div>

                    {evolutionChartData.length === 0 ? (
                        <div className="flex items-center justify-center h-48">
                            <p style={{ color: 'var(--color-text-muted)' }}>Nenhum dado no período selecionado!</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={evolutionChartData}>
                                <defs>
                                    <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="sGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                                <Tooltip
                                    formatter={(value) => formatCurrency(Number(value))}
                                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text)', fontSize: '13px' }}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2} fill="url(#rGrad)" />
                                <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#dGrad)" />
                                <Area type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#sGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* ─── Projeção ─── */}
                <div className="rounded-2xl p-6 space-y-4"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Projeção futura</h2>
                        <div className="flex items-center gap-2 text-sm">
                            <input
                                type="month"
                                value={projectionStart}
                                onChange={(e) => setProjectionStart(e.target.value)}
                                className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
                            />
                            <span style={{ color: 'var(--color-text-muted)' }}>até</span>
                            <input
                                type="month"
                                value={projectionEnd}
                                onChange={(e) => setProjectionEnd(e.target.value)}
                                className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text)' }}
                            />
                        </div>
                    </div>

                    {projectionChartData.length === 0 ? (
                        <div className="flex items-center justify-center h-48">
                            <p style={{ color: 'var(--color-text-muted)' }}>Nenhum dado para o período selecionado</p>
                        </div>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={projectionChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(Number(value))}
                                        contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', color: 'var(--color-text)', fontSize: '13px' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="Confirmado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Saldo Projetado" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                                {projection.map((p) => (
                                    <div key={p.month} className="rounded-xl p-4 space-y-2"
                                        style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                                        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{formatMonth(p.month)}</p>
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            <span>Receita projetada</span>
                                            <span className="text-green-600 font-medium">{formatCurrency(p.projectedIncome)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            <span>Despesa projetada</span>
                                            <span className="text-red-500 font-medium">{formatCurrency(p.projectedExpenses)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            <span>Saldo projetado</span>
                                            <span className={`font-medium ${Number(p.projectedBalance) >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                                {formatCurrency(p.projectedBalance)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            <span>Pendentes</span>
                                            <span className="text-yellow-600 font-medium">{p.pendingTransactions} transações</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

            </div>
        </Layout>
    )

}

