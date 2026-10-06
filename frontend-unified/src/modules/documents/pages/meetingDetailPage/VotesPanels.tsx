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
      <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
        <h3 className="font-semibold text-secondary-900 dark:text-white">
          Recorded Votes ({votes.length})
        </h3>
      </div>
      {votes.length === 0 ? (
        <div className="p-6 text-center text-sm text-secondary-500">No votes recorded yet</div>
      ) : (
        <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
          {votes.map((vote) => (
            <div key={vote.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-secondary-900 dark:text-white">
                  {getAmendmentTitle(vote.amendment_id)}
                </span>
                <span className={`badge ${vote.passed ? 'badge-passed' : 'badge-failed'}`}>
                  {vote.passed ? 'Passed' : 'Failed'}
                </span>
              </div>
              <p className="text-xs text-secondary-500 mb-2">
                {getDocumentTitle(vote.amendment_id)}
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-success-600">Yea: {vote.yea_count}</span>
                <span className="text-danger-600">Nay: {vote.nay_count}</span>
                <span className="text-secondary-500">Abstain: {vote.abstain_count}</span>
              </div>
              <p className="text-xs text-secondary-400 mt-2">
                Recorded: {new Date(vote.recorded_at).toLocaleString()}
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
      <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
        <h3 className="font-semibold text-secondary-900 dark:text-white">
          Pending Amendments ({amendments.length})
        </h3>
        {isInProgress && amendments.length > 0 && (
          <button onClick={() => onRecordVote(amendments[0])} className="btn-primary btn-sm">
            <Plus className="w-4 h-4 mr-1" />
            Record Vote
          </button>
        )}
      </div>
      {amendments.length === 0 ? (
        <div className="p-6 text-center text-sm text-secondary-500">
          All proposed amendments have been voted on
        </div>
      ) : (
        <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
          {amendments.map((amendment) => (
            <div
              key={amendment.id}
              className={`p-4 ${isInProgress ? 'hover:bg-secondary-50 dark:hover:bg-secondary-800/50 cursor-pointer' : ''}`}
              onClick={() => isInProgress && onRecordVote(amendment)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-secondary-900 dark:text-white">
                  {amendment.title}
                </span>
                <StatusBadge status={amendment.status} />
              </div>
              <p className="text-xs text-secondary-500 mb-1">
                {documents.find((d) => d.id === amendment.document_id)?.title}
              </p>
              {amendment.description && (
                <p className="text-xs text-secondary-400 line-clamp-2">{amendment.description}</p>
              )}
              <p className="text-xs text-secondary-400 mt-1">
                {amendment.changes?.length || 0} change(s)
              </p>
            </div>
          ))}
        </div>
      )}

      {!isInProgress && amendments.length > 0 && (
        <div className="px-4 py-3 bg-secondary-50 dark:bg-secondary-800/50 text-sm text-secondary-600 dark:text-secondary-400">
          Start the meeting to record votes on amendments.
        </div>
      )}
    </div>
  );
}
