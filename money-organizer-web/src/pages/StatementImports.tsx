import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { toast } from 'react-hot-toast'
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    FileSearch,
    FileUp,
    Fingerprint,
    Landmark,
    Upload,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { getFinancialAccounts } from '../api/financialAccounts'
import { previewStatementImport } from '../api/statementImports'
import type { FinancialAccount, StatementImportPreview, StatementMovementDirection } from '../types'
import { formatCurrency, formatDate } from '../utils'

function centsToCurrency(cents?: number): string {
    return formatCurrency((cents ?? 0) / 100)
}

function formatPeriod(preview: StatementImportPreview): string {
    if (!preview.periodStart || !preview.periodEnd) {
        return 'Periodo nao identificado'
    }

    return `${formatDate(preview.periodStart)} a ${formatDate(preview.periodEnd)}`
}

function directionLabel(direction: StatementMovementDirection): string {
    return direction === 'IN' ? 'Entrada' : 'Saida'
}

function directionClass(direction: StatementMovementDirection): string {
    return direction === 'IN'
        ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-700'
}

function DirectionIcon({ direction }: { direction: StatementMovementDirection }) {
    const Icon = direction === 'IN' ? ArrowUpRight : ArrowDownRight
    const color = direction === 'IN' ? 'var(--color-income)' : 'var(--color-expense)'

    return <Icon size={16} style={{ color }} />
}

