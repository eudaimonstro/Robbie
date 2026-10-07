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
      <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
        <h3 className="font-semibold text-ink">Proposed Changes ({changes.length})</h3>
        {canEdit && (
          <button onClick={onAddChange} className="btn-primary btn-sm">
            <Plus className="w-4 h-4 mr-1" />
            Add Change
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-caution mx-auto mb-3" />
          <p className="text-ink-muted mb-4">
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
        <div className="divide-y divide-rule">
          {changes.map((change, index) => (
            <div key={change.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-ink-muted">Change {index + 1}:</span>
                    <span
                      className={`badge ${
                        change.changeType === 'add'
                          ? 'badge-passed'
                          : change.changeType === 'delete'
                            ? 'badge-failed'
                            : 'badge-proposed'
                      }`}
                    >
                      {CHANGE_TYPE_LABELS[change.changeType]}
                    </span>
                  </div>

                  {change.targetSectionId && (
                    <p className="text-sm text-ink-muted mb-2">
                      Target: {getSectionLabel(sectionTree, change.targetSectionId)}
                    </p>
                  )}

                  {(change.newNumberLabel || change.newTitle) && (
                    <p className="text-sm mb-2">
                      {change.newNumberLabel && (
                        <span className="font-medium text-gavel">{change.newNumberLabel}</span>
                      )}
                      {change.newTitle && <span className="ml-2">{change.newTitle}</span>}
                    </p>
                  )}

                  {change.newContent && (
                    <div className="bg-surface-2 p-3 rounded-sm text-sm text-ink">
                      {change.newContent}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <button
                    onClick={() => onDeleteChange(change)}
                    className="p-1 text-ink-muted hover:text-gavel rounded-sm"
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
