import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import {
  SectionTree as SectionTreeType,
  SectionCreate,
  SectionUpdate,
  VersionCreate,
} from '../../../api/client';
import { useOrganization, useCan } from '../../../context/OrganizationContext';
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

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const canEdit = useCan('secretary');
  const canDraft = useCan('member');
  const canShare = useCan('admin');
  const { showToast } = useToast();

  const {
    doc,
    versions,
    selectedVersion,
    sectionTree,
    amendments,
    loading,
    handleVersionChange,
    handleSaveSection,
    handleDeleteSection,
    handleReorderSections,
    handleCreateVersion,
    handleCreateAmendment,
  } = useDocumentData(documentId);

  const [selectedSection, setSelectedSection] = useState<SectionTreeType | null>(null);

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
    } catch {
      showToast('error', 'Failed to delete section');
    } finally {
      setDeleting(false);
    }
  };

  const onSaveSection = async (data: SectionCreate | SectionUpdate) => {
    await handleSaveSection(data, editorMode, editingSection, parentSection);
  };

  const onCreateVersion = async (data: VersionCreate) => {
    await handleCreateVersion(data);
  };

  const onCreateAmendment = async (title: string, description?: string) => {
    const amendment = await handleCreateAmendment(title, description);
    if (amendment) {
      navigate(`/amendments/${amendment.id}`);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          Document not found
        </h2>
        <Link to="/" className="text-primary-600 hover:text-primary-700">
          Return to documents
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
          onVersionChange={handleVersionChange}
          onProposeAmendment={() => setAmendmentModalOpen(true)}
          onShare={() => setShareModalOpen(true)}
        />

        <DocumentContentCard
          selectedVersion={selectedVersion}
          sectionTree={sectionTree}
          selectedSection={selectedSection}
          canEdit={canEdit}
          onSelectSection={setSelectedSection}
          onEditSection={handleEditSection}
          onDeleteSection={openDeleteDialog}
          onAddChild={handleAddChild}
          onReorder={handleReorderSections}
          onAddSection={handleAddSection}
          onCreateVersion={() => setVersionModalOpen(true)}
        />
      </div>

      {/* Right panel - Amendments */}
      <PendingAmendmentsPanel amendments={amendments} documentId={documentId!} />

      {/* Section Editor Modal */}
      <SectionEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={onSaveSection}
        section={editingSection || undefined}
        parentLabel={parentSection?.numberLabel || parentSection?.title || undefined}
        mode={editorMode}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Section"
        message={`Are you sure you want to delete "${deletingSection?.numberLabel || deletingSection?.title || 'this section'}"? This action cannot be undone.`}
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
      {doc && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
        />
      )}
    </div>
  );
}
