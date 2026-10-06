import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LoadingPage } from './components/ui/LoadingSpinner';
import { RouteAnnouncer } from './components/layout/RouteAnnouncer';
import AppLayout from './components/layout/AppLayout';

// Lazy load document pages
const HomePage = lazy(() => import('./modules/documents/pages/HomePage'));
const DocumentPage = lazy(() => import('./modules/documents/pages/DocumentPage'));
const DocumentDiffPage = lazy(() => import('./modules/documents/pages/DocumentDiffPage'));
const AmendmentsPage = lazy(() => import('./modules/documents/pages/AmendmentsPage'));
const AmendmentDetailPage = lazy(() => import('./modules/documents/pages/AmendmentDetailPage'));
const MeetingsPage = lazy(() => import('./modules/documents/pages/MeetingsPage'));
const MeetingDetailPage = lazy(() => import('./modules/documents/pages/MeetingDetailPage'));
const SettingsPage = lazy(() => import('./modules/documents/pages/SettingsPage'));
const PublicDocumentPage = lazy(() => import('./modules/documents/pages/PublicDocumentPage'));
const NotFoundPage = lazy(() => import('./modules/documents/pages/NotFoundPage'));

// Lazy load meetings module
const MeetingsModule = lazy(() => import('./modules/meetings'));

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OrganizationProvider>
          <ErrorBoundary>
            <RouteAnnouncer />
            <Suspense fallback={<LoadingPage />}>
              <Routes>
                {/* Public routes (no layout) */}
                <Route path="/share/:shareToken" element={<PublicDocumentPage />} />

                {/* Main app routes with layout */}
                <Route
                  element={
                    <AppLayout>
                      <Outlet />
                    </AppLayout>
                  }
                >
                  <Route index element={<HomePage />} />

                  {/* Document management */}
                  <Route path="documents/:documentId" element={<DocumentPage />} />
                  <Route path="documents/:documentId/diff" element={<DocumentDiffPage />} />
                  <Route path="documents/:documentId/amendments" element={<AmendmentsPage />} />

                  {/* Amendments */}
                  <Route path="amendments" element={<AmendmentsPage />} />
                  <Route path="amendments/:amendmentId" element={<AmendmentDetailPage />} />

                  {/* Bylawyer meetings (document records) */}
                  <Route path="bylawyer-meetings" element={<MeetingsPage />} />
                  <Route path="bylawyer-meetings/:meetingId" element={<MeetingDetailPage />} />

                  {/* Settings */}
                  <Route path="settings" element={<SettingsPage />} />

                  {/* Live meetings (Robbie) */}
                  <Route path="meetings/*" element={<MeetingsModule />} />

                  {/* 404 */}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </OrganizationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
