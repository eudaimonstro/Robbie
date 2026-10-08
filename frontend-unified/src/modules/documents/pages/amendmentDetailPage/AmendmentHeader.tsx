import { Link } from 'react-router-dom';
import { ChevronRight, Edit2, Send, XCircle, CheckCircle, RotateCcw } from 'lucide-react';
import { Amendment, Document } from '../../../../api/client';
import { StatusBadge } from '../../../../components/ui/Badge';

interface AmendmentHeaderProps {
  amendment: Amendment;
  document: Document;
  organizationName?: string;
  /** Whether the user may propose, withdraw, decide and apply amendments (secretary and above) */
  canDecide: boolean;
  /** Whether the user may edit this amendment: a draft, theirs or as a secretary */
  canEditDraft: boolean;
  onEdit: () => void;
  onPropose: () => void;
  onWithdraw: () => void;
  onPass: () => void;
  onFail: () => void;
  onApply: () => void;
}

export function AmendmentHeader({
  amendment,
  document,
  organizationName,
  canDecide,
  canEditDraft,
  onEdit,
  onPropose,
  onWithdraw,
  onPass,
  onFail,
  onApply,
}: AmendmentHeaderProps) {
  const isDraft = amendment.status === 'draft';
  const isProposed = amendment.status === 'proposed';
  const isPassed = amendment.status === 'passed';
  const canEdit = isDraft && canEditDraft;
  const canPropose = canDecide && isDraft && (amendment.changes?.length ?? 0) > 0;
  const canWithdraw = canDecide && (isDraft || isProposed);
  const canVote = canDecide && isProposed;
  const canApply = canDecide && isPassed && !amendment.resultingVersionId;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted mb-1">
        <Link to="/" className="inline-flex items-center max-md:min-h-11 hover:text-gavel">
          {organizationName}
        </Link>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
        <Link
          to={`/documents/${document.id}`}
          className="inline-flex items-center max-md:min-h-11 hover:text-gavel"
        >
          {document.title}
        </Link>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
        <span>Amendment</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="page-title">{amendment.title}</h2>
          <StatusBadge status={amendment.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button onClick={onEdit} className="btn-ghost btn-sm">
              <Edit2 className="w-4 h-4" aria-hidden="true" />
              Edit
            </button>
          )}
          {canWithdraw && (
            <button onClick={onWithdraw} className="btn-ghost btn-sm text-ink-muted">
              <XCircle className="w-4 h-4" aria-hidden="true" />
              Withdraw
            </button>
          )}
          {canPropose && (
            <button onClick={onPropose} className="btn-primary btn-sm">
              <Send className="w-4 h-4" aria-hidden="true" />
              Propose
            </button>
          )}
          {canVote && (
            <>
              <button onClick={onFail} className="btn-danger btn-sm">
                <XCircle className="w-4 h-4" aria-hidden="true" />
                Mark failed
              </button>
              <button onClick={onPass} className="btn-success btn-sm">
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                Mark passed
              </button>
            </>
          )}
          {canApply && (
            <button onClick={onApply} className="btn-primary btn-sm">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Apply to the document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
