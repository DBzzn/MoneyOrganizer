import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import { PrivateRoute } from './components/PrivateRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Categories } from './pages/Categories'
import { Transactions } from './pages/Transactions'

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>

                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route
                        path="/dashboard" element={
                            <PrivateRoute>
                                <Dashboard />
                            </PrivateRoute>
                        }
                    />
                    <Route path="/categories" element={
                        <PrivateRoute>
                            <Categories />
                        </PrivateRoute>
                    }
                    />
                    <Route path="/transactions" element={
                        <PrivateRoute>
                            <Transactions />
                        </PrivateRoute>
                    }
                    />
                    <Route path="*" element={<Navigate to="/login" replace  />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}