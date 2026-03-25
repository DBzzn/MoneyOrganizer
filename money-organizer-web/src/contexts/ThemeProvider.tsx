import { useState, useEffect } from 'react'
import { ThemeContext } from '../contexts/ThemeContext'

interface Props {
    children: React.ReactNode
}

export function ThemeProvider({ children }: Props) {
    const [isDark, setIsDark] = useState<boolean>(() => {
        const stored = localStorage.getItem('theme')
        return stored === 'dark'
    })

    useEffect(() => {
        const root = document.documentElement
        if (isDark) {
            root.classList.add('dark')
            localStorage.setItem('theme', 'dark')
        } else {
            root.classList.remove('dark')
            localStorage.setItem('theme', 'light')
        }
    }, [isDark])

    function toggleTheme() {
        setIsDark(prev => !prev)
    }

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}