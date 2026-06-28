import { useState, type CSSProperties } from 'react'
import { ChevronDown, CircleDollarSign, X, type LucideIcon } from 'lucide-react'
import { STORED_ICON_GROUPS, getStoredIconLabel, getStoredIconOption } from './storedIconRegistry'

interface StoredIconProps {
    value?: string | null
    fallback?: LucideIcon
    size?: number
    className?: string
    style?: CSSProperties
}

export function StoredIcon({
    value,
    fallback: FallbackIcon = CircleDollarSign,
    size = 20,
    className,
    style,
}: StoredIconProps) {
    const option = getStoredIconOption(value)

    if (option) {
        const Icon = option.icon
        return <Icon aria-hidden="true" className={className} size={size} style={style} />
    }

    return <FallbackIcon aria-hidden="true" className={className} size={size} style={style} />
}

interface StoredIconPickerProps {
    value?: string
    onChange: (value: string) => void
    fallback?: LucideIcon
}

export function StoredIconPicker({
    value,
    onChange,
    fallback,
}: StoredIconPickerProps) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="relative space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="app-control flex h-11 min-w-0 items-center justify-between gap-3 text-left"
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: 'var(--color-bg)' }}
                        >
                            <StoredIcon value={value} fallback={fallback} size={17} />
                        </span>
                        <span className="truncate text-sm">{getStoredIconLabel(value)}</span>
                    </span>
                    <ChevronDown size={16} className={`shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                <button
                    type="button"
                    aria-label="Limpar ícone"
                    title="Limpar ícone"
                    onClick={() => onChange('')}
                    className="app-icon-control flex h-11 w-11 items-center justify-center rounded-lg"
                >
                    <X size={16} />
                </button>
            </div>

            {isOpen && (
                <div
                    className="app-popover z-50 mt-2 max-h-40 w-[min(360px,calc(100vw-4.5rem))] overflow-y-auto rounded-xl p-3"
                    style={{ left: 0, top: '100%'}}
                >
                    {STORED_ICON_GROUPS.map((group) => (
                        <div key={group.label} className="mb-4 last:mb-0">
                            <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                {group.label}
                            </p>
                            <div className="grid grid-cols-6 gap-1.5">
                                {group.options.map((option) => {
                                    const Icon = option.icon
                                    const isSelected = value === option.value

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-label={option.label}
                                            title={option.label}
                                            onClick={() => {
                                                onChange(option.value)
                                                setIsOpen(false)
                                            }}
                                            className="app-icon-control flex h-10 w-10 items-center justify-center rounded-lg transition"
                                            style={{
                                                borderColor: isSelected ? 'var(--color-brand)' : 'var(--color-input-border)',
                                                color: isSelected ? 'var(--color-brand)' : 'var(--color-text)',
                                            }}
                                        >
                                            <Icon size={18} />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
