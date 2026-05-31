import type { ReactNode } from 'react'
import type { TooltipContentProps, TooltipValueType } from 'recharts'

type TooltipName = string | number

interface ChartTooltipProps extends Partial<TooltipContentProps<TooltipValueType, TooltipName>> {
    showPercentage?: boolean
    total?: number
    valueFormatter?: (value: number) => string
}

function valueToNumber(value: TooltipValueType | undefined): number {
    if (Array.isArray(value)) {
        return value.reduce((sum, item) => sum + Number(item), 0)
    }

    return Number(value ?? 0)
}

function renderName(name: TooltipName | undefined, fallback: ReactNode): ReactNode {
    return name ?? fallback
}

function renderFallbackName(dataKey: unknown): ReactNode {
    if (typeof dataKey === 'string' || typeof dataKey === 'number') {
        return dataKey
    }

    return 'Valor'
}

export function ChartTooltip({
    active,
    payload,
    label,
    showPercentage = false,
    total = 0,
    valueFormatter,
}: ChartTooltipProps) {
    if (!active || !payload?.length) {
        return null
    }

    return (
        <div
            className="rounded-xl px-3 py-2 shadow-lg"
            style={{
                backgroundColor: 'var(--color-bg-solid)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                minWidth: 160,
            }}
        >
            {label && (
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                    {label}
                </p>
            )}

            <div className="space-y-1.5">
                {payload.map((item) => {
                    const value = valueToNumber(item.value)
                    const percentage = total > 0 ? (value / total) * 100 : 0
                    const color = item.color ?? item.fill ?? item.stroke ?? 'var(--color-text-muted)'

                    return (
                        <div key={`${item.dataKey ?? item.name}`} className="flex items-center justify-between gap-4 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>
                                    {renderName(item.name, renderFallbackName(item.dataKey))}
                                </span>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
                                    {valueFormatter ? valueFormatter(value) : value}
                                </p>
                                {showPercentage && (
                                    <p style={{ color: 'var(--color-text-muted)' }}>
                                        {percentage.toFixed(1)}%
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
