import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import { AmendmentChange } from '../../../../api/client';

interface AmendmentActionDialogsProps {
  // Delete change
  deleteChangeDialogOpen: boolean;
  deletingChange: AmendmentChange | null;
  deletingChangeLoading: boolean;
  onDeleteChangeClose: () => void;
  onDeleteChangeConfirm: () => void;

  // Status actions
  proposeDialogOpen: boolean;
  withdrawDialogOpen: boolean;
  passDialogOpen: boolean;
  failDialogOpen: boolean;
  applyDialogOpen: boolean;
  actionLoading: boolean;
  onProposeClose: () => void;
  onProposeConfirm: () => void;
  onWithdrawClose: () => void;
  onWithdrawConfirm: () => void;
  onPassClose: () => void;
  onPassConfirm: () => void;
  onFailClose: () => void;
  onFailConfirm: () => void;
  onApplyClose: () => void;
  onApplyConfirm: () => void;
}

export function AmendmentActionDialogs({
  deleteChangeDialogOpen,
  deletingChangeLoading,
  onDeleteChangeClose,
  onDeleteChangeConfirm,
  proposeDialogOpen,
  withdrawDialogOpen,
  passDialogOpen,
  failDialogOpen,
  applyDialogOpen,
  actionLoading,
  onProposeClose,
  onProposeConfirm,
  onWithdrawClose,
  onWithdrawConfirm,
  onPassClose,
  onPassConfirm,
  onFailClose,
  onFailConfirm,
  onApplyClose,
  onApplyConfirm,
}: AmendmentActionDialogsProps) {
  return (
    <>
      <ConfirmDialog
        isOpen={deleteChangeDialogOpen}
        onClose={onDeleteChangeClose}
        onConfirm={onDeleteChangeConfirm}
        title="Delete Change"
        message="Are you sure you want to delete this change from the amendment?"
        confirmText="Delete"
        variant="danger"
        loading={deletingChangeLoading}
      />

      <ConfirmDialog
        isOpen={proposeDialogOpen}
        onClose={onProposeClose}
        onConfirm={onProposeConfirm}
        title="Propose Amendment"
        message="Are you sure you want to propose this amendment? Once proposed, it can be voted on but the changes cannot be modified."
        confirmText="Propose"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={withdrawDialogOpen}
        onClose={onWithdrawClose}
        onConfirm={onWithdrawConfirm}
        title="Withdraw Amendment"
        message="Are you sure you want to withdraw this amendment? This action cannot be undone."
        confirmText="Withdraw"
        variant="danger"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={passDialogOpen}
        onClose={onPassClose}
        onConfirm={onPassConfirm}
        title="Mark Amendment as Passed"
        message="Are you sure this amendment has passed the required vote? This will allow it to be applied to the document."
        confirmText="Mark as Passed"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={failDialogOpen}
        onClose={onFailClose}
        onConfirm={onFailConfirm}
        title="Mark Amendment as Failed"
        message="Are you sure this amendment has failed the vote? This action cannot be undone."
        confirmText="Mark as Failed"
        variant="danger"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={applyDialogOpen}
        onClose={onApplyClose}
        onConfirm={onApplyConfirm}
        title="Apply Amendment to Document"
        message="This will create a new version of the document with all the changes from this amendment applied. Continue?"
        confirmText="Apply Amendment"
        loading={actionLoading}
      />
    </>
  );
}
