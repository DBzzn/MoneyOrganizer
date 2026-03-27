import { X } from 'lucide-react'

interface ConfirmModalProps {
    isOpen: boolean
    message: string
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmModal ({
    isOpen,
    message,
    onConfirm,
    onCancel,
} : ConfirmModalProps) {
    if(!isOpen) return null
    return (
        <div
            className='fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm'
            style={{backgroundColor: 'rgba(0,0,0,0.6'}}
        >
            <div
                className='rounded-x1 shadow-x1 p-6 w-full max-w-sm'
                style={{
                    backgroundColor: 'var(--color-bg-modal)',
                    color: 'var(--color-text)',
                    border: '2px var(--color-border)',
                    borderRadius: '1rem',                  
                }}
            > 

            <div className='flex justify-between items-center mb-4'>
                <h2 className='text-lg font-semibold'>Confirmação</h2>
                <button onClick={onCancel}>
                    <X size={20} style={{ color:'var(--color-text-muted)'}} />
                </button>
            </div>

            <p className='mb-6' style={{ color:'var(--color-text-muted)'}}>
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
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: '#ef4444' }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}