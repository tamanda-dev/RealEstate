import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyResetCodePage from './pages/VerifyResetCodePage'
import Dashboard from './pages/Dashboard'
import PropertiesPage from './pages/PropertiesPage'
import PropertyDetailPage from './pages/PropertyDetailPage'
import RentPage from './pages/RentPage'
import LeasesPage from './pages/LeasesPage'
import MaintenancePage from './pages/MaintenancePage'
import SalesPage from './pages/SalesPage'
import ValuationPage from './pages/ValuationPage'
import AccountingPage from './pages/AccountingPage'
import ExpensesPage from './pages/ExpensesPage'
import AnalyticsPage from './pages/AnalyticsPage'
import NotificationsPage from './pages/NotificationsPage'
import CRMPage from './pages/CRMPage'
import CurrencyPage from './pages/CurrencyPage'
import QuotationsPage from './pages/QuotationsPage'
import ReservationsPage from './pages/ReservationsPage'
import DocumentsPage from './pages/DocumentsPage'
import ReportsPage from './pages/ReportsPage'
import WhatsAppPage from './pages/WhatsAppPage'
import MessagingPage from './pages/MessagingPage'
import PreventiveMaintenancePage from './pages/PreventiveMaintenancePage'
import InspectionsPage from './pages/InspectionsPage'
import LandlordPortalPage from './pages/LandlordPortalPage'
import TenantLedgerPage from './pages/TenantLedgerPage'
import CommissionsPage from './pages/CommissionsPage'
import ValuationWorkbenchPage from './pages/ValuationWorkbenchPage'
import UserManagementPage from './pages/UserManagementPage'
import BuyerPortalPage from './pages/BuyerPortalPage'
import SellerPortalPage from './pages/SellerPortalPage'
import AMLPage from './pages/AMLPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <ResetPasswordPage />} />
      <Route path="/verify-reset-code" element={user ? <Navigate to="/" replace /> : <VerifyResetCodePage />} />
      <Route path="/"              element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/analytics"     element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/properties"    element={<ProtectedRoute><PropertiesPage /></ProtectedRoute>} />
      <Route path="/properties/:id" element={<ProtectedRoute><PropertyDetailPage /></ProtectedRoute>} />
      <Route path="/rent"          element={<ProtectedRoute><RentPage /></ProtectedRoute>} />
      <Route path="/leases"        element={<ProtectedRoute><LeasesPage /></ProtectedRoute>} />
      <Route path="/maintenance"   element={<ProtectedRoute><MaintenancePage /></ProtectedRoute>} />
      <Route path="/sales"         element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
      <Route path="/valuation"     element={<ProtectedRoute><ValuationPage /></ProtectedRoute>} />
      <Route path="/accounting"    element={<ProtectedRoute><AccountingPage /></ProtectedRoute>} />
      <Route path="/expenses"      element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
      <Route path="/crm"           element={<ProtectedRoute><CRMPage /></ProtectedRoute>} />
      <Route path="/currency"      element={<ProtectedRoute><CurrencyPage /></ProtectedRoute>} />
      <Route path="/quotations"    element={<ProtectedRoute><QuotationsPage /></ProtectedRoute>} />
      <Route path="/reservations"  element={<ProtectedRoute><ReservationsPage /></ProtectedRoute>} />
      <Route path="/documents"     element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
      <Route path="/reports"       element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/whatsapp"      element={<ProtectedRoute><WhatsAppPage /></ProtectedRoute>} />
      <Route path="/messaging"     element={<ProtectedRoute><MessagingPage /></ProtectedRoute>} />
      <Route path="/preventive"    element={<ProtectedRoute><PreventiveMaintenancePage /></ProtectedRoute>} />
      <Route path="/inspections"   element={<ProtectedRoute><InspectionsPage /></ProtectedRoute>} />
      <Route path="/landlord-portal" element={<ProtectedRoute><LandlordPortalPage /></ProtectedRoute>} />
      <Route path="/tenant-ledger" element={<ProtectedRoute><TenantLedgerPage /></ProtectedRoute>} />
      <Route path="/commissions"   element={<ProtectedRoute><CommissionsPage /></ProtectedRoute>} />
      <Route path="/valuation-workbench" element={<ProtectedRoute><ValuationWorkbenchPage /></ProtectedRoute>} />
      <Route path="/users"          element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
      <Route path="/sales-manager"  element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
      <Route path="/buyer-portal"   element={<ProtectedRoute><BuyerPortalPage /></ProtectedRoute>} />
      <Route path="/buyer-portal/favourites" element={<ProtectedRoute><BuyerPortalPage /></ProtectedRoute>} />
      <Route path="/buyer-portal/viewings"   element={<ProtectedRoute><BuyerPortalPage /></ProtectedRoute>} />
      <Route path="/buyer-portal/offers"     element={<ProtectedRoute><BuyerPortalPage /></ProtectedRoute>} />
      <Route path="/seller-portal"  element={<ProtectedRoute><SellerPortalPage /></ProtectedRoute>} />
      <Route path="/seller-portal/offers" element={<ProtectedRoute><SellerPortalPage /></ProtectedRoute>} />
      <Route path="/aml"            element={<ProtectedRoute><AMLPage /></ProtectedRoute>} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
