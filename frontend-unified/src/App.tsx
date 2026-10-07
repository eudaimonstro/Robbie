import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { SessionProvider } from './context/SessionContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { RequireSession } from './components/auth/RequireSession';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LoadingPage } from './components/ui/LoadingSpinner';
import { RouteAnnouncer } from './components/layout/RouteAnnouncer';
import AppLayout from './components/layout/AppLayout';

// Lazy load document pages
const HomePage = lazy(() => import('./modules/documents/pages/HomePage'));
const DocumentPage = lazy(() => import('./modules/documents/pages/DocumentPage'));
const DocumentDiffPage = lazy(() => import('./modules/documents/pages/DocumentDiffPage'));
const ImportBylawsPage = lazy(() => import('./modules/documents/pages/ImportBylawsPage'));
const AmendmentsPage = lazy(() => import('./modules/documents/pages/AmendmentsPage'));
const AmendmentDetailPage = lazy(() => import('./modules/documents/pages/AmendmentDetailPage'));
const MeetingsPage = lazy(() => import('./modules/documents/pages/MeetingsPage'));
const MeetingDetailPage = lazy(() => import('./modules/documents/pages/MeetingDetailPage'));
const SettingsPage = lazy(() => import('./modules/documents/pages/SettingsPage'));
const MinutesListPage = lazy(() => import('./modules/documents/pages/MinutesListPage'));
const PublicDocumentPage = lazy(() => import('./modules/documents/pages/PublicDocumentPage'));
const PublicPrintPage = lazy(() => import('./modules/documents/pages/PublicPrintPage'));
const PrintDocumentPage = lazy(() => import('./modules/documents/pages/PrintDocumentPage'));
const SignInPage = lazy(() => import('./pages/SignInPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const NotFoundPage = lazy(() => import('./modules/documents/pages/NotFoundPage'));
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'));

// Lazy load meetings module
const MeetingsModule = lazy(() => import('./modules/meetings'));
const MeetingDisplay = lazy(() => import('./modules/meetings/display'));

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SessionProvider>
          <ErrorBoundary>
            <RouteAnnouncer />
            <Suspense fallback={<LoadingPage />}>
              <Routes>
                {/* Public routes (no layout, no session) */}
                <Route path="/share/:shareToken" element={<PublicDocumentPage />} />
                <Route path="/share/:shareToken/print" element={<PublicPrintPage />} />
                <Route path="/sign-in" element={<SignInPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />

                {/*
                  The meeting on a TV or projector: signed in, but outside the app's layout.
                  It outranks meetings/* below, so the meetings module never sees it.
                */}
                <Route
                  path="/meetings/:code/display"
                  element={
                    <RequireSession>
                      <OrganizationProvider>
                        <MeetingDisplay />
                      </OrganizationProvider>
                    </RequireSession>
                  }
                />

                {/* A document's version to print: signed in, without the app's chrome */}
                <Route
                  path="/documents/:documentId/print"
                  element={
                    <RequireSession>
                      <OrganizationProvider>
                        <PrintDocumentPage />
                      </OrganizationProvider>
                    </RequireSession>
                  }
                />

                {/* Everything else needs a signed-in user */}
                <Route
                  element={
                    <RequireSession>
                      <OrganizationProvider>
                        <AppLayout>
                          <Outlet />
                        </AppLayout>
                      </OrganizationProvider>
                    </RequireSession>
                  }
                >
                  <Route index element={<HomePage />} />

                  {/* Document management */}
                  <Route path="documents/:documentId" element={<DocumentPage />} />
                  <Route path="documents/:documentId/diff" element={<DocumentDiffPage />} />
                  <Route path="documents/:documentId/import" element={<ImportBylawsPage />} />
                  <Route path="documents/:documentId/amendments" element={<AmendmentsPage />} />

                  {/* Amendments */}
                  <Route path="amendments" element={<AmendmentsPage />} />
                  <Route path="amendments/:amendmentId" element={<AmendmentDetailPage />} />

                  {/* Bylawyer meetings (document records) */}
                  <Route path="bylawyer-meetings" element={<MeetingsPage />} />
                  <Route path="bylawyer-meetings/:meetingId" element={<MeetingDetailPage />} />

                  {/* Minutes of the organization's meetings */}
                  <Route path="minutes" element={<MinutesListPage />} />

                  {/* Settings */}
                  <Route path="settings" element={<SettingsPage />} />

                  {/* The design language (docs/design-brief.md) */}
                  <Route path="style-guide" element={<StyleGuidePage />} />

                  {/* Live meetings (Robbie) */}
                  <Route path="meetings/*" element={<MeetingsModule />} />

                  {/* 404 */}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </SessionProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
