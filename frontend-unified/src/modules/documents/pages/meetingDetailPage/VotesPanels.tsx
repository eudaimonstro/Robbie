import { Plus } from 'lucide-react';
import { Vote, Amendment, Document } from '../../../../api/client';
import { StatusBadge } from '../../../../components/ui/Badge';

interface RecordedVotesPanelProps {
  votes: Vote[];
  getAmendmentTitle: (id: string) => string;
  getDocumentTitle: (id: string) => string;
}

export function RecordedVotesPanel({
  votes,
  getAmendmentTitle,
  getDocumentTitle,
}: RecordedVotesPanelProps) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-rule">
        <h3 className="font-semibold text-ink">Recorded Votes ({votes.length})</h3>
      </div>
      {votes.length === 0 ? (
        <div className="p-6 text-center text-sm text-ink-muted">No votes recorded yet</div>
      ) : (
        <div className="divide-y divide-rule">
          {votes.map((vote) => (
            <div key={vote.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-ink">{getAmendmentTitle(vote.amendmentId)}</span>
                <span
                  className={`badge ${vote.result === 'passed' ? 'badge-passed' : 'badge-failed'}`}
                >
                  {vote.result === 'passed' ? 'Passed' : 'Failed'}
                </span>
              </div>
              <p className="text-xs text-ink-muted mb-2">{getDocumentTitle(vote.amendmentId)}</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-carried">Yea: {vote.yeaCount}</span>
                <span className="text-gavel">Nay: {vote.nayCount}</span>
                <span className="text-ink-muted">Abstain: {vote.abstainCount}</span>
              </div>
              <p className="text-xs text-ink-muted mt-2">
                Recorded: {new Date(vote.recordedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PendingAmendmentsPanelProps {
  amendments: Amendment[];
  documents: Document[];
  isInProgress: boolean;
  onRecordVote: (amendment: Amendment) => void;
}

export function PendingAmendmentsPanel({
  amendments,
  documents,
  isInProgress,
  onRecordVote,
}: PendingAmendmentsPanelProps) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
        <h3 className="font-semibold text-ink">Pending Amendments ({amendments.length})</h3>
        {isInProgress && amendments.length > 0 && (
          <button onClick={() => onRecordVote(amendments[0])} className="btn-primary btn-sm">
            <Plus className="w-4 h-4 mr-1" />
            Record Vote
          </button>
        )}
      </div>
      {amendments.length === 0 ? (
        <div className="p-6 text-center text-sm text-ink-muted">
          All proposed amendments have been voted on
        </div>
      ) : (
        <div className="divide-y divide-rule">
          {amendments.map((amendment) => (
            <div
              key={amendment.id}
              className={`p-4 ${isInProgress ? 'hover:bg-surface-2 cursor-pointer' : ''}`}
              onClick={() => isInProgress && onRecordVote(amendment)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-ink">{amendment.title}</span>
                <StatusBadge status={amendment.status} />
              </div>
              <p className="text-xs text-ink-muted mb-1">
                {documents.find((d) => d.id === amendment.documentId)?.title}
              </p>
              {amendment.description && (
                <p className="text-xs text-ink-muted line-clamp-2">{amendment.description}</p>
              )}
              <p className="text-xs text-ink-muted mt-1">
                {amendment.changes?.length || 0} change(s)
              </p>
            </div>
          ))}
        </div>
      )}

      {!isInProgress && amendments.length > 0 && (
        <div className="px-4 py-3 bg-surface-2 text-sm text-ink-muted">
          Start the meeting to record votes on amendments.
        </div>
      )}
    </div>
  );
}
