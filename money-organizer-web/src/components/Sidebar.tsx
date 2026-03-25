import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Tag,
  ArrowLeftRight,
  LogOut,
  NotebookPen,
  Sun,
  Moon,
  Menu
} from "lucide-react";
import { useAuth } from "../contexts/useAuth";
import { useTheme } from '../contexts/useTheme'

interface SidebarProps {
  isOpen: boolean,
  onToggle: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, Label: 'Dashboard' },
  { to: '/categories', icon: Tag, Label: 'Categorias' },
  { to: '/transactions', icon: ArrowLeftRight, Label: 'Transações' },
  { to: '/reports', icon: NotebookPen, Label: 'Relatórios' },
]
function getGreeting(name: string): string {
  console.log(name)
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

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { isDark, toggleTheme } = useTheme()
  const [ greeting, setGreeting ] = useState('')
  const { signOut, user } = useAuth()
  const [ hoveringTheme, setHoveringTheme ] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (user && !greeting) {
      setGreeting(getGreeting(user.name))
    } else {
      setGreeting(getGreeting("CAMPEÃO"))
    }
  }, [user])
  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  return (
    <>
      {!isOpen && ( //toggle Sidebar
        <button
          onClick={onToggle}
          className="fixed bottom-4 left-4 z-50 p-2 rounded-lg transition"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)'
          }}
        >
          <Menu size={20} />        
        </button>        
      )}

      <aside
        className="w-64 flex flex-col h-screen fixed top-0 left-0 transition-transform duration-300 ease-in-out"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          borderRight: '1px solid var(--color-border)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >        
        <div className="p-6 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <button
              onClick={onToggle}
              className="text-xl font-bold text-blue-600 hover:opacity-80 transition cursor-pointer"
            >
              💰 MoneyOrganizer
            </button>
            {user && (
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {greeting}
              </p>
            )}
          </div>
        </div>
            
        <nav className="flex-1 p-4 space-y-1" > 
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition w-full hover:bg-red-50 hover:text-red-600"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}