export function formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(Number(value))
}

export function formatMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric'})
}

export function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR')
}

export function buildAccountIdsParam(
    selectedAccountIds: string[],
    allAccountCount: number,
): string | undefined {
    if (
        allAccountCount === 0 ||
        selectedAccountIds.length === 0 ||
        selectedAccountIds.length === allAccountCount
    ) {
        return undefined
    }

    return selectedAccountIds.join(',')
}

export function transactionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        CREDIT_CASH: 'Crédito a vista',
        CREDIT_INSTALLMENT: 'Crédito parcelado',
        DEBIT: 'Débito',
        PIX: 'Pix',
        CASH: 'Dinheiro',
        INCOME: 'Receita'
    }
    return labels[type] ?? type
}
