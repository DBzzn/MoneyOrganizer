import { Layout } from '../components/Layout'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { getMonthlyBalance, getEvolution, getProjection, getTotalsByCategory } from '../api/transactions'
import { getFinancialAccounts } from '../api/financialAccounts'
import { buildAccountIdsParam, formatCurrency, formatMonth } from '../utils'
import {
    calculateFinancialHealthScore,
    calculateReserveMetrics,
    getFinancialHealth,
    type FinancialHealthTone,
} from '../utils/reportMetrics'
import { ChartTooltip } from '../components/ChartTooltip'
import { AccountFilter } from '../components/AccountFilter'
import { formatStoredIconPrefix } from '../components/storedIconRegistry'
import { StoredIcon } from '../components/StoredIcon'
import { useAuth } from '../contexts/useAuth'
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
import {
    Clock,
    Download,
    ExternalLink,
    EyeOff,
    FileText,
    Gauge,
    Landmark,
    Lightbulb,
    PiggyBank,
    Scale,
    Table,
    Target,
    TrendingDown,
    TrendingUp,
    Wallet,
    WalletCards,
    X,
} from 'lucide-react'

const EXPENSE_TYPES: TransactionType[] = ['CREDIT_CASH', 'CREDIT_INSTALLMENT', 'DEBIT', 'PIX', 'CASH']
type ReportDepth = 'basic' | 'intermediate' | 'complete'
type ExportFormat = 'html' | 'pdf' | 'csv' | 'xlsx'
type InsightTone = FinancialHealthTone
type ActionPriority = 'Alta' | 'Média' | 'Baixa'

type ReportActionItem = {
    title: string
    body: string
    priority: ActionPriority
}

const reportDepthOptions: Array<{
    value: ReportDepth
    label: string
    description: string
}> = [
    {
        value: 'basic',
        label: 'Básico',
        description: 'Resumo para decisão rápida',
    },
    {
        value: 'intermediate',
        label: 'Intermediário',
        description: 'Tendências e projeções',
    },
    {
        value: 'complete',
        label: 'Completo',
        description: 'Todos os detalhes e exportação',
    },
]

const exportFormatOptions: Array<{
    value: ExportFormat
    label: string
    description: string
    available: boolean
}> = [
    {
        value: 'html',
        label: 'HTML',
        description: 'Arquivo visual, tematizado e compartilhável',
        available: true,
    },
    {
        value: 'pdf',
        label: 'PDF',
        description: 'Arquivo pronto no tema, com gráficos e fundo',
        available: true,
    },
    {
        value: 'csv',
        label: 'CSV',
        description: 'Dados tabulares estruturados em uma próxima etapa',
        available: false,
    },
    {
        value: 'xlsx',
        label: 'XLSX',
        description: 'Planilha futura, depois da decisão de dependência',
        available: false,
    },
]

const insightToneStyle: Record<InsightTone, { borderColor: string; backgroundColor: string; color: string }> = {
    green: {
        borderColor: 'rgba(22, 163, 74, 0.32)',
        backgroundColor: 'var(--color-income-bg)',
        color: 'var(--color-income)',
    },
    blue: {
        borderColor: 'rgba(59, 130, 246, 0.32)',
        backgroundColor: 'var(--color-balance-bg)',
        color: 'var(--color-balance)',
    },
    yellow: {
        borderColor: 'rgba(217, 119, 6, 0.32)',
        backgroundColor: 'rgba(217, 119, 6, 0.12)',
        color: '#d97706',
    },
    red: {
        borderColor: 'rgba(220, 38, 38, 0.32)',
        backgroundColor: 'var(--color-expense-bg)',
        color: 'var(--color-expense)',
    },
}

const actionPriorityStyle: Record<ActionPriority, { borderColor: string; backgroundColor: string; color: string }> = {
    Alta: {
        borderColor: 'rgba(220, 38, 38, 0.32)',
        backgroundColor: 'var(--color-expense-bg)',
        color: 'var(--color-expense)',
    },
    Média: {
        borderColor: 'rgba(217, 119, 6, 0.32)',
        backgroundColor: 'rgba(217, 119, 6, 0.12)',
        color: '#d97706',
    },
    Baixa: {
        borderColor: 'rgba(59, 130, 246, 0.32)',
        backgroundColor: 'var(--color-balance-bg)',
        color: 'var(--color-balance)',
    },
}

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

function getAccountBalance(account: FinancialAccount): number {
    return Number(account.currentBalance) || 0
}

function sortAccountsByCurrentBalance(accounts: FinancialAccount[]): FinancialAccount[] {
    return [...accounts].sort((a, b) => {
        const balanceDiff = getAccountBalance(b) - getAccountBalance(a)

        return balanceDiff !== 0 ? balanceDiff : a.name.localeCompare(b.name)
    })
}

function canShowAsExpenseCategory(item: CategoryTotal): boolean {
    return item.categoryKind !== 'INCOME'
}

function mergeCategoryTotals(groups: CategoryTotal[][]): CategoryTotal[] {
    const totals = new Map<string, CategoryTotal>()

    groups.flat().filter(canShowAsExpenseCategory).forEach((item) => {
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

function calculatePercentageChange(previousValue: number, currentValue: number): number | null {
    if (previousValue === 0) {
        return currentValue === 0 ? 0 : null
    }

    return ((currentValue - previousValue) / Math.abs(previousValue)) * 100
}

function formatPercentage(value: number | null): string {
    if (value === null || Number.isNaN(value)) {
        return 'Sem base'
    }

    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function getSavingsRateLabel(savingsRate: number): string {
    if (savingsRate >= 20) return 'Boa folga'
    if (savingsRate >= 10) return 'Saudável'
    if (savingsRate >= 0) return 'Apertado'
    return 'Negativo'
}

function getCashCoverageLabel(months: number | null, targetMonths: number): string {
    if (months === null) return 'Sem despesa média'
    if (months >= targetMonths) return 'Meta atingida'
    if (months >= targetMonths / 2) return 'Atenção moderada'
    if (months >= 1) return 'Reserva curta'
    return 'Muito curto'
}

function formatMonthsToTarget(months: number | null): string {
    if (months === null) return 'Sem sobra média'
    if (months === 0) return 'Meta atingida'
    if (months < 1) return 'Menos de 1 mês'

    return `${months.toFixed(1)} meses`
}

type EvolutionChartPoint = {
    month: string
    Receitas: number
    Despesas: number
    Saldo: number
    Acumulado: number
}

type ProjectionChartPoint = {
    month: string
    Confirmado: number
    Pendente: number
    'Saldo Projetado': number
}

type ReportTheme = {
    bgCard: string
    bgInput: string
    bgMutedCard: string
    bgSolid: string
    balance: string
    balanceBg: string
    bodyBackground: string
    border: string
    borderSoft: string
    brand: string
    count: string
    countBg: string
    expense: string
    expenseBg: string
    income: string
    incomeBg: string
    text: string
    textMuted: string
}

const fallbackReportTheme: ReportTheme = {
    bgCard: 'rgba(255, 255, 255, 0.92)',
    bgInput: 'rgba(255, 255, 255, 0.96)',
    bgMutedCard: 'rgba(226, 232, 240, 0.78)',
    bgSolid: '#ffffff',
    balance: '#4f46e5',
    balanceBg: 'rgba(79, 70, 229, 0.12)',
    bodyBackground: 'linear-gradient(135deg, #cbd5e1 0%, #e2e8f0 38%, #f8fafc 70%, #dbeafe 100%)',
    border: 'rgba(71, 85, 105, 0.42)',
    borderSoft: 'rgba(71, 85, 105, 0.24)',
    brand: '#2563eb',
    count: '#7c3aed',
    countBg: 'rgba(124, 58, 237, 0.12)',
    expense: '#dc2626',
    expenseBg: 'rgba(220, 38, 38, 0.12)',
    income: '#16a34a',
    incomeBg: 'rgba(22, 163, 74, 0.12)',
    text: '#0f172a',
    textMuted: '#334155',
}

function escapeHtml(value: string | number | null | undefined): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function getReportDepthLabel(depth: ReportDepth): string {
    return reportDepthOptions.find((option) => option.value === depth)?.label ?? depth
}

function getReportDepthDescription(depth: ReportDepth): string {
    return reportDepthOptions.find((option) => option.value === depth)?.description ?? ''
}

function getReportTheme(): ReportTheme {
    if (typeof window === 'undefined') {
        return fallbackReportTheme
    }

    const rootStyle = window.getComputedStyle(document.documentElement)
    const bodyStyle = window.getComputedStyle(document.body)
    const cssVar = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback

    return {
        bgCard: cssVar('--color-bg-card', fallbackReportTheme.bgCard),
        bgInput: cssVar('--color-bg-input', fallbackReportTheme.bgInput),
        bgMutedCard: cssVar('--color-bg-muted-card', fallbackReportTheme.bgMutedCard),
        bgSolid: cssVar('--color-bg-solid', fallbackReportTheme.bgSolid),
        balance: cssVar('--color-balance', fallbackReportTheme.balance),
        balanceBg: cssVar('--color-balance-bg', fallbackReportTheme.balanceBg),
        bodyBackground: bodyStyle.backgroundImage !== 'none'
            ? bodyStyle.backgroundImage
            : fallbackReportTheme.bodyBackground,
        border: cssVar('--color-border', fallbackReportTheme.border),
        borderSoft: cssVar('--color-border-soft', fallbackReportTheme.borderSoft),
        brand: cssVar('--color-brand', fallbackReportTheme.brand),
        count: cssVar('--color-count', fallbackReportTheme.count),
        countBg: cssVar('--color-count-bg', fallbackReportTheme.countBg),
        expense: cssVar('--color-expense', fallbackReportTheme.expense),
        expenseBg: cssVar('--color-expense-bg', fallbackReportTheme.expenseBg),
        income: cssVar('--color-income', fallbackReportTheme.income),
        incomeBg: cssVar('--color-income-bg', fallbackReportTheme.incomeBg),
        text: cssVar('--color-text', fallbackReportTheme.text),
        textMuted: cssVar('--color-text-muted', fallbackReportTheme.textMuted),
    }
}

function downloadHtml(filename: string, html: string) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 250)
}

type RGB = [number, number, number]

function parseCssColor(value: string, fallback: RGB): RGB {
    const color = value.trim()
    const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)

    if (hex) {
        const raw = hex[1]
        const normalized = raw.length === 3
            ? raw.split('').map((char) => `${char}${char}`).join('')
            : raw

        return [
            Number.parseInt(normalized.slice(0, 2), 16),
            Number.parseInt(normalized.slice(2, 4), 16),
            Number.parseInt(normalized.slice(4, 6), 16),
        ]
    }

    const rgb = color.match(/^rgba?\(([^)]+)\)$/i)

    if (rgb) {
        const channels = rgb[1].split(',').slice(0, 3).map((channel) => Number.parseFloat(channel.trim()))

        if (channels.every(Number.isFinite)) {
            return channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))) as RGB
        }
    }

    return fallback
}

