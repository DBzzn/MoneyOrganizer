import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
    LayoutDashboard,
    Tag,
    ArrowLeftRight,
    Bell,
    FileUp,
    Repeat2,
    LogOut,
    NotebookPen,
    Sun,
    Moon,
    CircleDollarSign,
    WalletCards,
    PanelLeftClose,
    PanelLeftOpen,
    Settings
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
    { to: '/transfers', icon: Repeat2, Label: 'Transferências' },
    { to: '/reminders', icon: Bell, Label: 'Lembretes' },
    { to: '/statement-imports', icon: FileUp, Label: 'Importar' },
    { to: '/settings', icon: Settings, Label: 'Configurações' },
    { to: '/reports', icon: NotebookPen, Label: 'Relatórios' },
]

const routeKeys = ['/dashboard', '/accounts', '/categories', '/transactions', '/transfers', '/reminders', '/statement-imports', '/reports', '/settings'] as const

type RouteKey = typeof routeKeys[number] | 'default'
type TimeBucket = 'dawn' | 'morningWeekday' | 'morningWeekend' | 'afternoon' | 'evening'

const timeMessages: Record<TimeBucket, string[]> = {
    dawn: [
        'Virou tarde, {name}. Só o essencial.',
        'Madrugada pede leveza, {name}.',
        '{name}, ajuste pequeno e mente quieta.',
        'Sem heroísmo agora, {name}.',
        'Extrato em paz, sono também.',
    ],
    morningWeekday: [
        'Bom dia, {name}. Clareza antes do caos.',
        'Começa simples, {name}.',
        'Seu eu de amanhã agradece.',
        'Café, conta, calma.',
        'Hoje dá para trocar chute por mapa.',
    ],
    morningWeekend: [
        'De leve, {name}. Ainda é fim de semana.',
        'Paz no descanso, paz no saldo.',
        'Uma olhada honesta e vida que segue.',
        'Entender sem se cobrar demais.',
        '{name}, abre só para aliviar.',
    ],
    afternoon: [
        'Boa tarde, {name}. Ajuste fino.',
        'Conferida rápida, menos "ué".',
        'Arrumar sem exagerar.',
        'Um detalhe muda o desenho.',
        'Sem culpa, {name}. Só próximo passo.',
    ],
    evening: [
        'Boa noite, {name}. Menos pendências.',
        'O saldo só precisa de contexto.',
        'Revisão curta, cabeça leve.',
        'Nada de resolver tudo hoje.',
        'Verdade, calma e salvar.',
    ],
}

const pageNudges: Record<RouteKey, string[]> = {
    '/dashboard': [
        'O mapa está aberto.',
        'Atenção, não culpa.',
        'Resumo bom reduz abas mentais.',
        'O maior ruído começa primeiro.',
        'Decisão melhor, menos chute.',
    ],
    '/accounts': [
        'Saldo bom fala sem rodeio.',
        'Cada conta no seu canto.',
        'Origem também conta história.',
        'Confie na base antes do plano.',
        'Menos névoa no orçamento.',
    ],
    '/categories': [
        'Categoria boa responde "em quê?".',
        'Arquivado sai da frente, não da história.',
        'Nome certo, relatório menos torto.',
        'Categorias são a legenda do mês.',
        'Quando encaixa, vira clareza.',
    ],
    '/transactions': [
        'Cada lançamento deixa uma pista.',
        'O contexto manda.',
        'Você dá significado ao extrato.',
        'Evite arqueologia financeira.',
        'Memória otimista não fecha conta.',
    ],
    '/transfers': [
        'Transferência bem marcada evita gasto fantasma.',
        'Dinheiro muda de lugar sem mistério.',
        'Origem e destino limpam o saldo.',
        'Movimento não precisa virar bagunça.',
        'Ponte entre contas não é despesa.',
    ],
    '/reminders': [
        'Vencimento lembrado vira escolha.',
        'Pendência boa tem data e contexto.',
        'Anota antes de virar susto.',
        'Lembrete não mexe no saldo, mexe na clareza.',
        'O futuro fica menos nebuloso aqui.',
    ],
    '/statement-imports': [
        'Extrato vira rascunho antes de virar conta.',
        'Importar com revisão preserva o saldo.',
        'Arquivo primeiro, decisão depois.',
        'Nada entra no saldo sem passar pelos seus olhos.',
        'O banco trouxe dados, você traz contexto.',
    ],
    '/reports': [
        'Relatório revela padrão.',
        'Tendência antes de impulso.',
        'Mês bem contado fala melhor.',
        'Vida real não fecha igual planilha.',
        'Do achismo para o chão.',
    ],
    '/settings': [
        'Preferencia boa reduz atrito.',
        'O app também precisa caber em você.',
        'Controle pequeno, rotina melhor.',
        'Regra clara evita surpresa.',
        'Ajuste fino sem mexer no saldo.',
    ],
    default: [
        'Pequeno ajuste, cabeça leve.',
        'Nome e lugar para o dinheiro.',
        'Organização boa facilita amanhã.',
        'Registro honesto muda a conversa.',
        'Um item por vez.',
    ],
}

function getFirstName(name: string): string {
    const [firstName] = name.trim().split(/\s+/)
    return firstName || 'usuário'
}

function getTimeBucket(now: Date): TimeBucket {
    const hour = now.getHours()
    const day = now.getDay()
    const isWeekend = day === 0 || day === 6

    if (hour < 6) return 'dawn'
    if (hour < 12) return isWeekend ? 'morningWeekend' : 'morningWeekday'
    if (hour < 18) return 'afternoon'
    return 'evening'
}