export function StatementImports() {
    const [accounts, setAccounts] = useState<FinancialAccount[]>([])
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<StatementImportPreview | null>(null)
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true)
    const [isUploading, setIsUploading] = useState(false)

    const activeAccounts = useMemo(
        () => accounts.filter((account) => !account.isArchived),
        [accounts],
    )
    const totalInCents = preview?.movements
        .filter((movement) => movement.direction === 'IN')
        .reduce((total, movement) => total + movement.amountCents, 0) ?? 0
    const totalOutCents = preview?.movements
        .filter((movement) => movement.direction === 'OUT')
        .reduce((total, movement) => total + movement.amountCents, 0) ?? 0

    useEffect(() => {
        let isActive = true

        setIsLoadingAccounts(true)
        getFinancialAccounts()
            .then((response) => {
                if (!isActive) return

                setAccounts(response.data)
                const firstActiveAccount = response.data.find((account) => !account.isArchived)
                setSelectedAccountId((current) => current || firstActiveAccount?.id || '')
            })
            .catch(() => {
                if (isActive) {
                    toast.error('Erro ao carregar contas.')
                }
            })
            .finally(() => {
                if (isActive) {
                    setIsLoadingAccounts(false)
                }
            })

        return () => {
            isActive = false
        }
    }, [])

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSelectedFile(event.target.files?.[0] ?? null)
        setPreview(null)
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (!selectedFile) {
            toast.error('Selecione um PDF de extrato.')
            return
        }

        try {
            setIsUploading(true)
            const response = await previewStatementImport(selectedFile, selectedAccountId || undefined)
            setPreview(response.data)
            toast.success('Preview gerado!')
        } catch {
            toast.error('Erro ao gerar preview do extrato.')
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <Layout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                        Importacao de extratos
                    </h1>
                    <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Preview auditavel de extratos antes de criar qualquer transacao.
                    </p>
                </div>

                <div
                    className="rounded-xl border p-4"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-muted-card)' }}
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 shrink-0" size={18} style={{ color: 'var(--color-brand)' }} />
                        <p className="text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
                            Esta etapa so le e normaliza o arquivo. O saldo e as transacoes reais ainda nao sao alterados.
                        </p>
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="glass rounded-2xl p-5"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                >
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_auto]">
                        <div>
                            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                                Conta destino
                            </label>
                            <select
                                value={selectedAccountId}
                                onChange={(event) => setSelectedAccountId(event.target.value)}
                                className="app-control"
                                disabled={isLoadingAccounts}
                            >
                                <option value="">Sem conta selecionada</option>
                                {activeAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                        {account.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                                Arquivo PDF
                            </label>
                            <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={handleFileChange}
                                className="app-control"
                            />
                        </div>

                        <div className="flex items-end">
                            <button
                                type="submit"
                                disabled={isUploading}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 lg:w-auto"
                            >
                                {isUploading ? <FileSearch size={16} /> : <Upload size={16} />}
                                {isUploading ? 'Lendo...' : 'Gerar preview'}
                            </button>
                        </div>
                    </div>
                </form>

                {!preview && (
                    <div
                        className="glass flex min-h-[12rem] flex-col items-center justify-center rounded-2xl p-6 text-center"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                    >
                        <FileUp size={34} style={{ color: 'var(--color-text-muted)' }} />
                        <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Envie um PDF Nubank para ver os movimentos normalizados antes de importar.
                        </p>
                    </div>
                )}

                {preview && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                                {
                                    label: 'Arquivo',
                                    value: preview.file.originalName,
                                    detail: `${(preview.file.size / 1024).toFixed(1)} KB`,
                                    icon: FileSearch,
                                },
                                {
                                    label: 'Periodo',
                                    value: formatPeriod(preview),
                                    detail: `${preview.provider} ${preview.sourceType}`,
                                    icon: Landmark,
                                },
                                {
                                    label: 'Entradas',
                                    value: centsToCurrency(totalInCents),
                                    detail: 'Movimentos do preview',
                                    icon: ArrowUpRight,
                                },
                                {
                                    label: 'Saidas',
                                    value: centsToCurrency(totalOutCents),
                                    detail: 'Movimentos do preview',
                                    icon: ArrowDownRight,
                                },
                            ].map((card) => (
                                <div
                                    key={card.label}
                                    className="glass flex min-h-[7rem] items-start gap-4 rounded-2xl p-5"
                                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                                >
                                    <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: 'var(--color-bg)' }}>
                                        <card.icon size={21} style={{ color: 'var(--color-brand)' }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{card.label}</p>
                                        <p className="break-words text-base font-bold leading-tight" style={{ color: 'var(--color-text)' }}>
                                            {card.value}
                                        </p>
                                        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{card.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div
                            className="glass rounded-2xl p-5"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                                        Movimentos identificados
                                    </h2>
                                    <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                        {preview.movements.length} movimentos prontos para revisao futura.
                                    </p>
                                </div>
                                <div className="flex min-w-0 items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    <Fingerprint size={14} className="shrink-0" />
                                    <span className="truncate">{preview.file.sha256}</span>
                                </div>
                            </div>

                            {preview.warnings.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {preview.warnings.map((warning) => (
                                        <p key={warning} className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
                                            {warning}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="mt-5 space-y-3 md:hidden">
                                {preview.movements.map((movement) => (
                                    <div
                                        key={movement.fingerprint}
                                        className="rounded-xl border p-4"
                                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                    {movement.rawType}
                                                </p>
                                                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatDate(movement.date)}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${directionClass(movement.direction)}`}>
                                                {directionLabel(movement.direction)}
                                            </span>
                                        </div>
                                        <p className="mt-3 break-words text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                            {movement.rawDescription || 'Sem descricao'}
                                        </p>
                                        <div className="mt-3 flex items-center justify-between gap-3">
                                            <DirectionIcon direction={movement.direction} />
                                            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                {centsToCurrency(movement.amountCents)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[860px]">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Data</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Tipo bruto</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Descricao</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Direcao</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.movements.map((movement) => (
                                            <tr key={movement.fingerprint} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td className="whitespace-nowrap px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatDate(movement.date)}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                                                    {movement.rawType}
                                                </td>
                                                <td className="max-w-md px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                                    <span className="line-clamp-2">{movement.rawDescription || '-'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${directionClass(movement.direction)}`}>
                                                        <DirectionIcon direction={movement.direction} />
                                                        {directionLabel(movement.direction)}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                                                    {centsToCurrency(movement.amountCents)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    )
}
