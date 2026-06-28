import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface SecondaryAction {
    label: string
    onClick: () => void
}

interface ConfirmModalProps {
    isOpen: boolean
    message: string
    onConfirm: () => void
    onCancel: () => void
    confirmLabel?: string
    secondaryAction?: SecondaryAction
    title?: string
    children?: ReactNode
    maxWidthClassName?: string
    confirmButtonClassName?: string
    confirmDisabled?: boolean
    confirmDisabledReason?: string
}

export default function ConfirmModal({
    isOpen,
    message,
    onConfirm,
    onCancel,
    confirmLabel = 'Confirmar',
    secondaryAction,
    title = 'Confirmação',
    children,
    maxWidthClassName = 'max-w-sm',
    confirmButtonClassName = 'bg-red-500 hover:bg-red-600',
    confirmDisabled = false,
    confirmDisabledReason,
}: ConfirmModalProps) {
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
            <div
                className={`glass-heavy flex max-h-[88vh] w-full flex-col ${maxWidthClassName} overflow-hidden p-5 shadow-xl sm:p-6`}
                style={{
                    backgroundColor: 'var(--color-bg-modal)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '1rem',
                }}
            >
                <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button onClick={onCancel}>
                        <X size={20} style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                </div>

                <div className="min-h-0 overflow-y-auto pr-1">
                    <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
                        {message}
                    </p>

                    {children}
                </div>

                <div className="mt-5 flex shrink-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        onClick={onCancel}
                        className="w-full px-4 py-2 rounded-lg text-sm font-medium sm:w-auto"
                        style={{
                            backgroundColor: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text)',
                        }}
                    >
                        Cancelar
                    </button>

                    {secondaryAction && (
                        <button
                            onClick={secondaryAction.onClick}
                            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white sm:w-auto"
                            style={{ backgroundColor: '#f97316' }}
                        >
                            {secondaryAction.label}
                        </button>
                    )}

                    <span
                        className="inline-flex w-full sm:w-auto"
                        title={confirmDisabled ? confirmDisabledReason : undefined}
                    >
                        <button
                            onClick={onConfirm}
                            disabled={confirmDisabled}
                            className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${confirmButtonClassName}`}
                        >
                            {confirmLabel}
                        </button>
                    </span>
                </div>
            </div>
        </div>
    )
}
