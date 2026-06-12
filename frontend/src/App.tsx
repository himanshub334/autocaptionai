import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/AppLayout'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { UploadPage } from './pages/UploadPage'
import { VideoPage } from './pages/VideoPage'
import { EditorPage } from './pages/EditorPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  if (!token) return <Navigate to="/auth" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#16142a',
            color: '#e8e6ff',
            border: '1px solid #2a2650',
          },
        }}
      />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="videos/:id" element={<VideoPage />} />
          <Route path="videos/:id/editor" element={<EditorPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
