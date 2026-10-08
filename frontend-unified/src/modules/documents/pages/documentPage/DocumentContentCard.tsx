import { Plus, FileText, Clock, FileUp } from 'lucide-react';
import { Version, SectionTree as SectionTreeType } from '../../../../api/client';
import SectionTree from '../../components/SectionTree';
import { formatCalendarDate, formatDateTime } from '../../../../utils/dates';

interface DocumentContentCardProps {
  selectedVersion: Version | null;
  sectionTree: SectionTreeType[];
  selectedSection: SectionTreeType | null;
  /** Whether the user may change the document (secretary and above) */
  canEdit: boolean;
  /**
   * Whether the version shown is the current one: only its sections change, and an earlier
   * version is the record
   */
  isCurrentVersion: boolean;
  onSelectSection: (section: SectionTreeType | null) => void;
  onEditSection: (section: SectionTreeType) => void;
  onDeleteSection: (section: SectionTreeType) => void;
  onAddChild: (parent: SectionTreeType) => void;
  onReorder: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  onAddSection: () => void;
  onCreateVersion: () => void;
  /** Open the import screen; without it, no import is offered */
  onImport?: () => void;
  /** The organization's time zone, for when the version was made */
  timeZone?: string;
}

export function DocumentContentCard({
  selectedVersion,
  sectionTree,
  selectedSection,
  canEdit,
  isCurrentVersion,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddChild,
  onReorder,
  onAddSection,
  onCreateVersion,
  onImport,
  timeZone,
}: DocumentContentCardProps) {
  // Sections of an earlier version stay as they were adopted (the server refuses changes)
  const canEditSections = canEdit && (!selectedVersion || isCurrentVersion);
  return (
    <>
      <div className="card">
        <div className="px-4 py-3 border-b border-rule flex flex-wrap items-center justify-between gap-2">
          <h3 className="label-caps">Contents</h3>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {onImport && selectedVersion && (
                <button onClick={onImport} className="btn-ghost btn-sm whitespace-nowrap">
                  <FileUp className="w-4 h-4" aria-hidden="true" />
                  Import a new version
                </button>
              )}
              <button onClick={onCreateVersion} className="btn-ghost btn-sm whitespace-nowrap">
                <Plus className="w-4 h-4" aria-hidden="true" />
                New version
              </button>
              {/* A section belongs to a version; there is none to add to until one exists */}
              {canEditSections && (
                <button
                  onClick={onAddSection}
                  className="btn-primary btn-sm whitespace-nowrap"
                  disabled={!selectedVersion}
                  title={selectedVersion ? undefined : 'Create a version first'}
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add section
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4">
          {canEdit && selectedVersion && !isCurrentVersion && (
            <p className="mb-4 rounded-md border border-rule bg-surface-2 px-3 py-2 text-sm text-ink-muted">
              This is an earlier version, kept as it was. Only the current version can be changed.
            </p>
          )}
          {!selectedVersion ? (
            <EmptyState
              message={
                !canEdit
                  ? 'This document has no content yet.'
                  : onImport
                    ? 'Import the bylaws from text or a file, or create a version and add sections one at a time.'
                    : 'Create a version to start adding content.'
              }
              action={
                !canEdit
                  ? undefined
                  : onImport
                    ? { text: 'Import the bylaws', onClick: onImport }
                    : { text: 'Create the first version', onClick: onCreateVersion }
              }
              secondary={
                canEdit && onImport
                  ? { text: 'Create the first version', onClick: onCreateVersion }
                  : undefined
              }
            />
          ) : sectionTree.length === 0 ? (
            <EmptyState
              message="This document has no sections yet."
              action={
                canEditSections
                  ? { text: 'Add the first section', onClick: onAddSection }
                  : undefined
              }
            />
          ) : (
            <SectionTree
              sections={sectionTree}
              selectedSectionId={selectedSection?.id}
              onSelectSection={onSelectSection}
              onEditSection={onEditSection}
              onDeleteSection={onDeleteSection}
              onAddChild={onAddChild}
              onReorder={canEditSections ? onReorder : undefined}
              editable={canEditSections}
            />
          )}
        </div>
      </div>

      {/* Version info */}
      {selectedVersion && (
        <div className="mt-4 card p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" aria-hidden="true" />
              Created {formatDateTime(selectedVersion.createdAt, timeZone)}
            </div>
            {selectedVersion.effectiveDate && (
              <div>Effective {formatCalendarDate(selectedVersion.effectiveDate)}</div>
            )}
            {selectedVersion.notes && (
              <div className="min-w-0 flex-1 truncate">Notes: {selectedVersion.notes}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({
  message,
  action,
  secondary,
}: {
  message: string;
  action?: { text: string; onClick: () => void };
  secondary?: { text: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-8">
      <FileText className="w-10 h-10 text-ink-muted mx-auto mb-3" aria-hidden="true" />
      <p className={`text-ink-muted ${action ? 'mb-4' : ''}`}>{message}</p>
      {action && (
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={action.onClick} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" aria-hidden="true" />
            {action.text}
          </button>
          {secondary && (
            <button onClick={secondary.onClick} className="btn-secondary btn-sm">
              {secondary.text}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
