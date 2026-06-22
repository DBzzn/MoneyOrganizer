import { lazy, Suspense } from 'react'
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from 'react-router-dom'
import { PrivateRoute } from './components/PrivateRoute'

const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })))
const Register = lazy(() => import('./pages/Register').then((module) => ({ default: module.Register })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })))
const Categories = lazy(() => import('./pages/Categories').then((module) => ({ default: module.Categories })))
const Transactions = lazy(() => import('./pages/Transactions').then((module) => ({ default: module.Transactions })))
const Transfers = lazy(() => import('./pages/Transfers').then((module) => ({ default: module.Transfers })))
const Reports = lazy(() => import('./pages/Reports').then((module) => ({ default: module.Reports })))
const FinancialAccounts = lazy(() => import('./pages/FinancialAccounts').then((module) => ({ default: module.FinancialAccounts })))
const Reminders = lazy(() => import('./pages/Reminders').then((module) => ({ default: module.Reminders })))
const StatementImports = lazy(() => import('./pages/StatementImports').then((module) => ({ default: module.StatementImports })))

function RouteLoading() {
    return (
        <div className="flex min-h-screen items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
            Carregando...
        </div>
    )
}

export default function App() {
    return (
        <BrowserRouter>
            <Suspense fallback={<RouteLoading />}>
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
                    <Route path="/accounts" element={
                        <PrivateRoute>
                            <FinancialAccounts />
                        </PrivateRoute>
                    }
                    />
                    <Route path="/transactions" element={
                        <PrivateRoute>
                            <Transactions />
                        </PrivateRoute>
                    }
                    />
                    <Route path="/transfers" element={
                        <PrivateRoute>
                            <Transfers />
                        </PrivateRoute>
                    }
                    />
                    <Route path="/reminders" element={
                        <PrivateRoute>
                            <Reminders />
                        </PrivateRoute>
                    }
                    />
                    <Route path="/statement-imports" element={
                        <PrivateRoute>
                            <StatementImports />
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
            </Suspense>
        </BrowserRouter>
    )
}
