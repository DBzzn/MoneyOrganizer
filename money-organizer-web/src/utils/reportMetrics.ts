export type FinancialHealthTone = 'green' | 'blue' | 'yellow' | 'red'

export type FinancialHealth = {
    label: string
    description: string
    tone: FinancialHealthTone
}

type ReserveMetricsInput = {
    averageExpenses: number
    currentCashBalance: number
    evolutionMonthCount: number
    periodBalance: number
    reserveTargetMonths: number
}

export type ReserveMetrics = {
    cashCoverageMonths: number | null
    reserveCoverageRatio: number | null
    reserveGap: number | null
    reserveTargetAmount: number | null
    monthsToReserveTarget: number | null
}

export function calculateReserveMetrics({
    averageExpenses,
    currentCashBalance,
    evolutionMonthCount,
    periodBalance,
    reserveTargetMonths,
}: ReserveMetricsInput): ReserveMetrics {
    const cashCoverageMonths = averageExpenses > 0 ? Math.max(0, currentCashBalance / averageExpenses) : null
    const reserveTargetAmount = averageExpenses > 0 ? averageExpenses * reserveTargetMonths : null
    const reserveGap = reserveTargetAmount === null ? null : Math.max(0, reserveTargetAmount - currentCashBalance)
    const averageMonthlySurplus = evolutionMonthCount > 0 ? periodBalance / evolutionMonthCount : 0
    const monthsToReserveTarget = reserveGap === null
        ? null
        : reserveGap === 0
            ? 0
            : averageMonthlySurplus > 0
                ? reserveGap / averageMonthlySurplus
                : null
    const reserveCoverageRatio = cashCoverageMonths === null
        ? null
        : cashCoverageMonths / reserveTargetMonths

    return {
        cashCoverageMonths,
        monthsToReserveTarget,
        reserveCoverageRatio,
        reserveGap,
        reserveTargetAmount,
    }
}

type FinancialHealthScoreInput = {
    cashCoverageMonths: number | null
    categoryTotalAmount: number
    negativeAccountCount: number
    periodBalance: number
    projectedNegativeMonthCount: number
    reserveCoverageRatio: number | null
    savingsRate: number
    topCategoryShare: number
}

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)))
}

export function calculateFinancialHealthScore({
    cashCoverageMonths,
    categoryTotalAmount,
    negativeAccountCount,
    periodBalance,
    projectedNegativeMonthCount,
    reserveCoverageRatio,
    savingsRate,
    topCategoryShare,
}: FinancialHealthScoreInput): number {
    return clampScore(
        50 +
        (periodBalance >= 0 ? 10 : -12) +
        (savingsRate >= 20 ? 18 : savingsRate >= 10 ? 12 : savingsRate >= 0 ? 4 : -16) +
        (reserveCoverageRatio === null ? 0 : reserveCoverageRatio >= 1 ? 18 : reserveCoverageRatio >= 0.5 ? 12 : cashCoverageMonths !== null && cashCoverageMonths >= 1 ? 4 : -14) +
        (topCategoryShare > 50 ? -10 : topCategoryShare > 35 ? -5 : categoryTotalAmount > 0 ? 5 : 0) +
        (negativeAccountCount > 0 ? -8 : 3) +
        (projectedNegativeMonthCount > 0 ? -10 : 4),
    )
}

export function getFinancialHealth(score: number): FinancialHealth {
    if (score >= 80) {
        return {
            label: 'Excelente',
            description: 'Boa combinação entre sobra, caixa e previsibilidade.',
            tone: 'green',
        }
    }

    if (score >= 65) {
        return {
            label: 'Saudável',
            description: 'Base positiva, mas ainda vale monitorar concentração e projeção.',
            tone: 'blue',
        }
    }

    if (score >= 45) {
        return {
            label: 'Atenção',
            description: 'Existem sinais de aperto ou dependência de poucos pontos do orçamento.',
            tone: 'yellow',
        }
    }

    return {
        label: 'Crítico',
        description: 'Priorize caixa, cortes recorrentes e revisão de pendências.',
        tone: 'red',
    }
}
