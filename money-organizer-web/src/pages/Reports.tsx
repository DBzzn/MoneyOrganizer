import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { getMonthlyBalance, getEvolution, getProjection, getTotalsByCategory } from '../api/transactions'
import { getFinancialAccounts } from '../api/financialAccounts'
import { buildAccountIdsParam, formatCurrency, formatMonth } from '../utils'
import { ChartTooltip } from '../components/ChartTooltip'
import { AccountFilter } from '../components/AccountFilter'
import type { FinancialAccount, MonthlyBalance, EvolutionEntry, ProjectionEntry, CategoryTotal, TransactionType } from '../types'
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
import { TrendingUp, TrendingDown, Wallet, Clock, PiggyBank, Landmark } from 'lucide-react'

const EXPENSE_TYPES: TransactionType[] = ['CREDIT_CASH', 'CREDIT_INSTALLMENT', 'DEBIT', 'PIX', 'CASH']

function getFutureMonth(monthsAhead: number): string {
    const date = new Date()
    date.setMonth(date.getMonth() + monthsAhead)
    return date.toISOString().slice(0, 7)
}

function monthToRange(startMonth: string, endMonth: string): { startDate: string; endDate: string } {
    const [endYear, endMonthNumber] = endMonth.split('-').map(Number)
    const lastDay = new Date(endYear, endMonthNumber, 0).getDate()

    return {
        startDate: `${startMonth}-01`,
        endDate: `${endMonth}-${String(lastDay).padStart(2, '0')}`,
    }
}

function isValidMonth(month: string): boolean {
    if (!/^\d{4}-\d{2}$/.test(month)) {
        return false
    }

    const [year, monthNumber] = month.split('-').map(Number)
    return year > 1950 && monthNumber >= 1 && monthNumber <= 12
}

function isSameOrBefore(startMonth: string, endMonth: string): boolean {
    return startMonth <= endMonth
}

function mergeCategoryTotals(groups: CategoryTotal[][]): CategoryTotal[] {
    const totals = new Map<string, CategoryTotal>()

    groups.flat().forEach((item) => {
        const current = totals.get(item.categoryId)
        const nextAmount = Number(current?.totalAmount ?? 0) + Number(item.totalAmount)
        const nextCount = (current?.transactionCount ?? 0) + item.transactionCount

        totals.set(item.categoryId, {
            ...item,
            totalAmount: nextAmount.toFixed(2),
            transactionCount: nextCount,
        })
    })

    return Array.from(totals.values()).sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount))
}

