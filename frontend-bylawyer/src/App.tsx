import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { OrganizationProvider } from './context/OrganizationContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/ui/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingPage } from './components/ui/LoadingSpinner'
import { RouteAnnouncer } from './components/RouteAnnouncer'
import Layout from './components/Layout'

// Lazy load pages for better performance
const HomePage = lazy(() => import('./pages/HomePage'))
const DocumentPage = lazy(() => import('./pages/DocumentPage'))
const DocumentDiffPage = lazy(() => import('./pages/DocumentDiffPage'))
const AmendmentsPage = lazy(() => import('./pages/AmendmentsPage'))
const AmendmentDetailPage = lazy(() => import('./pages/AmendmentDetailPage'))
const MeetingsPage = lazy(() => import('./pages/MeetingsPage'))
const MeetingDetailPage = lazy(() => import('./pages/MeetingDetailPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const PublicDocumentPage = lazy(() => import('./pages/PublicDocumentPage'))

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OrganizationProvider>
        <ErrorBoundary>
        <RouteAnnouncer />
        <Suspense fallback={<LoadingPage />}>
        <Routes>
          {/* Public readonly document view (standalone, no layout) */}
          <Route path="/share/:shareToken" element={<PublicDocumentPage />} />

          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="documents/:documentId" element={<DocumentPage />} />
            <Route path="documents/:documentId/diff" element={<DocumentDiffPage />} />
            <Route path="documents/:documentId/amendments" element={<AmendmentsPage />} />
            <Route path="amendments" element={<AmendmentsPage />} />
            <Route path="amendments/:amendmentId" element={<AmendmentDetailPage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="meetings/:meetingId" element={<MeetingDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </Suspense>
        </ErrorBoundary>
        </OrganizationProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
