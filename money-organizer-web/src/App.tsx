import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from 'react-router-dom'
import { PrivateRoute } from './components/PrivateRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Categories } from './pages/Categories'
import { Transactions } from './pages/Transactions'
import { Reports } from './pages/Reports'

export default function App() {
    return (
        <BrowserRouter>
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
                    <Route path="/reports" element={
                        <PrivateRoute>
                            <Reports />
                        </PrivateRoute>
                    }
                    />
                    <Route path="*" element={<Navigate to="/login" replace  />} />
                </Routes>
        </BrowserRouter>
    )
}