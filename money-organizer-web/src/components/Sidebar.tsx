import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
    LayoutDashboard,
    Tag,
    ArrowLeftRight,
    LogOut,
    NotebookPen,
    Sun,
    Moon,
    CircleDollarSign,
    WalletCards,
    PanelLeftClose,
    PanelLeftOpen
} from "lucide-react";
import { useAuth } from "../contexts/useAuth";
import { useTheme } from '../contexts/useTheme'

interface SidebarProps {
    isOpen: boolean,
    isMobile: boolean,
    onNavigate: () => void,
    onToggle: () => void
}

const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, Label: 'Dashboard' },
    { to: '/accounts', icon: WalletCards, Label: 'Contas' },
    { to: '/categories', icon: Tag, Label: 'Categorias' },
    { to: '/transactions', icon: ArrowLeftRight, Label: 'Transações' },
    { to: '/reports', icon: NotebookPen, Label: 'Relatórios' },
]
function getGreeting(name: string): string {

    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay()
    const isWkd = day === 0 || day === 6
    const firstName = name.split(' ')[0] //provalmente o usuário não vai colocar o nome completo, talvez isso aqui de um ERRO

    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
    const messages: Record<string, string[]> = {
        dawn: [`Ainda acordado, ${firstName}? 🦉`, `Madrugada produtiva, ${firstName}? ☕`, `O sono pode esperar, ${firstName}? 😴`],
        morningWeekday: [`Bom dia, ${firstName}. Vamos focar! 💼`, `Bom dia, ${firstName}! Grande dia pela frente. 🎯`, `Bom dia, ${firstName}. Café na mão? ☕`],
        morningWeekend: [`Bom dia, ${firstName}! Curtindo o fim de semana? 😎`, `Bom dia, ${firstName}! Merece descansar hoje. 🛋️`],
        afternoon: [`Boa tarde, ${firstName}! 😄`, `Boa tarde, ${firstName}! Como está o dia? ☀️`, `Boa tarde, ${firstName}! Quase lá. 💪`],
        evening: [`Boa noite, ${firstName}! 🌙`, `Boa noite, ${firstName}! Revisando as finanças? 📊`, `Boa noite, ${firstName}. Finalize o dia bem. ✨`],
    }

    if (hour < 6) return pick(messages.dawn)
    if (hour < 12) return pick(isWkd ? messages.morningWeekend : messages.morningWeekday)
    if (hour < 18) return pick(messages.afternoon)
    else return pick(messages.evening)
}

export function Sidebar({ isOpen, isMobile, onNavigate, onToggle }: SidebarProps) {
    const { isDark, toggleTheme } = useTheme()
    const { signOut, user } = useAuth()
    const [hoveringTheme, setHoveringTheme] = useState(false)
    const navigate = useNavigate()
    const greeting = useMemo(() => {
        const storedName = localStorage.getItem('username') ?? 'usuário'
        return getGreeting(user?.name ?? storedName)
    }, [user?.name])

    useEffect(() => {
        if (user) {
            localStorage.setItem('username', user.name)
        }
    }, [user])
    const handleSignOut = () => {
        signOut()
        navigate('/login')
    }


    return (
        <>
            {isMobile && !isOpen && (
                <div
                    className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-2xl p-1.5 glass"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                    }}
                >
                    <button
                        type="button"
                        aria-label="Expandir menu"
                        title="Expandir menu"
                        onClick={onToggle}
                        className="app-icon-control flex h-10 w-10 items-center justify-center rounded-xl"
                    >
                        <PanelLeftOpen size={18} />
                    </button>
                    <div className="mx-1 w-px shrink-0" style={{ backgroundColor: 'var(--color-border)' }} />

                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            aria-label={item.Label}
                            title={item.Label}
                            onClick={onNavigate}
                            className="nav-item flex h-10 w-10 items-center justify-center rounded-xl transition"
                        >
                            <item.icon size={18} />
                        </NavLink>
                    ))}
                </div>
            )}

            {!isMobile && !isOpen && ( //toggle Sidebar
                <button
                    type="button"
                    aria-label="Expandir menu"
                    title="Expandir menu"
                    onClick={onToggle}
                    className="fixed bottom-4 left-4 z-50 p-2 rounded-lg transition glass"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)'
                    }}
                >
                    <PanelLeftOpen size={20} />
                </button>
            )}

            <aside
                className="fixed left-0 top-0 z-50 flex h-screen w-64 max-w-[calc(100vw-2rem)] flex-col transition-transform duration-300 ease-in-out glass"
                style={{
                    backgroundColor: 'var(--color-bg-sidebar)',
                    borderRight: '1px solid var(--color-border)',
                    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                }}
            >
                <div className="flex items-start justify-between gap-3 p-6"
                    style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="min-w-0">
                        <div
                            className="flex items-center gap-2"
                            aria-label="Money Organizer"
                            style={{ color: 'var(--color-brand)' }}
                        >
                            <CircleDollarSign size={34} className="shrink-0" strokeWidth={2.3} />
                            <div className="text-xl font-bold leading-tight">
                                <span className="block whitespace-nowrap">Money</span>
                                <span className="block whitespace-nowrap">Organizer</span>
                            </div>
                        </div>
                        {(
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                {greeting}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Recolher menu"
                        title="Recolher menu"
                        onClick={onToggle}
                        className="app-icon-control flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    >
                        <PanelLeftClose size={18} />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-1" >
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={onNavigate}
                            className={`nav-item flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition`}
                        >
                            <item.icon size={18} />
                            {item.Label}
                        </NavLink>
                    ))}
                </nav>

                <div className="px-4 pb-2">
                    <button
                        onClick={toggleTheme}
                        onMouseEnter={() => setHoveringTheme(true)}
                        onMouseLeave={() => setHoveringTheme(false)}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition w-full"
                        style={{
                            backgroundColor: hoveringTheme
                                ? isDark ? '#f1f5f9' : '#1e293b'
                                : 'transparent',
                            color: hoveringTheme
                                ? isDark ? '#1e293b' : '#f1f5f9'
                                : 'var(--color-text-muted)',
                        }}
                    >
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                        {isDark ? 'Tema Claro' : 'Tema Escuro'}
                    </button>
                </div>

                <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <button
                        onClick={handleSignOut}
                        className="btn-signout flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition w-full"
                    >
                        <LogOut size={18} />
                        Sair
                    </button>
                </div>
            </aside>
        </>
    )
}
