import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import type { Role } from './types'
import LoginPage from './pages/LoginPage'
import {
  MemberHome,
  MemberNotifications,
  MemberPay,
  MemberProfile,
  MemberTransactions,
} from './pages/member'
import { MemberBook } from './pages/MemberBook'
import { StaffCheckIn, StaffCourts, StaffHome, StaffMembers } from './pages/staff'
import {
  AdminHome,
  AdminMemberForm,
  AdminMembers,
  AdminOps,
  AdminTransactions,
  AdminUsers,
} from './pages/admin'
import { AdminBookings, StaffBookings } from './pages/BookingsDesk'
import { LoadingBlock } from './components/Shell'

function homeFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'staff') return '/staff'
  return '/member'
}

function Protected({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="app-shell">
        <LoadingBlock />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRedirect />} />

        <Route element={<Protected roles={['member', 'admin']} />}>
          <Route path="/member" element={<MemberHome />} />
          <Route path="/member/book" element={<MemberBook />} />
          <Route path="/member/pay" element={<MemberPay />} />
          <Route path="/member/transactions" element={<MemberTransactions />} />
          <Route path="/member/notifications" element={<MemberNotifications />} />
          <Route path="/member/profile" element={<MemberProfile />} />
        </Route>

        <Route element={<Protected roles={['staff', 'admin']} />}>
          <Route path="/staff" element={<StaffHome />} />
          <Route path="/staff/members" element={<StaffMembers />} />
          <Route path="/staff/checkin" element={<StaffCheckIn />} />
          <Route path="/staff/bookings" element={<StaffBookings />} />
          <Route path="/staff/courts" element={<StaffCourts />} />
        </Route>

        <Route element={<Protected roles={['admin']} />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/members" element={<AdminMembers />} />
          <Route path="/admin/members/new" element={<AdminMemberForm />} />
          <Route path="/admin/members/:id" element={<AdminMemberForm />} />
          <Route path="/admin/ops" element={<AdminOps />} />
          <Route path="/admin/bookings" element={<AdminBookings />} />
          <Route path="/admin/transactions" element={<AdminTransactions />} />
          <Route path="/admin/users" element={<AdminUsers />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="app-shell">
        <LoadingBlock />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={homeFor(user.role)} replace />
}
