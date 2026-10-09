import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import ErrorState from '../../../components/ui/ErrorState';
import {
  SectionTree as SectionTreeType,
  SectionCreate,
  SectionUpdate,
  VersionCreate,
} from '../../../api/client';
import {
  useOrganization,
  useCan,
  useSelectRecordOrganization,
} from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import SectionEditor from '../components/SectionEditor';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import ShareModal from '../components/ShareModal';
import {
  useDocumentData,
  DocumentHeader,
  DocumentContentCard,
  PendingAmendmentsPanel,
  CreateVersionModal,
  CreateAmendmentModal,
} from './documentPage';
import { useSectionFromHash } from './documentPage/sectionFromHash';
import { useVersionParam } from './documentPage/versionParam';

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();
  // A link may open a particular version (an applied amendment links to the one it produced),
  // and the picker keeps the link in step with the version shown
  const { versionId, chooseVersion } = useVersionParam();

  const {
    doc,
    versions,
    selectedVersion,
    sectionTree,
    amendments,
    loading,
    loadError,
    reload,
    handleSaveSection,
    handleDeleteSection,
    handleReorderSections,
    handleCreateVersion,
    handleCreateAmendment,
  } = useDocumentData(documentId, versionId);

  // The role, breadcrumb and panels are the document's organization's, not the header's
  useSelectRecordOrganization(doc?.organizationId);
  const canEdit = useCan('secretary');
  const canDraft = useCan('member');
  const canShare = useCan('admin');

  const [selectedSection, setSelectedSection] = useState<SectionTreeType | null>(null);
  // Opened from search at a section: select it and bring it into view
  useSectionFromHash(sectionTree, setSelectedSection);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'addChild'>('create');
  const [editingSection, setEditingSection] = useState<SectionTreeType | null>(null);
  const [parentSection, setParentSection] = useState<SectionTreeType | null>(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSection, setDeletingSection] = useState<SectionTreeType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Modals
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [amendmentModalOpen, setAmendmentModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const handleAddSection = useCallback(() => {
    setEditorMode('create');
    setEditingSection(null);
    setParentSection(null);
    setEditorOpen(true);
  }, []);

  const handleEditSection = useCallback((section: SectionTreeType) => {
    setEditorMode('edit');
    setEditingSection(section);
    setParentSection(null);
    setEditorOpen(true);
  }, []);

  const handleAddChild = useCallback((parent: SectionTreeType) => {
    setEditorMode('addChild');
    setEditingSection(null);
    setParentSection(parent);
    setEditorOpen(true);
  }, []);

  const openDeleteDialog = useCallback((section: SectionTreeType) => {
    setDeletingSection(section);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = async () => {
    if (!deletingSection) return;

    try {
      setDeleting(true);
      await handleDeleteSection(deletingSection.id);
      setDeleteDialogOpen(false);
      setDeletingSection(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't delete the section");
    } finally {
      setDeleting(false);
    }
  };

  const onSaveSection = async (data: SectionCreate | SectionUpdate) => {
    await handleSaveSection(data, editorMode, editingSection, parentSection);
  };

  const onCreateVersion = async (data: VersionCreate) => {
    // The new version is the current one: the link no longer names an older one
    if (await handleCreateVersion(data)) chooseVersion(null);
  };

  const onCreateAmendment = async (title: string, description?: string) => {
    const amendment = await handleCreateAmendment(title, description);
    if (amendment) {
      navigate(`/amendments/${amendment.id}`);
    }
  };

  if (loading) {
    return <LoadingPage label="Loading the document..." />;
  }

  if (loadError === 'failed') {
    return (
      <div className="mx-auto max-w-xl py-12">
        <ErrorState
          title="Couldn't load the document."
          description="Check your connection, then try again."
          onRetry={() => void reload()}
        >
          <Link to="/" className="text-gavel hover:underline">
            All documents
          </Link>
        </ErrorState>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-ink-muted mx-auto mb-4" aria-hidden="true" />
        <h2 className="card-title mb-2">Document not found</h2>
        <p className="mb-4 text-ink-muted">
          This document doesn&apos;t exist, or it isn&apos;t shared with you.
        </p>
        <Link to="/" className="text-gavel hover:underline">
          All documents
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-7xl mx-auto">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <DocumentHeader
          doc={doc}
          versions={versions}
          selectedVersion={selectedVersion}
          organizationName={currentOrganization?.name}
          canDraft={canDraft}
          canShare={canShare}
          onVersionChange={(id) => chooseVersion(id, doc.currentVersionId)}
          onProposeAmendment={() => setAmendmentModalOpen(true)}
          onShare={() => setShareModalOpen(true)}
        />

        <DocumentContentCard
          selectedVersion={selectedVersion}
          sectionTree={sectionTree}
          selectedSection={selectedSection}
          canEdit={canEdit}
          isCurrentVersion={selectedVersion?.id === doc.currentVersionId}
          onSelectSection={setSelectedSection}
          onEditSection={handleEditSection}
          onDeleteSection={openDeleteDialog}
          onAddChild={handleAddChild}
          onReorder={handleReorderSections}
          onAddSection={handleAddSection}
          onCreateVersion={() => setVersionModalOpen(true)}
          onImport={() => navigate(`/documents/${doc.id}/import`)}
          timeZone={currentOrganization?.timeZone}
        />
      </div>

      {/* Right panel - Amendments */}
      <PendingAmendmentsPanel amendments={amendments} documentId={documentId!} />

      {/* Section Editor Modal */}
      {editorOpen && (
        <SectionEditor
          key={`${editorMode}:${editingSection?.id ?? parentSection?.id ?? 'top'}`}
          isOpen
          onClose={() => setEditorOpen(false)}
          onSave={onSaveSection}
          section={editingSection || undefined}
          parentLabel={parentSection?.numberLabel || parentSection?.title || undefined}
          mode={editorMode}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete the section?"
        message={`Delete "${deletingSection?.numberLabel || deletingSection?.title || 'this section'}" from this version? This can't be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />

      {/* Create Version Modal */}
      <CreateVersionModal
        isOpen={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
        onSubmit={onCreateVersion}
      />

      {/* Create Amendment Modal */}
      <CreateAmendmentModal
        isOpen={amendmentModalOpen}
        onClose={() => setAmendmentModalOpen(false)}
        onSubmit={onCreateAmendment}
      />

      {/* Share Modal */}
      {doc && shareModalOpen && (
        <ShareModal
          key={doc.id}
          isOpen
          onClose={() => setShareModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
        />
      )}
    </div>
  );
}