function openPdfDocument(doc: jsPDF, filename: string) {
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const pdfWindow = window.open(url, '_blank')

    if (!pdfWindow) {
        doc.save(filename)
        URL.revokeObjectURL(url)
        return
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function clampChartRange(values: number[]): { min: number; max: number } {
    const finiteValues = values.filter(Number.isFinite)

    if (finiteValues.length === 0) {
        return { min: 0, max: 1 }
    }

    const min = Math.min(0, ...finiteValues)
    const max = Math.max(0, ...finiteValues)

    if (min === max) {
        return { min: min - 1, max: max + 1 }
    }

    return { min, max }
}

function buildEvolutionChartSvg(data: EvolutionChartPoint[], theme: ReportTheme): string {
    if (data.length === 0) {
        return '<div class="empty-state">Sem dados suficientes para o grafico de evolucao.</div>'
    }

    const width = 920
    const height = 300
    const padding = { top: 26, right: 24, bottom: 46, left: 58 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom
    const keys: Array<keyof Pick<EvolutionChartPoint, 'Receitas' | 'Despesas' | 'Saldo' | 'Acumulado'>> = [
        'Receitas',
        'Despesas',
        'Saldo',
        'Acumulado',
    ]
    const colors = {
        Receitas: theme.income,
        Despesas: theme.expense,
        Saldo: theme.balance,
        Acumulado: theme.count,
    }
    const values = data.flatMap((item) => keys.map((key) => item[key]))
    const range = clampChartRange(values)
    const yFor = (value: number) => padding.top + ((range.max - value) / (range.max - range.min)) * chartHeight
    const xFor = (index: number) => padding.left + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth)
    const zeroY = yFor(0)
    const gridLines = Array.from({ length: 5 }, (_, index) => {
        const y = padding.top + (chartHeight / 4) * index
        const value = range.max - ((range.max - range.min) / 4) * index

        return `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${theme.borderSoft}" stroke-dasharray="4 6" />
            <text x="14" y="${y + 4}" fill="${theme.textMuted}" font-size="11">${escapeHtml(formatCurrency(value))}</text>
        `
    }).join('')
    const paths = keys.map((key) => {
        const points = data.map((item, index) => `${xFor(index)},${yFor(item[key])}`).join(' ')

        return `<polyline points="${points}" fill="none" stroke="${colors[key]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
    }).join('')
    const labels = data.map((item, index) => {
        const shouldShow = data.length <= 6 || index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 5) === 0

        if (!shouldShow) return ''

        return `<text x="${xFor(index)}" y="${height - 16}" text-anchor="middle" fill="${theme.textMuted}" font-size="11">${escapeHtml(item.month)}</text>`
    }).join('')

    return `
        <svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de evolução por período">
            ${gridLines}
            <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" stroke="${theme.border}" />
            ${paths}
            ${labels}
        </svg>
        <div class="legend">
            ${keys.map((key) => `<span><i style="background:${colors[key]}"></i>${escapeHtml(key)}</span>`).join('')}
        </div>
    `
}

function buildProjectionChartSvg(data: ProjectionChartPoint[], theme: ReportTheme): string {
    if (data.length === 0) {
        return '<div class="empty-state">Sem dados suficientes para o gráfico de projeção.</div>'
    }

    const width = 920
    const height = 300
    const padding = { top: 26, right: 24, bottom: 46, left: 58 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom
    const values = data.flatMap((item) => [item.Confirmado, item['Saldo Projetado']])
    const range = clampChartRange(values)
    const yFor = (value: number) => padding.top + ((range.max - value) / (range.max - range.min)) * chartHeight
    const zeroY = yFor(0)
    const groupWidth = chartWidth / data.length
    const barWidth = Math.max(10, Math.min(26, groupWidth * 0.24))
    const gridLines = Array.from({ length: 5 }, (_, index) => {
        const y = padding.top + (chartHeight / 4) * index
        const value = range.max - ((range.max - range.min) / 4) * index

        return `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${theme.borderSoft}" stroke-dasharray="4 6" />
            <text x="14" y="${y + 4}" fill="${theme.textMuted}" font-size="11">${escapeHtml(formatCurrency(value))}</text>
        `
    }).join('')
    const bars = data.map((item, index) => {
        const groupStart = padding.left + index * groupWidth
        const center = groupStart + groupWidth / 2
        const confirmedY = yFor(Math.max(item.Confirmado, 0))
        const confirmedHeight = Math.abs(yFor(item.Confirmado) - zeroY)
        const projectedY = yFor(Math.max(item['Saldo Projetado'], 0))
        const projectedHeight = Math.abs(yFor(item['Saldo Projetado']) - zeroY)
        const shouldShow = data.length <= 6 || index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 5) === 0

        return `
            <rect x="${center - barWidth - 3}" y="${confirmedY}" width="${barWidth}" height="${confirmedHeight}" rx="5" fill="${theme.balance}" opacity="0.9" />
            <rect x="${center + 3}" y="${projectedY}" width="${barWidth}" height="${projectedHeight}" rx="5" fill="${theme.count}" opacity="0.9" />
            ${shouldShow ? `<text x="${center}" y="${height - 16}" text-anchor="middle" fill="${theme.textMuted}" font-size="11">${escapeHtml(item.month)}</text>` : ''}
        `
    }).join('')

    return `
        <svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de projeção futura">
            ${gridLines}
            <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" stroke="${theme.border}" />
            ${bars}
        </svg>
        <div class="legend">
            <span><i style="background:${theme.balance}"></i>Confirmado</span>
            <span><i style="background:${theme.count}"></i>Saldo Projetado</span>
        </div>
    `
}

export function Reports() {
    const { user } = useAuth()

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
    const [reportDepth, setReportDepth] = useState<ReportDepth>('basic')
    const [isExportModalOpen, setIsExportModalOpen] = useState(false)
    const [exportDepth, setExportDepth] = useState<ReportDepth>('basic')
    const [exportFormat, setExportFormat] = useState<ExportFormat>('html')

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
    const reserveTargetMonths = user?.reserveTargetMonths ?? 6

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
    const selectedAccounts = financialAccounts.filter((account) => selectedAccountIds.includes(account.id))
    const sortedSelectedAccounts = sortAccountsByCurrentBalance(selectedAccounts)
    const currentCashBalance = selectedAccounts.reduce((total, account) => total + getAccountBalance(account), 0)
    const activeAccountCount = financialAccounts.filter((account) => !account.isArchived).length
    const hiddenDashboardAccountCount = financialAccounts.filter(
        (account) => !account.isArchived && !account.includeInDashboard,
    ).length
    const negativeAccountCount = selectedAccounts.filter((account) => getAccountBalance(account) < 0).length
    const firstEvolutionMonth = evolution[0]
    const lastEvolutionMonth = evolution.at(-1)
    const expenseTrend = firstEvolutionMonth && lastEvolutionMonth
        ? calculatePercentageChange(Number(firstEvolutionMonth.expenses), Number(lastEvolutionMonth.expenses))
        : null
    const incomeTrend = firstEvolutionMonth && lastEvolutionMonth
        ? calculatePercentageChange(Number(firstEvolutionMonth.income), Number(lastEvolutionMonth.income))
        : null
    const topCategory = categoryTotals[0]
    const topCategoryAmount = Number(topCategory?.totalAmount ?? 0)
    const topCategoryShare = categoryTotalAmount > 0 ? (topCategoryAmount / categoryTotalAmount) * 100 : 0
    const {
        cashCoverageMonths,
        monthsToReserveTarget,
        reserveCoverageRatio,
        reserveGap,
        reserveTargetAmount,
    } = calculateReserveMetrics({
        averageExpenses,
        currentCashBalance,
        evolutionMonthCount: evolution.length,
        periodBalance,
        reserveTargetMonths,
    })
    const projectedNegativeMonths = projection.filter((item) => Number(item.projectedBalance) < 0)
    const nextProjection = projection[0]
    const showIntermediateSections = reportDepth !== 'basic'
    const showCompleteSections = reportDepth === 'complete'
    const reportPeriodLabel = `${formatMonth(evolutionStart)} até ${formatMonth(evolutionEnd)}`
    const financialHealthScore = calculateFinancialHealthScore({
        cashCoverageMonths,
        categoryTotalAmount,
        negativeAccountCount,
        periodBalance,
        projectedNegativeMonthCount: projectedNegativeMonths.length,
        reserveCoverageRatio,
        savingsRate,
        topCategoryShare,
    })
    const financialHealth = getFinancialHealth(financialHealthScore)
    const financialHealthStyle = insightToneStyle[financialHealth.tone]
    const actionItems: ReportActionItem[] = [
        periodBalance < 0
            ? {
                title: 'Fechar o buraco do período',
                body: `O período ficou negativo em ${formatCurrency(Math.abs(periodBalance))}. Comece pelas despesas recorrentes e pelas categorias mais concentradas.`,
                priority: 'Alta',
            }
            : {
                title: 'Dar destino para a sobra',
                body: `A sobra foi de ${formatCurrency(periodBalance)}. Reserve uma parte antes que ela vire gasto solto no mês seguinte.`,
                priority: savingsRate >= 20 ? 'Baixa' : 'Média',
            },
        topCategory && topCategoryShare > 35
            ? {
                title: `Revisar ${topCategory.categoryName}`,
                body: `Essa categoria concentra ${topCategoryShare.toFixed(1)}% dos gastos listados. Vale separar o que é recorrente do que foi pontual.`,
                priority: topCategoryShare > 50 ? 'Alta' : 'Média',
            }
            : {
                title: 'Manter categorias bem distribuídas',
                body: 'Nenhuma categoria domina demais o período. Continue classificando movimentos para manter a leitura confiável.',
                priority: 'Baixa',
            },
        cashCoverageMonths === null || reserveGap === null || reserveGap > 0
            ? {
                title: 'Aumentar a reserva',
                body: cashCoverageMonths === null
                    ? 'Ainda falta despesa média para medir cobertura. Após alguns meses classificados, esse indicador fica mais útil.'
                    : `A cobertura estimada é de ${cashCoverageMonths.toFixed(1)} meses contra uma meta de ${reserveTargetMonths} meses. Falta ${formatCurrency(reserveGap ?? 0)} para a reserva configurada.`,
                priority: cashCoverageMonths !== null && cashCoverageMonths < 1 ? 'Alta' : 'Média',
            }
            : {
                title: 'Preservar a reserva',
                body: `A cobertura estimada é de ${cashCoverageMonths.toFixed(1)} meses e atingiu a meta de ${reserveTargetMonths} meses. Evite misturar esse fôlego com gasto cotidiano.`,
                priority: 'Baixa',
            },
        projectedNegativeMonths.length > 0
            ? {
                title: 'Conferir meses projetados negativos',
                body: `${projectedNegativeMonths.length} mês(es) da projeção aparecem abaixo de zero. Revise pendentes e lembretes antes de virar problema real.`,
                priority: 'Alta',
            }
            : {
                title: 'Acompanhar a projeção',
                body: 'A projeção não mostra saldo negativo agora. O cuidado é manter pendências futuras sempre cadastradas.',
                priority: 'Baixa',
            },
        negativeAccountCount > 0
            ? {
                title: 'Auditar contas negativas',
                body: `${negativeAccountCount} conta(s) selecionada(s) estão abaixo de zero. Use o extrato por conta para achar a origem.`,
                priority: 'Alta',
            }
            : {
                title: 'Conferir saldos por conta',
                body: 'Nenhuma conta selecionada aparece negativa. Ainda assim, vale revisar contas fora do dashboard no fechamento do mês.',
                priority: 'Baixa',
            },
        expenseTrend !== null && expenseTrend > 10
            ? {
                title: 'Investigar alta de gastos',
                body: `Os gastos subiram ${formatPercentage(expenseTrend)} entre o primeiro e o último mês do período. Veja se foi evento pontual ou nova rotina.`,
                priority: 'Média',
            }
            : {
                title: 'Manter rotina de revisão',
                body: 'A tendência de gastos não disparou no período. Uma revisão curta por semana já protege a qualidade do relatório.',
                priority: 'Baixa',
            },
    ]
    const visibleActionItems = actionItems.slice(0, showCompleteSections ? actionItems.length : showIntermediateSections ? 4 : 3)

    const financialSignals = [
        {
            label: 'Saúde financeira',
            value: `${financialHealthScore}/100`,
            detail: financialHealth.label,
            icon: Scale,
            color: financialHealthStyle.color,
            bg: financialHealthStyle.backgroundColor,
        },
        {
            label: 'Resultado do período',
            value: formatCurrency(periodBalance),
            detail: periodBalance >= 0
                ? 'Entrou mais dinheiro do que saiu no período.'
                : 'Saiu mais dinheiro do que entrou no período.',
            icon: Wallet,
            color: periodBalance >= 0 ? 'var(--color-balance)' : 'var(--color-expense)',
            bg: periodBalance >= 0 ? 'var(--color-balance-bg)' : 'var(--color-expense-bg)',
        },
        {
            label: 'Taxa de poupança',
            value: `${savingsRate.toFixed(1)}%`,
            detail: getSavingsRateLabel(savingsRate),
            icon: PiggyBank,
            color: savingsRate >= 0 ? 'var(--color-income)' : 'var(--color-expense)',
            bg: savingsRate >= 0 ? 'var(--color-income-bg)' : 'var(--color-expense-bg)',
        },
        {
            label: 'Cobertura de caixa',
            value: cashCoverageMonths === null ? 'Sem base' : `${cashCoverageMonths.toFixed(1)} meses`,
            detail: getCashCoverageLabel(cashCoverageMonths, reserveTargetMonths),
            icon: Gauge,
            color: reserveCoverageRatio !== null && reserveCoverageRatio < 0.5 ? 'var(--color-expense)' : 'var(--color-brand)',
            bg: reserveCoverageRatio !== null && reserveCoverageRatio < 0.5 ? 'var(--color-expense-bg)' : 'var(--color-balance-bg)',
        },
        {
            label: 'Meta de reserva',
            value: reserveTargetAmount === null ? 'Sem base' : formatCurrency(reserveTargetAmount),
            detail: `${reserveTargetMonths} meses de despesa média`,
            icon: Target,
            color: 'var(--color-count)',
            bg: 'var(--color-count-bg)',
        },
        {
            label: 'Falta para reserva',
            value: reserveGap === null ? 'Sem base' : reserveGap === 0 ? 'Meta atingida' : formatCurrency(reserveGap),
            detail: reserveGap === null ? 'Classifique despesas para calcular' : formatMonthsToTarget(monthsToReserveTarget),
            icon: PiggyBank,
            color: reserveGap === null || reserveGap > 0 ? 'var(--color-expense)' : 'var(--color-income)',
            bg: reserveGap === null || reserveGap > 0 ? 'var(--color-expense-bg)' : 'var(--color-income-bg)',
        },
        {
            label: 'Maior vazamento',
            value: topCategory?.categoryName ?? 'Sem dados',
            detail: topCategory ? `${topCategoryShare.toFixed(1)}% dos gastos listados` : 'Sem gastos no período',
            icon: Landmark,
            color: topCategoryShare > 35 ? 'var(--color-expense)' : 'var(--color-count)',
            bg: topCategoryShare > 35 ? 'var(--color-expense-bg)' : 'var(--color-count-bg)',
        },
    ]

    const insightCards: Array<{ title: string; body: string; tone: InsightTone }> = [
        {
            title: periodBalance >= 0 ? 'Sobrou dinheiro no período' : 'Período fechou negativo',
            body: periodBalance >= 0
                ? `A sobra foi de ${formatCurrency(periodBalance)}. Vale separar uma parte antes que ela vire gasto solto.`
                : `O buraco foi de ${formatCurrency(Math.abs(periodBalance))}. O primeiro corte deve olhar categorias recorrentes, não só compras isoladas.`,
            tone: periodBalance >= 0 ? 'green' : 'red',
        },
        {
            title: expenseTrend !== null && expenseTrend > 0 ? 'Gastos em alta' : 'Gastos controlados',
            body: expenseTrend === null
                ? 'Ainda falta uma base comparável entre o primeiro e o último mês do período.'
                : `Do primeiro ao último mês, os gastos variaram ${formatPercentage(expenseTrend)}.`,
            tone: expenseTrend !== null && expenseTrend > 0 ? 'yellow' : 'blue',
        },
        {
            title: projectedNegativeMonths.length > 0 ? 'Projeção pede atenção' : 'Projeção sem saldo negativo',
            body: projectedNegativeMonths.length > 0
                ? `${projectedNegativeMonths.length} mês(es) da projeção aparecem abaixo de zero.`
                : nextProjection
                    ? `Próximo saldo projetado: ${formatCurrency(nextProjection.projectedBalance)}.`
                    : 'Sem meses projetados para avaliar.',
            tone: projectedNegativeMonths.length > 0 ? 'red' : 'green',
        },
        {
            title: reserveGap === null
                ? 'Reserva sem base suficiente'
                : reserveGap === 0
                    ? 'Reserva dentro da meta'
                    : 'Reserva abaixo da meta',
            body: reserveGap === null
                ? 'Ainda falta despesa média no período para calcular a meta configurada.'
                : reserveGap === 0
                    ? `O saldo selecionado cobre a meta de ${reserveTargetMonths} meses.`
                    : `Faltam ${formatCurrency(reserveGap)} para cobrir ${reserveTargetMonths} meses de despesas médias.`,
            tone: reserveGap === null ? 'yellow' : reserveGap === 0 ? 'green' : 'yellow',
        },
        {
            title: incomeTrend !== null && incomeTrend < 0 ? 'Receita em queda' : 'Receita estável ou em alta',
            body: incomeTrend === null
                ? 'Ainda falta uma base comparável para medir variação de receita.'
                : `Do primeiro ao último mês, as receitas variaram ${formatPercentage(incomeTrend)}.`,
            tone: incomeTrend !== null && incomeTrend < 0 ? 'yellow' : 'blue',
        },
    ]

    const accountPositionCards = [
        {
            label: 'Saldo atual selecionado',
            value: formatCurrency(currentCashBalance),
            detail: `${selectedAccounts.length} de ${financialAccounts.length} contas no relatório`,
            icon: Wallet,
            color: currentCashBalance < 0 ? 'var(--color-expense)' : 'var(--color-balance)',
            bg: currentCashBalance < 0 ? 'var(--color-expense-bg)' : 'var(--color-balance-bg)',
        },
        {
            label: 'Contas ativas',
            value: activeAccountCount,
            detail: 'Base disponível para filtros',
            icon: Landmark,
            color: 'var(--color-brand)',
            bg: 'var(--color-balance-bg)',
        },
        {
            label: 'Saldos negativos',
            value: negativeAccountCount,
            detail: negativeAccountCount === 0 ? 'Nenhuma selecionada abaixo de zero' : 'Auditar no extrato',
            icon: Scale,
            color: negativeAccountCount > 0 ? 'var(--color-expense)' : 'var(--color-income)',
            bg: negativeAccountCount > 0 ? 'var(--color-expense-bg)' : 'var(--color-income-bg)',
        },
        {
            label: 'Fora do dashboard',
            value: hiddenDashboardAccountCount,
            detail: hiddenDashboardAccountCount === 0 ? 'Todas as ativas participam' : 'Ainda podem entrar no relatório',
            icon: EyeOff,
            color: 'var(--color-text-muted)',
            bg: 'var(--color-bg-muted-card)',
        },
    ]

    const projectionChartData = projection.map((p) => ({
        month: formatMonth(p.month),
        Confirmado: Number(p.projectedIncome) - Number(p.projectedExpenses),
        Pendente: Number(p.pendingTransactions),
        'Saldo Projetado': Number(p.projectedBalance)
    }))

    const openExportModal = () => {
        setExportDepth(reportDepth)
        setExportFormat('html')
        setIsExportModalOpen(true)
    }

    const buildReportHtml = (depth: ReportDepth) => {
        const theme = getReportTheme()
        const depthLabel = getReportDepthLabel(depth)
        const depthDescription = getReportDepthDescription(depth)
        const exportHasIntermediate = depth !== 'basic'
        const exportHasComplete = depth === 'complete'
        const categoryLimit = exportHasComplete ? categoryTotals.length : exportHasIntermediate ? 6 : 3
        const exportCategoryTotals = categoryTotals.slice(0, categoryLimit)
        const exportActionItems = actionItems.slice(0, exportHasComplete ? actionItems.length : exportHasIntermediate ? 4 : 3)
        const generatedAt = new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date())
        const categoryRows = exportCategoryTotals.map((category) => {
            const amount = Number(category.totalAmount)
            const percentage = categoryTotalAmount > 0 ? (amount / categoryTotalAmount) * 100 : 0

            return {
                amount,
                category,
                percentage,
            }
        })
        const cardHtml = (label: string, value: string | number, detail: string, color: string, bg: string) => `
            <article class="card metric-card">
                <span class="metric-dot" style="background:${bg}; color:${color};"></span>
                <div>
                    <p class="card-label">${escapeHtml(label)}</p>
                    <strong style="color:${color};">${escapeHtml(value)}</strong>
                    <p>${escapeHtml(detail)}</p>
                </div>
            </article>
        `
        const tableHtml = (headers: string[], rows: Array<Array<string | number>>) => `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `
        const styles = `
            :root {
                --color-bg-card: ${theme.bgCard};
                --color-bg-input: ${theme.bgInput};
                --color-bg-muted-card: ${theme.bgMutedCard};
                --color-bg-solid: ${theme.bgSolid};
                --color-balance: ${theme.balance};
                --color-balance-bg: ${theme.balanceBg};
                --color-border: ${theme.border};
                --color-border-soft: ${theme.borderSoft};
                --color-brand: ${theme.brand};
                --color-count: ${theme.count};
                --color-count-bg: ${theme.countBg};
                --color-expense: ${theme.expense};
                --color-expense-bg: ${theme.expenseBg};
                --color-income: ${theme.income};
                --color-income-bg: ${theme.incomeBg};
                --color-text: ${theme.text};
                --color-text-muted: ${theme.textMuted};
            }
            * { box-sizing: border-box; }
            body {
                margin: 0;
                min-height: 100vh;
                padding: 40px 32px;
                background: ${theme.bodyBackground};
                color: var(--color-text);
                font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .report-shell { width: min(1120px, 100%); margin: 0 auto; }
            .hero { margin-bottom: 30px; }
            h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.1; }
            h2 { margin: 0; font-size: 17px; }
            h3 { margin: 0; font-size: 14px; }
            p { margin: 0; color: var(--color-text-muted); line-height: 1.55; }
            .subtitle { max-width: 760px; font-size: 14px; }
            .meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
            .badge {
                display: inline-flex;
                align-items: center;
                min-height: 30px;
                border: 1px solid var(--color-border-soft);
                border-radius: 999px;
                background: var(--color-bg-input);
                color: var(--color-text);
                font-size: 12px;
                font-weight: 650;
                padding: 6px 12px;
            }
            .section { margin-top: 24px; }
            .section-header { margin-bottom: 14px; }
            .section-header p { margin-top: 4px; font-size: 13px; }
            .grid { display: grid; gap: 14px; }
            .grid-4 { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
            .grid-3 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
            .grid-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
            .card {
                border: 1px solid var(--color-border);
                border-radius: 14px;
                background: var(--color-bg-card);
                box-shadow: 0 20px 55px rgba(15, 23, 42, 0.16);
                backdrop-filter: blur(12px);
            }
            .metric-card { display: flex; gap: 14px; min-height: 118px; padding: 18px; }
            .metric-card strong { display: block; margin: 2px 0 4px; font-size: 22px; line-height: 1.15; }
            .metric-card p { font-size: 12px; }
            .card-label { color: var(--color-text-muted); font-size: 12px; }
            .metric-dot { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 13px; }
            .insight-card { padding: 18px; }
            .insight-card h3 { margin-bottom: 8px; }
            .score-card { padding: 18px; }
            .score-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
            .score-value { color: var(--color-text); font-size: 32px; font-weight: 800; line-height: 1; white-space: nowrap; }
            .score-track { height: 10px; margin: 18px 0 12px; overflow: hidden; border-radius: 999px; background: var(--color-bg-muted-card); }
            .score-fill { height: 100%; border-radius: inherit; }
            .action-list-card { padding: 18px; }
            .action-list { display: grid; gap: 12px; }
            .action-item { display: grid; gap: 6px; padding-top: 12px; border-top: 1px solid var(--color-border-soft); }
            .action-item:first-child { padding-top: 0; border-top: 0; }
            .action-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
            .priority-badge {
                display: inline-flex;
                align-items: center;
                min-height: 24px;
                border: 1px solid;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 750;
                padding: 4px 9px;
                white-space: nowrap;
            }
            .chart-card { padding: 18px; overflow: hidden; }
            .report-chart { display: block; width: 100%; height: auto; margin-top: 6px; }
            .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 12px; color: var(--color-text-muted); }
            .legend span { display: inline-flex; align-items: center; gap: 7px; }
            .legend i { width: 10px; height: 10px; border-radius: 999px; }
            .category-list { display: grid; gap: 12px; }
            .category-row { display: grid; gap: 8px; }
            .category-line { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
            .category-name { color: var(--color-text); font-size: 14px; font-weight: 650; }
            .category-meta { font-size: 12px; }
            .category-value { color: var(--color-expense); font-weight: 750; white-space: nowrap; }
            .bar-track { height: 9px; overflow: hidden; border-radius: 999px; background: var(--color-bg-muted-card); }
            .bar-fill { height: 100%; border-radius: inherit; background: var(--color-expense); }
            .table-wrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-bg-card); }
            table { width: 100%; border-collapse: collapse; min-width: 620px; }
            th, td { padding: 11px 13px; border-bottom: 1px solid var(--color-border-soft); text-align: left; font-size: 12px; }
            th { color: var(--color-text); background: var(--color-bg-input); font-weight: 700; }
            td { color: var(--color-text-muted); }
            tr:last-child td { border-bottom: 0; }
            .empty-state { border: 1px dashed var(--color-border); border-radius: 14px; padding: 22px; color: var(--color-text-muted); text-align: center; }
            .footer { margin-top: 34px; font-size: 11px; color: var(--color-text-muted); }
            @media (max-width: 640px) {
                body { padding: 24px 16px; }
                h1 { font-size: 24px; }
            }
            @media print {
                body { padding: 22px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                .card, .table-wrap { break-inside: avoid; box-shadow: none; }
            }
        `
        const monthlySummaryCards = [
            {
                label: 'Receitas no mês',
                value: formatCurrency(balance?.income ?? 0),
                detail: `Mês base: ${formatMonth(balanceMonth)}`,
                color: 'var(--color-income)',
                bg: 'var(--color-income-bg)',
            },
            {
                label: 'Despesas no mês',
                value: formatCurrency(balance?.expenses ?? 0),
                detail: `${balance?.transactionCount?.total ?? 0} transações no total`,
                color: 'var(--color-expense)',
                bg: 'var(--color-expense-bg)',
            },
            {
                label: 'Saldo do mês',
                value: formatCurrency(balance?.balance ?? 0),
                detail: Number(balance?.balance ?? 0) >= 0 ? 'Mês acima de zero' : 'Mês abaixo de zero',
                color: Number(balance?.balance ?? 0) >= 0 ? 'var(--color-balance)' : 'var(--color-expense)',
                bg: Number(balance?.balance ?? 0) >= 0 ? 'var(--color-balance-bg)' : 'var(--color-expense-bg)',
            },
        ]
        const evolutionRows = evolution.map((item) => [
            formatMonth(item.month),
            formatCurrency(item.income),
            formatCurrency(item.expenses),
            formatCurrency(item.balance),
            formatPercentage(calculatePercentageChange(Number(firstEvolutionMonth?.income ?? 0), Number(item.income))),
            formatPercentage(calculatePercentageChange(Number(firstEvolutionMonth?.expenses ?? 0), Number(item.expenses))),
        ])
        const projectionRows = projection.map((item) => [
            formatMonth(item.month),
            formatCurrency(item.projectedIncome),
            formatCurrency(item.projectedExpenses),
            formatCurrency(item.projectedBalance),
            item.pendingTransactions,
        ])
        const accountRows = sortedSelectedAccounts.map((account) => [
            account.name,
            account.institutionName || 'Sem instituicao',
            formatCurrency(account.currentBalance),
            account.includeInDashboard ? 'Sim' : 'Não',
            account.isArchived ? 'Sim' : 'Não',
        ])

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Money Organizer - Relatório ${escapeHtml(depthLabel)}</title>
<style>${styles}</style>
</head>
<body>
<main class="report-shell">
    <header class="hero">
        <h1>Money Organizer</h1>
        <p class="subtitle">Relatório financeiro ${escapeHtml(depthLabel.toLowerCase())}: ${escapeHtml(depthDescription)}.</p>
        <div class="meta-row">
            <span class="badge">Período: ${escapeHtml(reportPeriodLabel)}</span>
            <span class="badge">Nível: ${escapeHtml(depthLabel)}</span>
            <span class="badge">Reserva: ${escapeHtml(`${reserveTargetMonths} meses`)}</span>
            <span class="badge">Contas: ${escapeHtml(`${selectedAccounts.length} de ${financialAccounts.length}`)}</span>
            <span class="badge">Gerado em: ${escapeHtml(generatedAt)}</span>
        </div>
    </header>

    <section class="section">
        <div class="section-header">
            <h2>Resumo financeiro</h2>
            <p>Indicadores principais para entender sobra, pressão de gastos e fôlego de caixa.</p>
        </div>
        <div class="grid grid-4">
            ${financialSignals.map((signal) => cardHtml(signal.label, signal.value, signal.detail, signal.color, signal.bg)).join('')}
        </div>
    </section>

    <section class="section">
        <div class="section-header">
            <h2>Leitura prática</h2>
            <p>Interpretação em linguagem direta para orientar a próxima decisão.</p>
        </div>
        <div class="grid grid-2">
            ${insightCards.map((insight) => {
                const tone = insightToneStyle[insight.tone]

                return `
                    <article class="card insight-card" style="border-color:${tone.borderColor}; background:${tone.backgroundColor};">
                        <h3 style="color:${tone.color};">${escapeHtml(insight.title)}</h3>
                        <p style="color:var(--color-text);">${escapeHtml(insight.body)}</p>
                    </article>
                `
            }).join('')}
        </div>
    </section>

    <section class="section">
        <div class="section-header">
            <h2>Plano de ação</h2>
            <p>Score financeiro e passos práticos para a próxima revisão.</p>
        </div>
        <div class="grid grid-2">
            <article class="card score-card" style="border-color:${financialHealthStyle.borderColor}; background:${financialHealthStyle.backgroundColor};">
                <div class="score-top">
                    <div>
                        <p class="card-label">Saúde financeira</p>
                        <h3 style="color:${financialHealthStyle.color};">${escapeHtml(financialHealth.label)}</h3>
                    </div>
                    <strong class="score-value">${escapeHtml(`${financialHealthScore}/100`)}</strong>
                </div>
                <div class="score-track"><div class="score-fill" style="width:${financialHealthScore}%; background:${financialHealthStyle.color};"></div></div>
                <p style="color:var(--color-text);">${escapeHtml(financialHealth.description)}</p>
            </article>
            <article class="card action-list-card">
                <div class="section-header">
                    <h2>Próximas ações</h2>
                    <p>${escapeHtml(exportHasComplete ? 'Lista completa de prioridades sugeridas.' : 'Prioridades resumidas para agir sem travar.')}</p>
                </div>
                <div class="action-list">
                    ${exportActionItems.map((item) => {
                        const priority = actionPriorityStyle[item.priority]

                        return `
                            <div class="action-item">
                                <div class="action-head">
                                    <h3>${escapeHtml(item.title)}</h3>
                                    <span class="priority-badge" style="border-color:${priority.borderColor}; background:${priority.backgroundColor}; color:${priority.color};">${escapeHtml(item.priority)}</span>
                                </div>
                                <p>${escapeHtml(item.body)}</p>
                            </div>
                        `
                    }).join('')}
                </div>
            </article>
        </div>
    </section>

    <section class="section">
        <div class="section-header">
            <h2>Evolução por período</h2>
            <p>Receitas, despesas, saldo e acumulado dentro do período selecionado.</p>
        </div>
        <div class="card chart-card">
            ${buildEvolutionChartSvg(evolutionChartData, theme)}
        </div>
    </section>

    <section class="section">
        <div class="section-header">
            <h2>Maiores gastos por categoria</h2>
            <p>${escapeHtml(exportHasComplete ? 'Lista completa das categorias do período.' : `Top ${categoryLimit} categorias do período.`)}</p>
        </div>
        <div class="card chart-card">
            ${categoryRows.length === 0 ? '<div class="empty-state">Nenhum gasto encontrado no período.</div>' : `
                <div class="category-list">
                    ${categoryRows.map(({ amount, category, percentage }) => `
                        <div class="category-row">
                            <div class="category-line">
                                <div>
                                    <div class="category-name">${escapeHtml(`${formatStoredIconPrefix(category.categoryIcon)}${category.categoryName}`)}</div>
                                    <p class="category-meta">${escapeHtml(`${category.transactionCount} transações - ${percentage.toFixed(1)}% dos gastos listados`)}</p>
                                </div>
                                <div class="category-value">${escapeHtml(formatCurrency(amount))}</div>
                            </div>
                            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(percentage, 100)}%"></div></div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    </section>

    <section class="section">
        <div class="section-header">
            <h2>Balanço mensal</h2>
            <p>Recorte rápido do mês selecionado na página.</p>
        </div>
        <div class="grid grid-3">
            ${monthlySummaryCards.map((card) => cardHtml(card.label, card.value, card.detail, card.color, card.bg)).join('')}
        </div>
    </section>

    ${exportHasIntermediate ? `
        <section class="section">
            <div class="section-header">
                <h2>Projeção futura</h2>
                <p>Visão de saldo projetado, confirmados e pendências no intervalo selecionado.</p>
            </div>
            <div class="card chart-card">
                ${buildProjectionChartSvg(projectionChartData, theme)}
            </div>
        </section>

        <section class="section">
            <div class="section-header">
                <h2>Tabela de evolucao</h2>
                <p>Base numerica do grafico de evolucao.</p>
            </div>
            ${tableHtml(['Mês', 'Receitas', 'Despesas', 'Saldo', 'Receitas vs início', 'Despesas vs início'], evolutionRows)}
        </section>

        <section class="section">
            <div class="section-header">
                <h2>Tabela de projeção</h2>
                <p>Valores previstos e pendências por mês.</p>
            </div>
            ${tableHtml(['Mês', 'Receita projetada', 'Despesa projetada', 'Saldo projetado', 'Pendentes'], projectionRows)}
        </section>
    ` : ''}

    ${exportHasComplete ? `
        <section class="section">
            <div class="section-header">
                <h2>Posição por conta</h2>
                <p>Saldos atuais e propriedades das contas selecionadas no relatório.</p>
            </div>
            <div class="grid grid-4">
                ${accountPositionCards.map((card) => cardHtml(card.label, card.value, card.detail, card.color, card.bg)).join('')}
            </div>
            <div style="height:14px"></div>
            ${tableHtml(['Conta', 'Instituicao', 'Saldo atual', 'Dashboard', 'Arquivada'], accountRows)}
        </section>
    ` : ''}

    <p class="footer">Relatório gerado localmente pelo Money Organizer. Use como apoio para revisão financeira, não como recomendação de investimento.</p>
</main>
</body>
</html>`
    }

    const buildReportPdf = (depth: ReportDepth) => {
        const theme = getReportTheme()
        const isDarkTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
        const themeColor = (value: string, fallback: string) => {
            const cssVar = value.match(/^var\((--color-[^)]+)\)$/)?.[1]
            const themeMap: Record<string, string> = {
                '--color-balance': theme.balance,
                '--color-brand': theme.brand,
                '--color-count': theme.count,
                '--color-expense': theme.expense,
                '--color-income': theme.income,
                '--color-text': theme.text,
                '--color-text-muted': theme.textMuted,
            }

            return cssVar ? themeMap[cssVar] ?? fallback : value
        }
        const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'pt' })
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const margin = 30
        const contentWidth = pageWidth - margin * 2
        const baseBg: RGB = isDarkTheme ? [10, 10, 26] : [248, 250, 252]
        const cardBg: RGB = isDarkTheme ? [28, 25, 52] : [255, 255, 255]
        const inputBg: RGB = isDarkTheme ? [38, 34, 66] : [248, 250, 252]
        const border: RGB = isDarkTheme ? [72, 70, 104] : [203, 213, 225]
        const text = parseCssColor(theme.text, isDarkTheme ? [241, 245, 249] : [15, 23, 42])
        const textMuted = parseCssColor(theme.textMuted, isDarkTheme ? [148, 163, 184] : [51, 65, 85])
        const brand = parseCssColor(theme.brand, isDarkTheme ? [125, 211, 252] : [37, 99, 235])
        const income = parseCssColor(theme.income, isDarkTheme ? [74, 222, 128] : [22, 163, 74])
        const expense = parseCssColor(theme.expense, isDarkTheme ? [248, 113, 113] : [220, 38, 38])
        const balanceColor = parseCssColor(theme.balance, isDarkTheme ? [129, 140, 248] : [79, 70, 229])
        const count = parseCssColor(theme.count, isDarkTheme ? [192, 132, 252] : [124, 58, 237])
        const scoreColor = parseCssColor(themeColor(financialHealthStyle.color, theme.text), text)
        const priorityPdfColor = (priority: ActionPriority): RGB => {
            if (priority === 'Alta') return expense
            if (priority === 'Média') return parseCssColor('#d97706', [217, 119, 6])
            return brand
        }
        const pdfHasIntermediate = depth !== 'basic'
        const pdfHasComplete = depth === 'complete'
        const categoryLimit = pdfHasComplete ? categoryTotals.length : pdfHasIntermediate ? 6 : 3
        const pdfActionItems = actionItems.slice(0, pdfHasComplete ? actionItems.length : pdfHasIntermediate ? 4 : 3)
        const categoryRows = categoryTotals.slice(0, categoryLimit).map((category) => {
            const amount = Number(category.totalAmount)
            const percentage = categoryTotalAmount > 0 ? (amount / categoryTotalAmount) * 100 : 0

            return { amount, category, percentage }
        })
        let y = 0

        const setFill = (color: RGB) => pdf.setFillColor(color[0], color[1], color[2])
        const setDraw = (color: RGB) => pdf.setDrawColor(color[0], color[1], color[2])
        const setText = (color: RGB) => pdf.setTextColor(color[0], color[1], color[2])

        const drawBackground = () => {
            setFill(baseBg)
            pdf.rect(0, 0, pageWidth, pageHeight, 'F')
            setFill(isDarkTheme ? [15, 12, 41] : [219, 234, 254])
            pdf.rect(0, 0, pageWidth, 118, 'F')
            setFill(brand)
            pdf.rect(0, 0, pageWidth, 8, 'F')
            setFill(isDarkTheme ? [26, 10, 46] : [226, 232, 240])
            pdf.rect(0, pageHeight - 22, pageWidth, 22, 'F')
        }

        const addPage = () => {
            pdf.addPage()
            drawBackground()
            y = margin
        }

        const ensureSpace = (height: number) => {
            if (y + height > pageHeight - margin) {
                addPage()
            }
        }

        const writeText = (
            value: string | number,
            x: number,
            top: number,
            maxWidth: number,
            options: { color?: RGB; fontSize?: number; bold?: boolean; lineHeight?: number } = {},
        ) => {
            const fontSize = options.fontSize ?? 10
            const lineHeight = options.lineHeight ?? fontSize + 4

            pdf.setFont('helvetica', options.bold ? 'bold' : 'normal')
            pdf.setFontSize(fontSize)
            setText(options.color ?? text)

            const lines = pdf.splitTextToSize(String(value), maxWidth) as string[]
            pdf.text(lines, x, top + fontSize)

            return lines.length * lineHeight
        }

        const drawSectionTitle = (title: string, description: string) => {
            ensureSpace(48)
            writeText(title, margin, y, contentWidth, { bold: true, fontSize: 15 })
            y += 21
            y += writeText(description, margin, y, contentWidth, { color: textMuted, fontSize: 9, lineHeight: 13 })
            y += 8
        }

        const drawCard = (x: number, top: number, width: number, height: number) => {
            setFill(cardBg)
            setDraw(border)
            pdf.roundedRect(x, top, width, height, 10, 10, 'FD')
        }

        const drawMetricCard = (
            x: number,
            top: number,
            width: number,
            label: string,
            value: string | number,
            detail: string,
            colorValue: RGB,
        ) => {
            const height = 88

            drawCard(x, top, width, height)
            setFill(inputBg)
            pdf.roundedRect(x + 12, top + 14, 30, 30, 8, 8, 'F')
            setFill(colorValue)
            pdf.circle(x + 27, top + 29, 5, 'F')
            writeText(label, x + 52, top + 14, width - 64, { color: textMuted, fontSize: 8, lineHeight: 11 })
            writeText(value, x + 52, top + 31, width - 64, { bold: true, color: colorValue, fontSize: 14, lineHeight: 17 })
            writeText(detail, x + 52, top + 53, width - 64, { color: textMuted, fontSize: 8, lineHeight: 11 })
        }

        const drawMetricGrid = (
            cards: Array<{ label: string; value: string | number; detail: string; color: string; bg?: string }>,
        ) => {
            const gap = 12
            const cardWidth = (contentWidth - gap) / 2
            const cardHeight = 88

            ensureSpace(Math.ceil(cards.length / 2) * (cardHeight + gap))

            cards.forEach((card, index) => {
                const x = margin + (index % 2) * (cardWidth + gap)
                const top = y + Math.floor(index / 2) * (cardHeight + gap)

                drawMetricCard(
                    x,
                    top,
                    cardWidth,
                    card.label,
                    card.value,
                    card.detail,
                    parseCssColor(themeColor(card.color, theme.text), text),
                )
            })

            y += Math.ceil(cards.length / 2) * (cardHeight + gap) + 8
        }

        const drawInsightCards = () => {
            const gap = 12
            const cardWidth = (contentWidth - gap) / 2
            const cardHeight = 95

            ensureSpace(Math.ceil(insightCards.length / 2) * (cardHeight + gap))

            insightCards.forEach((insight, index) => {
                const tone = insightToneStyle[insight.tone]
                const x = margin + (index % 2) * (cardWidth + gap)
                const top = y + Math.floor(index / 2) * (cardHeight + gap)
                const toneColor = parseCssColor(themeColor(tone.color, theme.text), text)

                drawCard(x, top, cardWidth, cardHeight)
                writeText(insight.title, x + 13, top + 13, cardWidth - 26, { bold: true, color: toneColor, fontSize: 10 })
                writeText(insight.body, x + 13, top + 36, cardWidth - 26, { color: text, fontSize: 8.5, lineHeight: 12 })
            })

            y += Math.ceil(insightCards.length / 2) * (cardHeight + gap) + 8
        }

        const drawActionPlan = () => {
            const scoreCardHeight = 118

            ensureSpace(scoreCardHeight + 8)
            drawCard(margin, y, contentWidth, scoreCardHeight)
            writeText('Saúde financeira', margin + 14, y + 13, contentWidth - 28, { color: textMuted, fontSize: 8, lineHeight: 11 })
            writeText(`${financialHealthScore}/100`, margin + 14, y + 31, 100, { bold: true, color: scoreColor, fontSize: 22, lineHeight: 26 })
            writeText(financialHealth.label, margin + 120, y + 36, contentWidth - 134, { bold: true, color: scoreColor, fontSize: 11, lineHeight: 14 })
            setFill(inputBg)
            pdf.roundedRect(margin + 14, y + 74, contentWidth - 28, 8, 4, 4, 'F')
            setFill(scoreColor)
            pdf.roundedRect(margin + 14, y + 74, ((contentWidth - 28) * financialHealthScore) / 100, 8, 4, 4, 'F')
            writeText(financialHealth.description, margin + 14, y + 90, contentWidth - 28, { color: text, fontSize: 8.5, lineHeight: 12 })
            y += scoreCardHeight + 12

            pdfActionItems.forEach((item) => {
                const rowTextX = margin + 76
                const rowTextWidth = contentWidth - 92
                const bodyLines = pdf.splitTextToSize(item.body, rowTextWidth) as string[]
                const rowHeight = Math.max(64, 38 + bodyLines.length * 10)
                const priorityColor = priorityPdfColor(item.priority)

                ensureSpace(rowHeight + 8)
                drawCard(margin, y, contentWidth, rowHeight)
                setFill(inputBg)
                setDraw(priorityColor)
                pdf.roundedRect(margin + 14, y + 14, 48, 20, 10, 10, 'FD')
                writeText(item.priority, margin + 20, y + 18, 36, { bold: true, color: priorityColor, fontSize: 7, lineHeight: 9 })
                writeText(item.title, rowTextX, y + 10, rowTextWidth, { bold: true, fontSize: 9, lineHeight: 12 })
                writeText(item.body, rowTextX, y + 28, rowTextWidth, { color: textMuted, fontSize: 7.5, lineHeight: 10 })
                y += rowHeight + 8
            })

            y += 4
        }

        const drawEvolutionPdfChart = () => {
            const height = 190
            const chartX = margin + 36
            const chartY = y + 36
            const chartWidth = contentWidth - 56
            const chartHeight = 112
            const keys: Array<keyof Pick<EvolutionChartPoint, 'Receitas' | 'Despesas' | 'Saldo' | 'Acumulado'>> = [
                'Receitas',
                'Despesas',
                'Saldo',
                'Acumulado',
            ]
            const colors = {
                Receitas: income,
                Despesas: expense,
                Saldo: balanceColor,
                Acumulado: count,
            }
            const values = evolutionChartData.flatMap((item) => keys.map((key) => item[key]))
            const range = clampChartRange(values)
            const yFor = (value: number) => chartY + ((range.max - value) / (range.max - range.min)) * chartHeight
            const xFor = (index: number) => chartX + (evolutionChartData.length === 1 ? chartWidth / 2 : (index / (evolutionChartData.length - 1)) * chartWidth)

            ensureSpace(height)
            drawCard(margin, y, contentWidth, height)
            writeText('Evolução por período', margin + 14, y + 13, contentWidth - 28, { bold: true, fontSize: 11 })
            setDraw(border)

            for (let index = 0; index < 5; index += 1) {
                const lineY = chartY + (chartHeight / 4) * index
                pdf.line(chartX, lineY, chartX + chartWidth, lineY)
            }

            keys.forEach((key) => {
                setDraw(colors[key])
                evolutionChartData.forEach((item, index) => {
                    if (index === 0) return

                    const previous = evolutionChartData[index - 1]
                    pdf.line(xFor(index - 1), yFor(previous[key]), xFor(index), yFor(item[key]))
                })
            })

            setText(textMuted)
            pdf.setFontSize(7)
            evolutionChartData.forEach((item, index) => {
                if (evolutionChartData.length > 6 && index !== 0 && index !== evolutionChartData.length - 1 && index % Math.ceil(evolutionChartData.length / 5) !== 0) {
                    return
                }

                pdf.text(item.month, xFor(index), y + height - 18, { align: 'center' })
            })

            y += height + 14
        }

        const drawProjectionPdfChart = () => {
            const height = 190
            const chartX = margin + 36
            const chartY = y + 36
            const chartWidth = contentWidth - 56
            const chartHeight = 112
            const values = projectionChartData.flatMap((item) => [item.Confirmado, item['Saldo Projetado']])
            const range = clampChartRange(values)
            const yFor = (value: number) => chartY + ((range.max - value) / (range.max - range.min)) * chartHeight
            const zeroY = yFor(0)
            const groupWidth = projectionChartData.length > 0 ? chartWidth / projectionChartData.length : chartWidth
            const barWidth = Math.max(8, Math.min(18, groupWidth * 0.22))

            ensureSpace(height)
            drawCard(margin, y, contentWidth, height)
            writeText('Projeção futura', margin + 14, y + 13, contentWidth - 28, { bold: true, fontSize: 11 })
            setDraw(border)

            for (let index = 0; index < 5; index += 1) {
                const lineY = chartY + (chartHeight / 4) * index
                pdf.line(chartX, lineY, chartX + chartWidth, lineY)
            }

            projectionChartData.forEach((item, index) => {
                const center = chartX + index * groupWidth + groupWidth / 2
                const confirmedY = yFor(Math.max(item.Confirmado, 0))
                const confirmedHeight = Math.abs(yFor(item.Confirmado) - zeroY)
                const projectedY = yFor(Math.max(item['Saldo Projetado'], 0))
                const projectedHeight = Math.abs(yFor(item['Saldo Projetado']) - zeroY)

                setFill(balanceColor)
                pdf.roundedRect(center - barWidth - 3, confirmedY, barWidth, confirmedHeight, 3, 3, 'F')
                setFill(count)
                pdf.roundedRect(center + 3, projectedY, barWidth, projectedHeight, 3, 3, 'F')

                if (projectionChartData.length <= 6 || index === 0 || index === projectionChartData.length - 1) {
                    setText(textMuted)
                    pdf.setFontSize(7)
                    pdf.text(item.month, center, y + height - 18, { align: 'center' })
                }
            })

            y += height + 14
        }

        const drawCategoryList = () => {
            const rowHeight = 38

            if (categoryRows.length === 0) {
                ensureSpace(54)
                drawCard(margin, y, contentWidth, 54)
                writeText('Nenhum gasto encontrado no período.', margin + 14, y + 18, contentWidth - 28, { color: textMuted })
                y += 68
                return
            }

            categoryRows.forEach(({ amount, category, percentage }) => {
                ensureSpace(rowHeight + 8)
                drawCard(margin, y, contentWidth, rowHeight)
                writeText(`${formatStoredIconPrefix(category.categoryIcon)}${category.categoryName}`, margin + 12, y + 7, contentWidth * 0.45, { bold: true, fontSize: 9 })
                writeText(`${category.transactionCount} transações - ${percentage.toFixed(1)}%`, margin + 12, y + 22, contentWidth * 0.45, { color: textMuted, fontSize: 7 })
                writeText(formatCurrency(amount), margin + contentWidth - 120, y + 12, 108, { bold: true, color: expense, fontSize: 9 })
                setFill(isDarkTheme ? [65, 62, 92] : [226, 232, 240])
                pdf.roundedRect(margin + contentWidth * 0.52, y + 24, contentWidth * 0.32, 5, 2.5, 2.5, 'F')
                setFill(expense)
                pdf.roundedRect(margin + contentWidth * 0.52, y + 24, (contentWidth * 0.32 * Math.min(percentage, 100)) / 100, 5, 2.5, 2.5, 'F')
                y += rowHeight + 8
            })

            y += 4
        }

        const drawTable = (headers: string[], rows: Array<Array<string | number>>) => {
            const rowHeight = 22
            const columnWidth = contentWidth / headers.length

            ensureSpace(rowHeight * 2)
            setFill(inputBg)
            setDraw(border)
            pdf.roundedRect(margin, y, contentWidth, rowHeight, 8, 8, 'FD')
            headers.forEach((header, index) => {
                writeText(header, margin + index * columnWidth + 6, y + 5, columnWidth - 12, { bold: true, fontSize: 7.5, lineHeight: 10 })
            })
            y += rowHeight

            rows.forEach((row) => {
                ensureSpace(rowHeight + 4)
                setFill(cardBg)
                setDraw(border)
                pdf.rect(margin, y, contentWidth, rowHeight, 'FD')
                row.forEach((cell, index) => {
                    writeText(cell, margin + index * columnWidth + 6, y + 5, columnWidth - 12, { color: textMuted, fontSize: 7, lineHeight: 9 })
                })
                y += rowHeight
            })

            y += 14
        }

        drawBackground()
        y = margin
        writeText('Money Organizer', margin, y, contentWidth, { bold: true, fontSize: 24, lineHeight: 28 })
        y += 31
        y += writeText(
            `Relatório financeiro ${getReportDepthLabel(depth).toLowerCase()} - ${getReportDepthDescription(depth)}.`,
            margin,
            y,
            contentWidth,
            { color: textMuted, fontSize: 10, lineHeight: 14 },
        )
        y += 9
        ;[
            `Período: ${reportPeriodLabel}`,
            `Nível: ${getReportDepthLabel(depth)}`,
            `Reserva: ${reserveTargetMonths} meses`,
            `Contas: ${selectedAccounts.length} de ${financialAccounts.length}`,
            `Gerado em: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`,
        ].forEach((badge, index) => {
            const badgeWidth = index === 4 ? 126 : 112
            const badgeX = margin + (index % 2) * (badgeWidth + 12)
            const badgeY = y + Math.floor(index / 2) * 25

            setFill(inputBg)
            setDraw(border)
            pdf.roundedRect(badgeX, badgeY, badgeWidth, 20, 10, 10, 'FD')
            writeText(badge, badgeX + 8, badgeY + 4, badgeWidth - 16, { color: text, fontSize: 7, lineHeight: 9 })
        })
        y += 87

        drawSectionTitle('Resumo financeiro', 'Indicadores principais para entender sobra, pressão de gastos e fôlego de caixa.')
        drawMetricGrid(financialSignals)

        drawSectionTitle('Leitura prática', 'Interpretação em linguagem direta para orientar a próxima decisão.')
        drawInsightCards()

        drawSectionTitle('Plano de ação', 'Score financeiro e passos práticos para a próxima revisão.')
        drawActionPlan()

        drawEvolutionPdfChart()

        drawSectionTitle('Maiores gastos por categoria', pdfHasComplete ? 'Lista completa das categorias do período.' : `Top ${categoryLimit} categorias do período.`)
        drawCategoryList()

        drawSectionTitle('Balanço mensal', 'Recorte rápido do mês selecionado na página.')
        drawMetricGrid([
            {
                label: 'Receitas no mês',
                value: formatCurrency(balance?.income ?? 0),
                detail: `Mês base: ${formatMonth(balanceMonth)}`,
                color: theme.income,
            },
            {
                label: 'Despesas no mês',
                value: formatCurrency(balance?.expenses ?? 0),
                detail: `${balance?.transactionCount?.total ?? 0} transações no total`,
                color: theme.expense,
            },
            {
                label: 'Saldo do mês',
                value: formatCurrency(balance?.balance ?? 0),
                detail: Number(balance?.balance ?? 0) >= 0 ? 'Mês acima de zero' : 'Mês abaixo de zero',
                color: Number(balance?.balance ?? 0) >= 0 ? theme.balance : theme.expense,
            },
        ])

        if (pdfHasIntermediate) {
            drawProjectionPdfChart()

            drawSectionTitle('Tabela de evolucao', 'Base numerica do grafico de evolucao.')
            drawTable(
                ['Mês', 'Receitas', 'Despesas', 'Saldo', 'Rec. vs início', 'Desp. vs início'],
                evolution.map((item) => [
                    formatMonth(item.month),
                    formatCurrency(item.income),
                    formatCurrency(item.expenses),
                    formatCurrency(item.balance),
                    formatPercentage(calculatePercentageChange(Number(firstEvolutionMonth?.income ?? 0), Number(item.income))),
                    formatPercentage(calculatePercentageChange(Number(firstEvolutionMonth?.expenses ?? 0), Number(item.expenses))),
                ]),
            )

            drawSectionTitle('Tabela de projeção', 'Valores previstos e pendências por mês.')
            drawTable(
                ['Mês', 'Receita proj.', 'Despesa proj.', 'Saldo proj.', 'Pendentes'],
                projection.map((item) => [
                    formatMonth(item.month),
                    formatCurrency(item.projectedIncome),
                    formatCurrency(item.projectedExpenses),
                    formatCurrency(item.projectedBalance),
                    item.pendingTransactions,
                ]),
            )
        }

        if (pdfHasComplete) {
            drawSectionTitle('Posição por conta', 'Saldos atuais e propriedades das contas selecionadas no relatório.')
            drawMetricGrid(accountPositionCards)
            drawTable(
                ['Conta', 'Instituicao', 'Saldo atual', 'Dashboard', 'Arquivada'],
                sortedSelectedAccounts.map((account) => [
                    account.name,
                    account.institutionName || 'Sem instituicao',
                    formatCurrency(account.currentBalance),
                    account.includeInDashboard ? 'Sim' : 'Não',
                    account.isArchived ? 'Sim' : 'Não',
                ]),
            )
        }

        ensureSpace(40)
        writeText(
            'Relatório gerado localmente pelo Money Organizer. Use como apoio para revisão financeira, não como recomendação de investimento.',
            margin,
            y,
            contentWidth,
            { color: textMuted, fontSize: 8, lineHeight: 11 },
        )

        return pdf
    }

    const handleExportReport = () => {
        if (isLoading || exportFormat === 'csv' || exportFormat === 'xlsx') return

        const filename = `money-organizer-report-${exportDepth}-${evolutionStart}-${evolutionEnd}.html`

        if (exportFormat === 'pdf') {
            const pdf = buildReportPdf(exportDepth)
            openPdfDocument(pdf, filename.replace(/\.html$/, '.pdf'))
        } else {
            const html = buildReportHtml(exportDepth)
            downloadHtml(filename, html)
        }

        setIsExportModalOpen(false)
    }

    return (
        <Layout>
            <div className="space-y-8">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Relatórios</h1>
                    <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Análise detalhada das suas finanças</p>
                </div>

                <section
                    className="glass rounded-2xl p-4 sm:p-5"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="grid flex-1 gap-3 md:grid-cols-3">
                            {reportDepthOptions.map((option) => {
                                const isSelected = reportDepth === option.value

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setReportDepth(option.value)}
                                        className="rounded-xl border p-4 text-left transition hover:opacity-90"
                                        style={{
                                            borderColor: isSelected ? 'var(--color-brand)' : 'var(--color-border-soft)',
                                            backgroundColor: isSelected ? 'var(--color-balance-bg)' : 'var(--color-bg-input)',
                                            color: 'var(--color-text)',
                                        }}
                                    >
                                        <span className="block text-sm font-semibold">{option.label}</span>
                                        <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                            {option.description}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={openExportModal}
                            className="app-icon-control inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium xl:w-auto"
                        >
                            <Download size={17} />
                            Exportar relatório
                        </button>
                    </div>
                </section>

                <AccountFilter
                    accounts={financialAccounts}
                    selectedAccountIds={selectedAccountIds}
                    onChange={setSelectedAccountIds}
                    title="Contas do relatório"
                />

                <section className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Leitura financeira</h2>
                        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Sobra, aperto, concentração de gasto e fôlego de caixa para decisão prática.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {financialSignals.map((signal) => (
                            <div
                                key={signal.label}
                                className="glass flex min-h-[7.5rem] items-start gap-4 rounded-2xl p-5"
                                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                            >
                                <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: signal.bg }}>
                                    <signal.icon size={21} style={{ color: signal.color }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{signal.label}</p>
                                    <p className="break-words text-xl font-bold leading-tight" style={{ color: signal.color }}>
                                        {signal.value}
                                    </p>
                                    <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                        {signal.detail}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {insightCards.map((insight) => {
                            const tone = insightToneStyle[insight.tone]

                            return (
                                <div
                                    key={insight.title}
                                    className="glass min-h-[8rem] rounded-2xl border p-5"
                                    style={{
                                        backgroundColor: tone.backgroundColor,
                                        borderColor: tone.borderColor,
                                    }}
                                >
                                    <div className="mb-3 flex items-center gap-2" style={{ color: tone.color }}>
                                        <Lightbulb size={18} />
                                        <h3 className="text-sm font-semibold">{insight.title}</h3>
                                    </div>
                                    <p className="text-sm leading-6" style={{ color: 'var(--color-text)' }}>
                                        {insight.body}
                                    </p>
                                </div>
                            )
                        })}
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <div
                            className="glass rounded-2xl border p-5"
                            style={{
                                backgroundColor: financialHealthStyle.backgroundColor,
                                borderColor: financialHealthStyle.borderColor,
                            }}
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                        Score financeiro
                                    </p>
                                    <h3 className="mt-1 text-lg font-semibold" style={{ color: financialHealthStyle.color }}>
                                        {financialHealth.label}
                                    </h3>
                                </div>
                                <p className="text-3xl font-bold leading-none" style={{ color: 'var(--color-text)' }}>
                                    {financialHealthScore}
                                    <span className="text-base font-semibold" style={{ color: 'var(--color-text-muted)' }}>/100</span>
                                </p>
                            </div>
                            <div className="mt-5 h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-muted-card)' }}>
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${financialHealthScore}%`,
                                        backgroundColor: financialHealthStyle.color,
                                    }}
                                />
                            </div>
                            <p className="mt-4 text-sm leading-6" style={{ color: 'var(--color-text)' }}>
                                {financialHealth.description}
                            </p>
                        </div>

                        <div
                            className="glass rounded-2xl p-5"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <div className="mb-4 flex items-center gap-2" style={{ color: 'var(--color-brand)' }}>
                                <Lightbulb size={18} />
                                <h3 className="text-sm font-semibold">Próximas ações</h3>
                            </div>
                            <div className="divide-y" style={{ borderColor: 'var(--color-border-soft)' }}>
                                {visibleActionItems.map((item) => {
                                    const priority = actionPriorityStyle[item.priority]

                                    return (
                                        <div key={item.title} className="py-3 first:pt-0 last:pb-0">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                    {item.title}
                                                </p>
                                                <span
                                                    className="inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                                                    style={{
                                                        backgroundColor: priority.backgroundColor,
                                                        borderColor: priority.borderColor,
                                                        color: priority.color,
                                                    }}
                                                >
                                                    {item.priority}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
                                                {item.body}
                                            </p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Posição atual por conta</h2>
                            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                Saldos atuais das contas selecionadas, separados dos fluxos por período.
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
                        {accountPositionCards.map((card) => (
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

                    {showCompleteSections && sortedSelectedAccounts.length > 0 && (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                            {sortedSelectedAccounts.map((account) => {
                                const accountBalance = getAccountBalance(account)
                                const accountColor = accountBalance < 0 ? 'var(--color-expense)' : 'var(--color-text)'

                                return (
                                    <Link
                                        key={account.id}
                                        to={`/accounts?account=${account.id}`}
                                        className="glass flex min-h-[7.5rem] min-w-0 items-center justify-between gap-4 rounded-2xl p-5 transition hover:opacity-90"
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

                {/* ─── Balanço Mensal ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                        {
                            label: 'Resultado do período',
                            value: formatCurrency(periodBalance),
                            icon: Wallet,
                            color: periodBalance >= 0 ? 'text-blue-600' : 'text-red-600',
                            bg: periodBalance >= 0 ? 'bg-blue-50' : 'bg-red-50',
                        },
                        {
                            label: 'Média mensal de gastos',
                            value: formatCurrency(averageExpenses),
                            icon: TrendingDown,
                            color: 'text-red-600',
                            bg: 'bg-red-50',
                        },
                        {
                            label: 'Taxa de poupança',
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
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Melhor mês do período</p>
                        <p className="text-xl font-bold mt-1" style={{ color: 'var(--color-income)' }}>
                            {bestMonth ? `${formatMonth(bestMonth.month)} - ${formatCurrency(Number(bestMonth.balance))}` : 'Sem dados'}
                        </p>
                    </div>
                    <div className="glass rounded-2xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Mês de maior aperto</p>
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
                            Ranking baseado no período de evolução selecionado.
                        </p>
                    </div>

                    {categoryTotals.length === 0 ? (
                        <div className="flex items-center justify-center h-32">
                            <p style={{ color: 'var(--color-text-muted)' }}>Nenhum gasto encontrado no período</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {categoryTotals.slice(0, showIntermediateSections ? 6 : 3).map((category) => {
                                const amount = Number(category.totalAmount)
                                const percentage = categoryTotalAmount > 0 ? (amount / categoryTotalAmount) * 100 : 0

                                return (
                                    <div key={category.categoryId} className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                                                    {formatStoredIconPrefix(category.categoryIcon)}{category.categoryName}
                                                </p>
                                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {category.transactionCount} transações - {percentage.toFixed(1)}% dos gastos listados
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

            {isExportModalOpen && (
                <div
                    className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-3 py-4 backdrop-blur-sm sm:items-center"
                    onMouseDown={() => setIsExportModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reports-export-title"
                        className="glass-heavy max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl p-5 shadow-2xl sm:p-6"
                        style={{ backgroundColor: 'var(--color-bg-modal)', border: '1px solid var(--color-border)' }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 id="reports-export-title" className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                    Exportar relatório
                                </h2>
                                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                    Escolha o nível e o formato do arquivo.
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Fechar exportação"
                                title="Fechar"
                                onClick={() => setIsExportModalOpen(false)}
                                className="app-icon-control flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <section className="space-y-3">
                                <div>
                                    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Nível do relatório</h3>
                                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        O arquivo será montado com o nível escolhido aqui.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    {reportDepthOptions.map((option) => {
                                        const isSelected = exportDepth === option.value

                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                aria-pressed={isSelected}
                                                onClick={() => setExportDepth(option.value)}
                                                className="rounded-xl border p-4 text-left transition hover:opacity-90"
                                                style={{
                                                    borderColor: isSelected ? 'var(--color-brand)' : 'var(--color-border-soft)',
                                                    backgroundColor: isSelected ? 'var(--color-balance-bg)' : 'var(--color-bg-input)',
                                                    color: 'var(--color-text)',
                                                }}
                                            >
                                                <span className="block text-sm font-semibold">{option.label}</span>
                                                <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                                    {option.description}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </section>

                            <section className="space-y-3">
                                <div>
                                    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Formato</h3>
                                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        HTML baixa como página visual. PDF abre pronto em uma aba com botão de download do navegador.
                                    </p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {exportFormatOptions.map((option) => {
                                        const isSelected = exportFormat === option.value
                                        const FormatIcon = option.value === 'html' || option.value === 'pdf'
                                            ? FileText
                                            : Table

                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                aria-pressed={isSelected}
                                                disabled={!option.available}
                                                onClick={() => option.available && setExportFormat(option.value)}
                                                className="rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
                                                style={{
                                                    borderColor: isSelected ? 'var(--color-brand)' : 'var(--color-border-soft)',
                                                    backgroundColor: isSelected ? 'var(--color-balance-bg)' : 'var(--color-bg-input)',
                                                    color: 'var(--color-text)',
                                                }}
                                            >
                                                <span className="flex items-center justify-between gap-3">
                                                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                                        <FormatIcon size={17} />
                                                        {option.label}
                                                    </span>
                                                    {!option.available && (
                                                        <span
                                                            className="rounded-full px-2 py-1 text-[0.68rem] font-semibold"
                                                            style={{ backgroundColor: 'var(--color-bg-muted-card)', color: 'var(--color-text-muted)' }}
                                                        >
                                                            Planejado
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-2 block text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                                    {option.description}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </section>
                        </div>

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                className="app-icon-control inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleExportReport}
                                disabled={isLoading || exportFormat === 'csv' || exportFormat === 'xlsx'}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ backgroundColor: 'var(--color-brand)' }}
                            >
                                <Download size={17} />
                                {exportFormat === 'pdf' ? 'Abrir PDF pronto' : 'Baixar HTML'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    )

}