function getRouteKey(pathname: string): RouteKey {
    return routeKeys.find((route) => pathname.startsWith(route)) ?? 'default'
}

function getLocalDayKey(now: Date): string {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

function hashString(value: string): number {
    let hash = 0

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0
    }

    return hash
}

function pickStable(messages: string[], seed: string): string {
    return messages[hashString(seed) % messages.length]
}

function formatMessage(message: string, firstName: string): string {
    return message.replace(/\{name\}/g, firstName)
}

function getSidebarGreeting(name: string, pathname: string): string {
    const now = new Date()
    const firstName = getFirstName(name)
    const routeKey = getRouteKey(pathname)
    const timeBucket = getTimeBucket(now)
    const hourBlock = Math.floor(now.getHours() / 3)
    const seed = `${firstName}|${routeKey}|${getLocalDayKey(now)}|${hourBlock}`
    const opener = formatMessage(pickStable(timeMessages[timeBucket], `${seed}|time`), firstName)
    const nudge = pickStable(pageNudges[routeKey], `${seed}|page`)

    return `${opener} ${nudge}`
}

export function Sidebar({ isOpen, isMobile, onNavigate, onToggle }: SidebarProps) {
    const { isDark, toggleTheme } = useTheme()
    const { signOut, user } = useAuth()
    const [hoveringTheme, setHoveringTheme] = useState(false)
    const [isDraggingMobileNav, setIsDraggingMobileNav] = useState(false)
    const mobileNavRef = useRef<HTMLDivElement | null>(null)
    const wasMobileNavDraggingRef = useRef(false)
    const mobileNavDragRef = useRef({
        active: false,
        pointerId: 0,
        startX: 0,
        scrollLeft: 0,
    })
    const navigate = useNavigate()
    const location = useLocation()
    const greeting = useMemo(() => {
        const storedName = localStorage.getItem('username') ?? 'usuário'
        return getSidebarGreeting(user?.name ?? storedName, location.pathname)
    }, [location.pathname, user?.name])

    useEffect(() => {
        if (user) {
            localStorage.setItem('username', user.name)
        }
    }, [user])

    useEffect(() => {
        if (!isMobile || isOpen) return

        const activeItem = mobileNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
        activeItem?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }, [isMobile, isOpen, location.pathname])

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
    }

    const handleMobileNavPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) {
            wasMobileNavDraggingRef.current = false
            return
        }

        const nav = mobileNavRef.current
        if (!nav) return

        mobileNavDragRef.current = {
            active: true,
            pointerId: event.pointerId,
            startX: event.clientX,
            scrollLeft: nav.scrollLeft,
        }
        wasMobileNavDraggingRef.current = false
        setIsDraggingMobileNav(true)
        nav.setPointerCapture(event.pointerId)
    }

    const handleMobileNavPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const drag = mobileNavDragRef.current

        if (!drag.active || drag.pointerId !== event.pointerId || !mobileNavRef.current) return

        const deltaX = event.clientX - drag.startX

        if (Math.abs(deltaX) > 4) {
            wasMobileNavDraggingRef.current = true
            event.preventDefault()
        }

        mobileNavRef.current.scrollLeft = drag.scrollLeft - deltaX
    }

    const stopMobileNavDrag = (event: PointerEvent<HTMLDivElement>) => {
        const drag = mobileNavDragRef.current

        if (!drag.active || drag.pointerId !== event.pointerId) return

        mobileNavDragRef.current = {
            active: false,
            pointerId: 0,
            startX: 0,
            scrollLeft: 0,
        }
        setIsDraggingMobileNav(false)

        if (mobileNavRef.current?.hasPointerCapture(event.pointerId)) {
            mobileNavRef.current.releasePointerCapture(event.pointerId)
        }
    }


    return (
        <>
            {isMobile && !isOpen && (
                <div
                    className="fixed bottom-3 left-1/2 z-50 flex w-[min(calc(100vw-1.5rem),17rem)] -translate-x-1/2 items-center gap-2 overflow-hidden rounded-[1.35rem] p-1.5 shadow-xl glass"
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
                        className="app-icon-control flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    >
                        <PanelLeftOpen size={22} />
                    </button>

                    <div
                        ref={mobileNavRef}
                        role="navigation"
                        aria-label="Navegação principal"
                        onPointerDown={handleMobileNavPointerDown}
                        onPointerMove={handleMobileNavPointerMove}
                        onPointerUp={stopMobileNavDrag}
                        onPointerCancel={stopMobileNavDrag}
                        onClickCapture={(event) => {
                            if (!wasMobileNavDraggingRef.current) return

                            event.preventDefault()
                            event.stopPropagation()
                            wasMobileNavDraggingRef.current = false
                        }}
                        className={`mobile-bottom-nav-scroll flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-smooth px-1 pb-1 pt-1 select-none ${
                            isDraggingMobileNav ? 'cursor-grabbing' : 'cursor-grab'
                        } min-w-0 flex-1`}
                    >
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                aria-label={item.Label}
                                title={item.Label}
                                onClick={onNavigate}
                                className="nav-item flex h-14 w-14 shrink-0 snap-center items-center justify-center rounded-2xl transition"
                            >
                                <item.icon size={22} />
                            </NavLink>
                        ))}
                    </div>
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
                            <p className="mt-2 text-sm leading-5" style={{ color: 'var(--color-text-muted)' }}>
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
