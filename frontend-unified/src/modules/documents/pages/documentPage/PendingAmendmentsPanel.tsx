import { Link } from 'react-router-dom';
import { Amendment } from '../../../../api/client';
import { StatusBadge } from '../../../../components/ui/Badge';
import { count } from '../../../../utils/plural';

interface PendingAmendmentsPanelProps {
  amendments: Amendment[];
  documentId: string;
}

export function PendingAmendmentsPanel({ amendments, documentId }: PendingAmendmentsPanelProps) {
  return (
    <div className="w-full xl:w-80 shrink-0">
      <div className="card sticky top-6">
        <div className="px-4 py-3 border-b border-rule">
          <h3 className="label-caps">Pending amendments</h3>
        </div>

        {amendments.length === 0 ? (
          <div className="p-4 text-center text-sm text-ink-muted">No pending amendments.</div>
        ) : (
          <div className="divide-y divide-rule">
            {amendments.map((amendment) => (
              <Link
                key={amendment.id}
                to={`/amendments/${amendment.id}`}
                className="block px-4 py-3 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="min-w-0 font-medium text-sm text-ink truncate">
                    {amendment.title}
                  </span>
                  <span className="shrink-0">
                    <StatusBadge status={amendment.status} />
                  </span>
                </div>
                {amendment.description && (
                  <p className="text-xs text-ink-muted line-clamp-2">{amendment.description}</p>
                )}
                <p className="text-xs text-ink-muted mt-1">
                  {count(amendment.changes?.length ?? 0, 'change')}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="px-4 py-2 border-t border-rule">
          <Link
            to={`/documents/${documentId}/amendments`}
            className="inline-flex items-center text-sm text-gavel hover:underline max-md:min-h-11"
          >
            All amendments to this document
          </Link>
        </div>
      </div>
    </div>
  );
}
