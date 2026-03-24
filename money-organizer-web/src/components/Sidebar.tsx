import { NavLink, useNavigate } from "react-router-dom";
import { 
    LayoutDashboard,
    Tag,
    ArrowLeftRight,
    LogOut,
    NotebookPen,
 } from "lucide-react";
import { useAuth } from "../contexts/useAuth";

 const navItems = [
    {to: '/dashboard', icon: LayoutDashboard, Label: 'Dashboard'},
    {to: '/categories', icon: Tag, Label: 'Categorias'},
    {to: '/transactions', icon: ArrowLeftRight, Label: 'Transações'},
    {to: '/reports', icon: NotebookPen, Label: 'Relatórios'},
 ]

 export function Sidebar() {
    const {signOut, user} = useAuth()
    const navigate = useNavigate()

    const handleSignOut = () => {
        signOut()
        navigate('/login')
    }

    return (
         <aside className="w-64 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-blue-600">💰 MoneyOrganizer</h1>
        <p className="text-sm text-gray-500 mt-1 truncate">{user?.name}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon size={18} />
            {item.Label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition w-full"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </aside>
  )
 }