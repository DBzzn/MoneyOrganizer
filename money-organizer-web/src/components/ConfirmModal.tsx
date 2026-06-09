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
}

export default function ConfirmModal({
    isOpen,
    message,
    onConfirm,
    onCancel,
    confirmLabel = 'Confirmar',
    secondaryAction,
}: ConfirmModalProps) {
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
            <div
                className="glass-heavy w-full max-w-sm p-5 shadow-xl sm:p-6"
                style={{
                    backgroundColor: 'var(--color-bg-modal)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '1rem',
                }}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Confirmação</h2>
                    <button onClick={onCancel}>
                        <X size={20} style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                </div>

                <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
                    {message}
                </p>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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

                    <button
                        onClick={onConfirm}
                        className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white sm:w-auto"
                        style={{ backgroundColor: '#ef4444' }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
