import { Link } from 'react-router-dom';
import { Amendment } from '../../../../api/client';
import { StatusBadge } from '../../../../components/ui/Badge';

interface PendingAmendmentsPanelProps {
  amendments: Amendment[];
  documentId: string;
}

export function PendingAmendmentsPanel({ amendments, documentId }: PendingAmendmentsPanelProps) {
  return (
    <div className="w-80 flex-shrink-0">
      <div className="card sticky top-6">
        <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
          <h3 className="font-semibold text-secondary-900 dark:text-white text-sm">
            Pending Amendments
          </h3>
        </div>

        {amendments.length === 0 ? (
          <div className="p-4 text-center text-sm text-secondary-500">No pending amendments</div>
        ) : (
          <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
            {amendments.map((amendment) => (
              <Link
                key={amendment.id}
                to={`/amendments/${amendment.id}`}
                className="block px-4 py-3 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-secondary-900 dark:text-white truncate">
                    {amendment.title}
                  </span>
                  <StatusBadge status={amendment.status} />
                </div>
                {amendment.description && (
                  <p className="text-xs text-secondary-500 line-clamp-2">{amendment.description}</p>
                )}
                <p className="text-xs text-secondary-400 mt-1">
                  {amendment.changes?.length || 0} change(s)
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="px-4 py-2 border-t border-secondary-200 dark:border-secondary-700">
          <Link
            to={`/documents/${documentId}/amendments`}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View all amendments
          </Link>
        </div>
      </div>
    </div>
  );
}
