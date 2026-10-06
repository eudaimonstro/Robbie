import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, FileText } from 'lucide-react';
import { AmendmentChange, AmendmentChangeCreate } from '../../../api/client';
import { useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import {
  useAmendmentData,
  AmendmentHeader,
  AmendmentChangesList,
  EditAmendmentModal,
  AddChangeModal,
  AmendmentActionDialogs,
} from './amendmentDetailPage';

export default function AmendmentDetailPage() {
  const { amendmentId } = useParams<{ amendmentId: string }>();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();

  const {
    amendment,
    document,
    sectionTree,
    loading,
    updateAmendment,
    addChange,
    deleteChange,
    propose,
    withdraw,
    pass,
    fail,
    apply,
  } = useAmendmentData(amendmentId);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [changeModalOpen, setChangeModalOpen] = useState(false);

  // Delete change dialog
  const [deleteChangeDialogOpen, setDeleteChangeDialogOpen] = useState(false);
  const [deletingChange, setDeletingChange] = useState<AmendmentChange | null>(null);
  const [deletingChangeLoading, setDeletingChangeLoading] = useState(false);

  // Status action dialogs
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [passDialogOpen, setPassDialogOpen] = useState(false);
  const [failDialogOpen, setFailDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleEditAmendment = useCallback(
    async (title: string, description?: string) => {
      await updateAmendment(title, description);
    },
    [updateAmendment],
  );

  const handleAddChange = useCallback(
    async (data: AmendmentChangeCreate) => {
      await addChange(data);
    },
    [addChange],
  );

  const handleDeleteChange = useCallback(async () => {
    if (!deletingChange) return;
    try {
      setDeletingChangeLoading(true);
      await deleteChange(deletingChange.id);
      setDeleteChangeDialogOpen(false);
      setDeletingChange(null);
    } catch {
      showToast('error', 'Failed to delete change');
    } finally {
      setDeletingChangeLoading(false);
    }
  }, [deletingChange, deleteChange, showToast]);

  const handleAction = useCallback(async (action: () => Promise<void>, closeDialog: () => void) => {
    try {
      setActionLoading(true);
      await action();
      closeDialog();
    } catch {
      // Error already shown by hook
    } finally {
      setActionLoading(false);
    }
  }, []);

  if (loading) {
    return <LoadingPage />;
  }

  if (!amendment || !document) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          Amendment not found
        </h2>
        <Link to="/amendments" className="text-primary-600 hover:text-primary-700">
          Return to amendments
        </Link>
      </div>
    );
  }

  const isDraft = amendment.status === 'draft';

  return (
    <div className="max-w-5xl mx-auto">
      <AmendmentHeader
        amendment={amendment}
        document={document}
        organizationName={currentOrganization?.name}
        onEdit={() => setEditModalOpen(true)}
        onPropose={() => setProposeDialogOpen(true)}
        onWithdraw={() => setWithdrawDialogOpen(true)}
        onPass={() => setPassDialogOpen(true)}
        onFail={() => setFailDialogOpen(true)}
        onApply={() => setApplyDialogOpen(true)}
      />

      {/* Description */}
      {amendment.description && (
        <div className="card p-4 mb-6">
          <h3 className="font-medium text-secondary-900 dark:text-white mb-2">
            Description / Rationale
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400">{amendment.description}</p>
        </div>
      )}

      {/* Timeline info */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1 text-secondary-600">
            <Clock className="w-4 h-4" />
            Created: {new Date(amendment.createdAt).toLocaleString()}
          </div>
          {amendment.proposedAt && (
            <div className="text-secondary-600">
              Proposed: {new Date(amendment.proposedAt).toLocaleString()}
            </div>
          )}
          {amendment.decidedAt && (
            <div className="text-secondary-600">
              Decided: {new Date(amendment.decidedAt).toLocaleString()}
            </div>
          )}
          {amendment.resultingVersionId && (
            <div className="text-success-600">Applied to new version</div>
          )}
        </div>
      </div>

      {/* Changes */}
      <AmendmentChangesList
        changes={amendment.changes || []}
        sectionTree={sectionTree}
        canEdit={isDraft}
        onAddChange={() => setChangeModalOpen(true)}
        onDeleteChange={(change) => {
          setDeletingChange(change);
          setDeleteChangeDialogOpen(true);
        }}
      />

      {/* Modals */}
      <EditAmendmentModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSubmit={handleEditAmendment}
        initialTitle={amendment.title}
        initialDescription={amendment.description || ''}
      />

      <AddChangeModal
        isOpen={changeModalOpen}
        onClose={() => setChangeModalOpen(false)}
        onSubmit={handleAddChange}
        sectionTree={sectionTree}
      />

      {/* Action Dialogs */}
      <AmendmentActionDialogs
        deleteChangeDialogOpen={deleteChangeDialogOpen}
        deletingChange={deletingChange}
        deletingChangeLoading={deletingChangeLoading}
        onDeleteChangeClose={() => setDeleteChangeDialogOpen(false)}
        onDeleteChangeConfirm={handleDeleteChange}
        proposeDialogOpen={proposeDialogOpen}
        withdrawDialogOpen={withdrawDialogOpen}
        passDialogOpen={passDialogOpen}
        failDialogOpen={failDialogOpen}
        applyDialogOpen={applyDialogOpen}
        actionLoading={actionLoading}
        onProposeClose={() => setProposeDialogOpen(false)}
        onProposeConfirm={() => handleAction(propose, () => setProposeDialogOpen(false))}
        onWithdrawClose={() => setWithdrawDialogOpen(false)}
        onWithdrawConfirm={() => handleAction(withdraw, () => setWithdrawDialogOpen(false))}
        onPassClose={() => setPassDialogOpen(false)}
        onPassConfirm={() => handleAction(pass, () => setPassDialogOpen(false))}
        onFailClose={() => setFailDialogOpen(false)}
        onFailConfirm={() => handleAction(fail, () => setFailDialogOpen(false))}
        onApplyClose={() => setApplyDialogOpen(false)}
        onApplyConfirm={() =>
          handleAction(
            async () => {
              await apply();
            },
            () => setApplyDialogOpen(false),
          )
        }
      />
    </div>
  );
}
