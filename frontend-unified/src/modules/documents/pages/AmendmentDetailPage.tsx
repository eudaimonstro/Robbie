import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, FileText } from 'lucide-react';
import { AmendmentChange, AmendmentChangeCreate } from '../../../api/client';
import {
  useOrganization,
  useCan,
  useSelectRecordOrganization,
} from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import { canEditAmendment } from '../../../utils/roles';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import ErrorState from '../../../components/ui/ErrorState';
import { formatDateTime } from '../../../utils/dates';
import {
  useAmendmentData,
  AmendmentHeader,
  AmendmentChangesList,
  AmendmentTabs,
  EditAmendmentModal,
  AddChangeModal,
  AmendmentActionDialogs,
} from './amendmentDetailPage';

export default function AmendmentDetailPage() {
  const { amendmentId } = useParams<{ amendmentId: string }>();
  const { currentOrganization, role } = useOrganization();
  const { user } = useSession();
  const { showToast } = useToast();

  const {
    amendment,
    document,
    sectionTree,
    loading,
    loadError,
    fetchAmendment,
    updateAmendment,
    addChange,
    deleteChange,
    propose,
    withdraw,
    pass,
    fail,
    apply,
  } = useAmendmentData(amendmentId);

  // The role and breadcrumb are the document's organization's, not the header's
  useSelectRecordOrganization(document?.organizationId);
  // Proposing, withdrawing, deciding and applying need the secretary role
  const canDecide = useCan('secretary');

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
      showToast('error', "Couldn't delete the change");
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
    return <LoadingPage label="Loading the amendment..." />;
  }

  if (loadError === 'failed') {
    return (
      <div className="mx-auto max-w-xl py-12">
        <ErrorState
          title="Couldn't load the amendment."
          description="Check your connection, then try again."
          onRetry={() => void fetchAmendment()}
        >
          <Link to="/amendments" className="text-gavel hover:underline">
            All amendments
          </Link>
        </ErrorState>
      </div>
    );
  }

  if (!amendment || !document) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-ink-muted mx-auto mb-4" aria-hidden="true" />
        <h2 className="card-title mb-2">Amendment not found</h2>
        <p className="mb-4 text-ink-muted">
          This amendment doesn&apos;t exist, or it isn&apos;t shared with you.
        </p>
        <Link to="/amendments" className="text-gavel hover:underline">
          All amendments
        </Link>
      </div>
    );
  }

  const timeZone = currentOrganization?.timeZone;

  const isDraft = amendment.status === 'draft';
  // A member edits only drafts they created; a secretary any draft (the server's rule)
  const canEditDraft =
    isDraft && role !== null && user !== null && canEditAmendment(role, user.id, amendment);

  return (
    <div className="max-w-5xl mx-auto">
      <AmendmentHeader
        amendment={amendment}
        document={document}
        organizationName={currentOrganization?.name}
        canDecide={canDecide}
        canEditDraft={canEditDraft}
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
          <h3 className="label-caps mb-2">Why</h3>
          <p className="text-ink-muted">{amendment.description}</p>
        </div>
      )}

      {/* Timeline info */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-1 text-ink-muted">
            <Clock className="w-4 h-4" aria-hidden="true" />
            Created {formatDateTime(amendment.createdAt, timeZone)}
          </div>
          {amendment.proposedAt && (
            <div className="text-ink-muted">
              Proposed {formatDateTime(amendment.proposedAt, timeZone)}
            </div>
          )}
          {amendment.decidedAt && (
            <div className="text-ink-muted">
              Decided {formatDateTime(amendment.decidedAt, timeZone)}
            </div>
          )}
          {amendment.resultingVersionId && (
            <div className="text-carried">Applied to new version</div>
          )}
        </div>
      </div>

      {/* The changes, and a preview of the document as it would read */}
      <AmendmentTabs
        amendment={amendment}
        changes={
          <AmendmentChangesList
            changes={amendment.changes || []}
            sectionTree={sectionTree}
            canEdit={canEditDraft}
            open={amendment.status === 'draft' || amendment.status === 'proposed'}
            onAddChange={() => setChangeModalOpen(true)}
            onDeleteChange={(change) => {
              setDeletingChange(change);
              setDeleteChangeDialogOpen(true);
            }}
          />
        }
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
