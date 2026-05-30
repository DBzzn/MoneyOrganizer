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
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
            <div
                className="glass-heavy shadow-xl p-6 w-full max-w-sm"
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

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
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
                            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                            style={{ backgroundColor: '#f97316' }}
                        >
                            {secondaryAction.label}
                        </button>
                    )}

                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ backgroundColor: '#ef4444' }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}