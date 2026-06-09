import { CheckSquare, SlidersHorizontal } from 'lucide-react'
import type { FinancialAccount } from '../types'

interface AccountFilterProps {
    accounts: FinancialAccount[]
    selectedAccountIds: string[]
    onChange: (accountIds: string[]) => void
    title?: string
}

export function AccountFilter({
    accounts,
    selectedAccountIds,
    onChange,
    title = 'Contas consideradas',
}: AccountFilterProps) {
    const accountIds = accounts.map((account) => account.id)
    const selectedCount = selectedAccountIds.length
    const allSelected = accounts.length > 0 && selectedCount === accounts.length

    const handleSelectAll = () => {
        onChange(accountIds)
    }

    const handleToggleAccount = (accountId: string) => {
        const isSelected = selectedAccountIds.includes(accountId)
        const nextAccountIds = isSelected
            ? selectedAccountIds.filter((id) => id !== accountId)
            : [...selectedAccountIds, accountId]

        if (nextAccountIds.length === 0) {
            return
        }

        onChange(nextAccountIds)
    }

    return (
        <div
            className="glass rounded-2xl p-4"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
        >
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal size={17} className="shrink-0" style={{ color: 'var(--color-brand)' }} />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {accounts.length === 0
                                ? 'Nenhuma conta cadastrada'
                                : allSelected
                                    ? 'Todas as contas'
                                    : `${selectedCount} de ${accounts.length} contas`}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={allSelected || accounts.length === 0}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 sm:w-auto"
                >
                    <CheckSquare size={15} />
                    Todas
                </button>
            </div>

            {accounts.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {accounts.map((account) => {
                        const isSelected = selectedAccountIds.includes(account.id)
                        const isOnlySelected = isSelected && selectedAccountIds.length === 1

                        return (
                            <label
                                key={account.id}
                                className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm"
                                style={{
                                    backgroundColor: isSelected ? 'var(--color-bg)' : 'transparent',
                                    border: '1px solid var(--color-border-soft)',
                                    color: 'var(--color-text)',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isOnlySelected}
                                    onChange={() => handleToggleAccount(account.id)}
                                    className="h-4 w-4 shrink-0 rounded"
                                />
                                <span className="min-w-0 truncate">
                                    {account.icon ? `${account.icon} ` : ''}{account.name}
                                    {account.isArchived ? ' (arquivada)' : ''}
                                </span>
                            </label>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
