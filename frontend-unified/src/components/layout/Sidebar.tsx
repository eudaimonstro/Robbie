import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FileText,
  GitBranch,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  X,
  Users,
  ScrollText,
} from 'lucide-react';
import { useOrganization, useCan } from '../../context/OrganizationContext';
import { documents as documentsApi, Document } from '../../api/client';

const navItems = [
  { icon: FileText, label: 'Documents', path: '/' },
  { icon: GitBranch, label: 'Amendments', path: '/amendments' },
  { icon: Users, label: 'Live meetings', path: '/meetings' },
  { icon: ScrollText, label: 'Minutes', path: '/minutes' },
];

/**
 * A navigation entry: ink on surface-2, and the current page on surface with a gavel bar at its
 * left edge (docs/design-brief.md: the sidebar is "not a blue block")
 */
function entryClass(current: boolean, nested = false): string {
  // At least 44px tall on phones, where the drawer is tapped
  const size = nested
    ? 'gap-2 px-3 py-1.5 max-md:min-h-11 mb-0.5 text-sm'
    : 'gap-3 px-3 py-2 max-md:min-h-11 mb-1';
  const state = current
    ? 'bg-surface text-ink font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-gavel'
    : 'text-ink-muted hover:bg-surface hover:text-ink';
  return `relative flex items-center rounded-md transition-colors ${size} ${state}`;
}

interface SidebarProps {
  onNewDocument: () => void;
  onClose?: () => void;
  /** A drawer at every width (a live meeting), so the close button shows on laptops too */
  drawer?: boolean;
}

export default function Sidebar({ onNewDocument, onClose, drawer = false }: SidebarProps) {
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  // Documents are created by secretaries and above
  const canCreate = useCan('secretary');
  const [documents, setDocuments] = useState<Document[]>([]);
  // The list couldn't be loaded: said in the list's place, not shown as no documents. Quietly,
  // since the list reloads on every page: a toast would come back on each one.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expandedDocs, setExpandedDocs] = useState(true);

  // Reload on navigation too: creating a document navigates to it, and deleting one navigates
  // away. The client caches the list and clears the cache on any write, so this is cheap.
  useEffect(() => {
    if (!currentOrganization) {
      setDocuments([]);
      setFailed(false);
      return;
    }
    let canceled = false;
    documentsApi.list(currentOrganization.id).then(
      (list) => {
        if (canceled) return;
        setDocuments(list);
        setFailed(false);
      },
      () => {
        if (!canceled) setFailed(true);
      },
    );
    return () => {
      canceled = true;
    };
  }, [currentOrganization, location.pathname, attempt]);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/documents');
    }
    return location.pathname.startsWith(path);
  };
  const onSettings = location.pathname === '/settings';

  return (
    <aside className="w-64 bg-surface-2 text-ink border-r border-rule flex flex-col h-full">
      {/* Mobile close button */}
      {onClose && (
        <div className={`flex justify-end p-2 ${drawer ? '' : 'md:hidden'}`}>
          <button
            onClick={onClose}
            className="p-2 max-md:p-3 rounded-md text-ink-muted hover:text-ink hover:bg-surface"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* New document (a role implies a current organization) */}
      {canCreate && (
        <div className="p-4 pt-2 md:pt-4">
          <button onClick={onNewDocument} className="btn-primary w-full">
            <Plus className="w-4 h-4" aria-hidden="true" />
            New document
          </button>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 px-2 overflow-y-auto scrollbar-thin" aria-label="Main">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          if (item.path === '/') {
            // Documents with expandable list
            return (
              <div key={item.path}>
                <button
                  onClick={() => setExpandedDocs(!expandedDocs)}
                  aria-expanded={expandedDocs}
                  className={`w-full ${entryClass(active)}`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {expandedDocs ? (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>

                {expandedDocs && failed && (
                  <p className="ml-4 mb-2 px-3 text-sm text-ink-muted">
                    Couldn&apos;t load the documents.{' '}
                    <button
                      type="button"
                      onClick={() => setAttempt((n) => n + 1)}
                      className="inline-flex items-center text-gavel hover:underline max-md:min-h-11"
                    >
                      Try again
                    </button>
                  </p>
                )}

                {expandedDocs && !failed && documents.length > 0 && (
                  <div className="ml-4 mb-2">
                    {documents.map((doc) => {
                      const current = location.pathname === `/documents/${doc.id}`;
                      return (
                        <Link
                          key={doc.id}
                          to={`/documents/${doc.id}`}
                          aria-current={current ? 'page' : undefined}
                          className={entryClass(current, true)}
                        >
                          <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{doc.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={entryClass(active)}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="p-4 border-t border-rule">
        <Link
          to="/settings"
          aria-current={onSettings ? 'page' : undefined}
          className={entryClass(onSettings)}
        >
          <Settings className="w-5 h-5" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
