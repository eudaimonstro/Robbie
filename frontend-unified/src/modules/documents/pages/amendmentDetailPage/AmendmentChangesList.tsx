import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { AmendmentChange, SectionTree } from '../../../../api/client';
import { getSectionLabel, sectionInTree } from './useAmendmentData';
import { count } from '../../../../utils/plural';

interface AmendmentChangesListProps {
  changes: AmendmentChange[];
  sectionTree: SectionTree[];
  canEdit: boolean;
  /**
   * A draft or proposed amendment: its changes are written against the current version, so a
   * change to a section that isn't in it (a new version left it out) says so
   */
  open?: boolean;
  onAddChange: () => void;
  onDeleteChange: (change: AmendmentChange) => void;
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  add: 'Add a section',
  modify: 'Change a section',
  delete: 'Remove a section',
  renumber: 'Renumber a section',
};

export function AmendmentChangesList({
  changes,
  sectionTree,
  canEdit,
  open = false,
  onAddChange,
  onDeleteChange,
}: AmendmentChangesListProps) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-rule flex flex-wrap items-center justify-between gap-2">
        <h3 className="label-caps">
          Proposed changes <span className="normal-case">({count(changes.length, 'change')})</span>
        </h3>
        {canEdit && (
          <button onClick={onAddChange} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add a change
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-caution mx-auto mb-3" aria-hidden="true" />
          <p className="text-ink-muted mb-4">
            No changes yet. Add the changes this amendment makes to the document.
          </p>
          {canEdit && (
            <button onClick={onAddChange} className="btn-primary btn-sm">
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add the first change
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
                      Section:{' '}
                      {getSectionLabel(sectionTree, change.targetSectionId, change.targetLabel)}
                    </p>
                  )}
                  {open &&
                    change.targetSectionId &&
                    sectionTree.length > 0 &&
                    !sectionInTree(sectionTree, change.targetSectionId) && (
                      <p className="mb-2 rounded-sm bg-caution-tint px-3 py-2 text-sm text-caution-ink">
                        {change.targetLabel ?? 'This section'} is no longer in the bylaws, so this
                        change can&apos;t apply as written.
                        {canEdit && ' Delete it and add it again against the current text.'}
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
                    className="p-1 max-md:p-3.5 max-md:-m-2.5 text-ink-muted hover:text-gavel rounded-sm"
                    title="Delete the change"
                    aria-label={`Delete change ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
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
