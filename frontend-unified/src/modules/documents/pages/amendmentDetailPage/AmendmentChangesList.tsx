import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { AmendmentChange, SectionTree } from '../../../../api/client';
import { getSectionLabel } from './useAmendmentData';

interface AmendmentChangesListProps {
  changes: AmendmentChange[];
  sectionTree: SectionTree[];
  canEdit: boolean;
  onAddChange: () => void;
  onDeleteChange: (change: AmendmentChange) => void;
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  add: 'Add Section',
  modify: 'Modify Section',
  delete: 'Delete Section',
  renumber: 'Renumber Section',
};

export function AmendmentChangesList({
  changes,
  sectionTree,
  canEdit,
  onAddChange,
  onDeleteChange,
}: AmendmentChangesListProps) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
        <h3 className="font-semibold text-secondary-900 dark:text-white">
          Proposed Changes ({changes.length})
        </h3>
        {canEdit && (
          <button onClick={onAddChange} className="btn-primary btn-sm">
            <Plus className="w-4 h-4 mr-1" />
            Add Change
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-accent-500 mx-auto mb-3" />
          <p className="text-secondary-600 dark:text-secondary-400 mb-4">
            No changes defined yet. Add changes to specify what this amendment will modify.
          </p>
          {canEdit && (
            <button onClick={onAddChange} className="btn-primary btn-sm">
              <Plus className="w-4 h-4 mr-1" />
              Add First Change
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
          {changes.map((change, index) => (
            <div key={change.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-secondary-500">
                      Change {index + 1}:
                    </span>
                    <span
                      className={`badge ${
                        change.change_type === 'add'
                          ? 'badge-passed'
                          : change.change_type === 'delete'
                            ? 'badge-failed'
                            : 'badge-proposed'
                      }`}
                    >
                      {CHANGE_TYPE_LABELS[change.change_type]}
                    </span>
                  </div>

                  {change.target_section_id && (
                    <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-2">
                      Target: {getSectionLabel(sectionTree, change.target_section_id)}
                    </p>
                  )}

                  {(change.new_number_label || change.new_title) && (
                    <p className="text-sm mb-2">
                      {change.new_number_label && (
                        <span className="font-medium text-primary-600">
                          {change.new_number_label}
                        </span>
                      )}
                      {change.new_title && <span className="ml-2">{change.new_title}</span>}
                    </p>
                  )}

                  {change.new_content && (
                    <div className="bg-secondary-50 dark:bg-secondary-800/50 p-3 rounded text-sm text-secondary-700 dark:text-secondary-300">
                      {change.new_content}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <button
                    onClick={() => onDeleteChange(change)}
                    className="p-1 text-secondary-400 hover:text-danger-600 rounded"
                    title="Delete change"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
