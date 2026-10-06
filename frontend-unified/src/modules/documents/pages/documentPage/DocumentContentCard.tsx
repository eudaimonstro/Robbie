import { Plus, FileText, Clock } from 'lucide-react';
import { Version, SectionTree as SectionTreeType } from '../../../../api/client';
import SectionTree from '../../components/SectionTree';

interface DocumentContentCardProps {
  selectedVersion: Version | null;
  sectionTree: SectionTreeType[];
  selectedSection: SectionTreeType | null;
  onSelectSection: (section: SectionTreeType | null) => void;
  onEditSection: (section: SectionTreeType) => void;
  onDeleteSection: (section: SectionTreeType) => void;
  onAddChild: (parent: SectionTreeType) => void;
  onReorder: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  onAddSection: () => void;
  onCreateVersion: () => void;
}

export function DocumentContentCard({
  selectedVersion,
  sectionTree,
  selectedSection,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddChild,
  onReorder,
  onAddSection,
  onCreateVersion,
}: DocumentContentCardProps) {
  return (
    <>
      <div className="card">
        <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
          <h3 className="font-semibold text-secondary-900 dark:text-white">Document Content</h3>
          <div className="flex items-center gap-2">
            <button onClick={onCreateVersion} className="btn-ghost btn-sm">
              <Plus className="w-4 h-4 mr-1" />
              New Version
            </button>
            <button onClick={onAddSection} className="btn-primary btn-sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Section
            </button>
          </div>
        </div>

        <div className="p-4">
          {!selectedVersion ? (
            <EmptyState
              message="Create a version to start adding content."
              buttonText="Create First Version"
              onAction={onCreateVersion}
            />
          ) : sectionTree.length === 0 ? (
            <EmptyState
              message="This document has no sections yet."
              buttonText="Add First Section"
              onAction={onAddSection}
            />
          ) : (
            <SectionTree
              sections={sectionTree}
              selectedSectionId={selectedSection?.id}
              onSelectSection={onSelectSection}
              onEditSection={onEditSection}
              onDeleteSection={onDeleteSection}
              onAddChild={onAddChild}
              onReorder={onReorder}
              editable
            />
          )}
        </div>
      </div>

      {/* Version info */}
      {selectedVersion && (
        <div className="mt-4 card p-4">
          <div className="flex items-center gap-4 text-sm text-secondary-600 dark:text-secondary-400">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Created: {new Date(selectedVersion.createdAt).toLocaleString()}
            </div>
            {selectedVersion.effectiveDate && (
              <div>Effective: {new Date(selectedVersion.effectiveDate).toLocaleDateString()}</div>
            )}
            {selectedVersion.notes && (
              <div className="flex-1 truncate">Notes: {selectedVersion.notes}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({
  message,
  buttonText,
  onAction,
}: {
  message: string;
  buttonText: string;
  onAction: () => void;
}) {
  return (
    <div className="text-center py-8">
      <FileText className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
      <p className="text-secondary-600 dark:text-secondary-400 mb-4">{message}</p>
      <button onClick={onAction} className="btn-primary btn-sm">
        <Plus className="w-4 h-4 mr-1" />
        {buttonText}
      </button>
    </div>
  );
}
