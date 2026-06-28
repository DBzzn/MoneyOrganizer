import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthProvider'
import { ThemeProvider } from './contexts/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
        <Toaster
          position='top-center'
          gutter={10}
          containerClassName='app-toast-viewport'
          containerStyle={{
            position: 'fixed',
            top: 'max(1rem, env(safe-area-inset-top))',
            left: 0,
            right: 0,
            height: 0,
            overflow: 'visible',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          toastOptions={{
            style: {
              background: 'var(--color-bg-card)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
              pointerEvents: 'auto',
            },
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
