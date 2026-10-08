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
        title="Delete the change?"
        message="This change comes out of the amendment."
        confirmText="Delete"
        variant="danger"
        loading={deletingChangeLoading}
      />

      <ConfirmDialog
        isOpen={proposeDialogOpen}
        onClose={onProposeClose}
        onConfirm={onProposeConfirm}
        title="Propose the amendment?"
        message="Once proposed, it can be voted on, and its changes can't be edited."
        confirmText="Propose"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={withdrawDialogOpen}
        onClose={onWithdrawClose}
        onConfirm={onWithdrawConfirm}
        title="Withdraw the amendment?"
        message="A withdrawn amendment can't be brought back."
        confirmText="Withdraw"
        variant="danger"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={passDialogOpen}
        onClose={onPassClose}
        onConfirm={onPassConfirm}
        title="Mark the amendment passed?"
        message="Only when it passed the vote it needed. Then it can be applied to the document."
        confirmText="Mark passed"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={failDialogOpen}
        onClose={onFailClose}
        onConfirm={onFailConfirm}
        title="Mark the amendment failed?"
        message="Only when it failed the vote. This can't be undone."
        confirmText="Mark failed"
        variant="danger"
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={applyDialogOpen}
        onClose={onApplyClose}
        onConfirm={onApplyConfirm}
        title="Apply the amendment to the document?"
        message="This makes a new version of the document with the amendment's changes in it."
        confirmText="Apply the amendment"
        loading={actionLoading}
      />
    </>
  );
}
