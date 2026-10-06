import { useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import Modal from '../ui/Modal';
import { useOrganization } from '../../context/OrganizationContext';
import { documents, DocumentCreate } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const modalTriggerRef = useRef<HTMLElement | null>(null);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState<'bylaws' | 'standing_rules' | 'policy'>('bylaws');
  const [creating, setCreating] = useState(false);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !currentOrganization) return;

    try {
      setCreating(true);
      const data: DocumentCreate = {
        title: newDocTitle.trim(),
        doc_type: newDocType,
      };
      const newDoc = await documents.create(currentOrganization.id, data);
      setNewDocTitle('');
      setNewDocType('bylaws');
      setIsNewDocModalOpen(false);
      modalTriggerRef.current = null; // Don't restore focus since we're navigating away
      showToast('success', `Document "${newDoc.title}" created successfully`);
      navigate(`/documents/${newDoc.id}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:outline-hidden"
      >
        Skip to main content
      </a>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile by default, shown when sidebarOpen */}
      <div
        className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        <Sidebar
          onNewDocument={() => {
            modalTriggerRef.current = document.activeElement as HTMLElement;
            setIsNewDocModalOpen(true);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main
          id="main-content"
          className="flex-1 overflow-auto p-4 md:p-6 bg-secondary-50 dark:bg-secondary-900"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      {/* Create Document Modal */}
      <Modal
        isOpen={isNewDocModalOpen}
        onClose={() => {
          setIsNewDocModalOpen(false);
          // Restore focus to trigger element
          setTimeout(() => {
            modalTriggerRef.current?.focus();
            modalTriggerRef.current = null;
          }, 0);
        }}
        title="Create New Document"
      >
        <form onSubmit={handleCreateDocument}>
          <div className="mb-4">
            <label htmlFor="docTitle" className="label">
              Document Title
            </label>
            <input
              type="text"
              id="docTitle"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              className="input"
              placeholder="e.g., Organization Bylaws"
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label htmlFor="docType" className="label">
              Document Type
            </label>
            <select
              id="docType"
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value as DocumentCreate['doc_type'])}
              className="select"
            >
              <option value="bylaws">Bylaws</option>
              <option value="standing_rules">Standing Rules</option>
              <option value="policy">Policy</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setIsNewDocModalOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!newDocTitle.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create Document'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