export function Reports() {

    const currentMonth = new Date().toISOString().slice(0, 7)
    const sixMonthsAgo = (() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 5)
        return d.toISOString().slice(0, 7)
    })()

    const threeMonthsAhead = getFutureMonth(3)

    const [isLoading, setIsLoading] = useState(true)
    const [balance, setBalance] = useState<MonthlyBalance | null>(null)
    const [evolution, setEvolution] = useState<EvolutionEntry[]>([])
    const [projection, setProjection] = useState<ProjectionEntry[]>([])
    const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([])
    const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])

    const [balanceMonth, setBalanceMonth] = useState(currentMonth)
    const [evolutionStart, setEvolutionStart] = useState(sixMonthsAgo)
    const [evolutionEnd, setEvolutionEnd] = useState(currentMonth)
    const [projectionStart, setProjectionStart] = useState(currentMonth)
    const [projectionEnd, setProjectionEnd] = useState(threeMonthsAhead)
    const [balanceMonthDraft, setBalanceMonthDraft] = useState(currentMonth)
    const [evolutionStartDraft, setEvolutionStartDraft] = useState(sixMonthsAgo)
    const [evolutionEndDraft, setEvolutionEndDraft] = useState(currentMonth)
    const [projectionStartDraft, setProjectionStartDraft] = useState(currentMonth)
    const [projectionEndDraft, setProjectionEndDraft] = useState(threeMonthsAhead)
    const accountIdsParam = buildAccountIdsParam(selectedAccountIds, financialAccounts.length)

    useEffect(() => {
        getFinancialAccounts()
            .then((res) => {
                const accountIds = res.data.map((account) => account.id)

                setFinancialAccounts(res.data)
                setSelectedAccountIds((currentIds) => {
                    if (currentIds.length === 0) {
                        return accountIds
                    }

                    const validIds = currentIds.filter((id) => accountIds.includes(id))

                    return validIds.length > 0 ? validIds : accountIds
                })
            })
    }, [])

    const applyBalanceMonth = () => {
        if (isValidMonth(balanceMonthDraft)) {
            setBalanceMonth(balanceMonthDraft)
            return
        }

        setBalanceMonthDraft(balanceMonth)
    }

    const applyEvolutionRange = () => {
        if (
            isValidMonth(evolutionStartDraft) &&
            isValidMonth(evolutionEndDraft) &&
            isSameOrBefore(evolutionStartDraft, evolutionEndDraft)
        ) {
            setEvolutionStart(evolutionStartDraft)
            setEvolutionEnd(evolutionEndDraft)
            return
        }

        setEvolutionStartDraft(evolutionStart)
        setEvolutionEndDraft(evolutionEnd)
    }

    const applyProjectionRange = () => {
        if (
            isValidMonth(projectionStartDraft) &&
            isValidMonth(projectionEndDraft) &&
            isSameOrBefore(projectionStartDraft, projectionEndDraft)
        ) {
            setProjectionStart(projectionStartDraft)
            setProjectionEnd(projectionEndDraft)
            return
        }

        setProjectionStartDraft(projectionStart)
        setProjectionEndDraft(projectionEnd)
    }

    useEffect(() => {
        const categoryRange = monthToRange(evolutionStart, evolutionEnd)
        const accountFilters = accountIdsParam ? { financialAccountIds: accountIdsParam } : {}

        Promise.all([
            getMonthlyBalance({ month: balanceMonth, ...accountFilters }),
            getEvolution({ startMonth: evolutionStart, endMonth: evolutionEnd, ...accountFilters }),
            getProjection({ startMonth: projectionStart, endMonth: projectionEnd, ...accountFilters }),
            Promise.all(EXPENSE_TYPES.map((type) => getTotalsByCategory({ ...categoryRange, type, ...accountFilters }))),
        ])
            .then(([balanceRes, evolutionRes, projectionRes, categoryResponses]) => {
                setBalance(balanceRes.data)
                setEvolution(evolutionRes.data)
                setProjection(projectionRes.data)
                setCategoryTotals(mergeCategoryTotals(categoryResponses.map((res) => res.data)))
            })
            .finally(() => setIsLoading(false))

        return () => { setIsLoading(true) }
    }, [accountIdsParam, balanceMonth, evolutionStart, evolutionEnd, projectionStart, projectionEnd])

    const evolutionChartData = evolution.reduce<Array<{
        month: string
        Receitas: number
        Despesas: number
        Saldo: number
        Acumulado: number
    }>>((items, e) => {
        const balanceValue = Number(e.balance)
        const previousBalance = items.at(-1)?.Acumulado ?? 0

        return [...items, {
            month: formatMonth(e.month),
            Receitas: Number(e.income),
            Despesas: Number(e.expenses),
            Saldo: balanceValue,
            Acumulado: previousBalance + balanceValue,
        }]
    }, [])

    const periodIncome = evolution.reduce((sum, item) => sum + Number(item.income), 0)
    const periodExpenses = evolution.reduce((sum, item) => sum + Number(item.expenses), 0)
    const periodBalance = periodIncome - periodExpenses
    const averageExpenses = evolution.length > 0 ? periodExpenses / evolution.length : 0
    const savingsRate = periodIncome > 0 ? (periodBalance / periodIncome) * 100 : 0
    const bestMonth = evolution.reduce<EvolutionEntry | null>(
        (best, item) => (!best || Number(item.balance) > Number(best.balance) ? item : best),
        null,
    )
    const worstMonth = evolution.reduce<EvolutionEntry | null>(
        (worst, item) => (!worst || Number(item.balance) < Number(worst.balance) ? item : worst),
        null,
    )
    const categoryTotalAmount = categoryTotals.reduce((sum, item) => sum + Number(item.totalAmount), 0)

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

                <AccountFilter
                    accounts={financialAccounts}
                    selectedAccountIds={selectedAccountIds}
                    onChange={setSelectedAccountIds}
                    title="Contas do relatório"
                />

                {/* ─── Balanço Mensal ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                        {
                            label: 'Saldo do periodo',
                            value: formatCurrency(periodBalance),
                            icon: Wallet,
                            color: periodBalance >= 0 ? 'text-blue-600' : 'text-red-600',
                            bg: periodBalance >= 0 ? 'bg-blue-50' : 'bg-red-50',
                        },
                        {
                            label: 'Media mensal de gastos',
                            value: formatCurrency(averageExpenses),
                            icon: TrendingDown,
                            color: 'text-red-600',
                            bg: 'bg-red-50',
                        },
                        {
                            label: 'Taxa de poupanca',
                            value: `${savingsRate.toFixed(1)}%`,
                            icon: PiggyBank,
                            color: savingsRate >= 0 ? 'text-green-600' : 'text-red-600',
                            bg: savingsRate >= 0 ? 'bg-green-50' : 'bg-red-50',
                        },
                        {
                            label: 'Maior categoria',
                            value: categoryTotals[0]?.categoryName ?? 'Sem dados',
                            icon: Landmark,
                            color: 'text-purple-600',
                            bg: 'bg-purple-50',
                        },
                    ].map((card) => (
                        <div
                            key={card.label}
                            className="glass flex items-center gap-4 rounded-2xl p-5"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <div className={`${card.bg} shrink-0 p-3 rounded-xl`}>
                                <card.icon size={20} className={card.color} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                                <p className={`break-words text-lg font-bold leading-tight ${card.color}`}>{card.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="glass rounded-2xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Melhor mes do periodo</p>
                        <p className="text-xl font-bold mt-1" style={{ color: 'var(--color-income)' }}>
                            {bestMonth ? `${formatMonth(bestMonth.month)} - ${formatCurrency(Number(bestMonth.balance))}` : 'Sem dados'}
                        </p>
                    </div>
                    <div className="glass rounded-2xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Mes de maior aperto</p>
                        <p className="text-xl font-bold mt-1" style={{ color: 'var(--color-expense)' }}>
                            {worstMonth ? `${formatMonth(worstMonth.month)} - ${formatCurrency(Number(worstMonth.balance))}` : 'Sem dados'}
                        </p>
                    </div>
                </div>

                <div className="glass rounded-2xl p-5 space-y-4 sm:p-6"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Maiores gastos por categoria</h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            Ranking baseado no periodo de evolucao selecionado.
                        </p>
                    </div>

                    {categoryTotals.length === 0 ? (
                        <div className="flex items-center justify-center h-32">
                            <p style={{ color: 'var(--color-text-muted)' }}>Nenhum gasto encontrado no periodo</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {categoryTotals.slice(0, 6).map((category) => {
                                const amount = Number(category.totalAmount)
                                const percentage = categoryTotalAmount > 0 ? (amount / categoryTotalAmount) * 100 : 0

                                return (
                                    <div key={category.categoryId} className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                                                    {category.categoryIcon} {category.categoryName}
                                                </p>
                                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {category.transactionCount} transacoes - {percentage.toFixed(1)}% dos gastos listados
                                                </p>
                                            </div>
                                            <span className="text-sm font-semibold text-red-500 whitespace-nowrap">
                                                {formatCurrency(amount)}
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
                                            <div
                                                className="h-full rounded-full bg-red-500"
                                                style={{ width: `${Math.min(percentage, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="glass rounded-2xl p-5 space-y-4 sm:p-6"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Balanço Mensal</h2>
                        <input
                            type="month"
                            value={balanceMonthDraft}
                            onChange={(e) => setBalanceMonthDraft(e.target.value)}
                            onBlur={applyBalanceMonth}
                            className="app-control app-control-responsive-compact text-sm"
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
                                    <div className={`${card.bg} shrink-0 p-3 rounded-xl`}>
                                        <card.icon size={20} className={card.color} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                                        <p className={`break-words text-lg font-bold leading-tight ${card.color}`}>{card.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── Evolução ─── */}
                <div className="glass rounded-2xl p-5 space-y-4 sm:p-6"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Evolução por período</h2>
                        <div className="flex w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center">
                            <input
                                type="month"
                                value={evolutionStartDraft}
                                onChange={(e) => setEvolutionStartDraft(e.target.value)}
                                onBlur={applyEvolutionRange}
                                className="app-control app-control-responsive-compact"
                            />
                            <span className="text-center sm:text-left" style={{ color: 'var(--color-text-muted)' }}>até</span>
                            <input
                                type="month"
                                value={evolutionEndDraft}
                                onChange={(e) => setEvolutionEndDraft(e.target.value)}
                                onBlur={applyEvolutionRange}
                                className="app-control app-control-responsive-compact"
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
                                    <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                                <Tooltip
                                    content={<ChartTooltip valueFormatter={formatCurrency} />}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2} fill="url(#rGrad)" />
                                <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#dGrad)" />
                                <Area type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#sGrad)" />
                                <Area type="monotone" dataKey="Acumulado" stroke="#8b5cf6" strokeWidth={2} fill="url(#aGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* ─── Projeção ─── */}
                <div className="glass rounded-2xl p-5 space-y-4 sm:p-6"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Projeção futura</h2>
                        <div className="flex w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:items-center">
                            <input
                                type="month"
                                value={projectionStartDraft}
                                onChange={(e) => setProjectionStartDraft(e.target.value)}
                                onBlur={applyProjectionRange}
                                className="app-control app-control-responsive-compact"
                            />
                            <span className="text-center sm:text-left" style={{ color: 'var(--color-text-muted)' }}>até</span>
                            <input
                                type="month"
                                value={projectionEndDraft}
                                onChange={(e) => setProjectionEndDraft(e.target.value)}
                                onBlur={applyProjectionRange}
                                className="app-control app-control-responsive-compact"
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
                                        content={<ChartTooltip valueFormatter={formatCurrency} />}
                                    />
                                    <Legend />
                                    <Bar dataKey="Confirmado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Saldo Projetado" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                                {projection.map((p) => (
                                    <div key={p.month} className="glass rounded-xl p-4 space-y-2"
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

