import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Tag,
  ArrowLeftRight,
  LogOut,
  NotebookPen,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../contexts/useAuth";
import { useTheme } from '../contexts/useTheme'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, Label: 'Dashboard' },
  { to: '/categories', icon: Tag, Label: 'Categorias' },
  { to: '/transactions', icon: ArrowLeftRight, Label: 'Transações' },
  { to: '/reports', icon: NotebookPen, Label: 'Relatórios' },
]

export function Sidebar() {
  const { isDark, toggleTheme } = useTheme()
  const { signOut, user } = useAuth()
  const [hoveringTheme, setHoveringTheme] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  return (
    <aside
      className="w-64 flex flex-col min-h-screen"
      style={{ backgroundColor: 'var(--color-bg-card)', borderRight: '1px solid var(--color-border)' }}
    >
      <div className="p-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h1 className="text-xl font-bold text-blue-600">💰 MoneyOrganizer</h1>
        <p className="text-sm mt-1 truncate" style={{ color: 'var(--color-text-muted)' }}>{user?.name}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-blue-50 hover:text-blue-600'
              }`
            }
            style={({ isActive }) => ({ color: isActive ? undefined : 'var(--color-text-muted)' })}
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
  )
}