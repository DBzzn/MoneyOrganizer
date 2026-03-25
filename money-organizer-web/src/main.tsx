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
        <Toaster position='top-center' toastOptions={{
          style: {
            background: 'var(--color-bg-card)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          },
        }} />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
