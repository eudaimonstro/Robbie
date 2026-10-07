import { useState, useCallback } from 'react';
import type { BylawAmendmentFormProps, BylawChangeType, BylawAmendment } from '../types';
import {
  useBylawAmendmentData,
  ChangeTypeSelector,
  SectionSelector,
  ContentFields,
  DeletePreview,
  LoadingState,
  ErrorState,
  NoOrgLinkedState,
  NoDocumentsState,
  LoadingSections,
} from './bylawAmendment';

export function BylawAmendmentForm({ meetingCode, onSubmit, onCancel }: BylawAmendmentFormProps) {
  const {
    linkedOrg,
    documents,
    flatSections,
    loading,
    loadingSections,
    error,
    selectedDocumentId,
    setSelectedDocumentId,
  } = useBylawAmendmentData(meetingCode);

  // Form state
  const [changeType, setChangeType] = useState<BylawChangeType>('modify');
  const [targetSectionId, setTargetSectionId] = useState<string>('');
  const [parentSectionId, setParentSectionId] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newNumberLabel, setNewNumberLabel] = useState<string>('');

  const selectedDocument = documents.find((d) => d.id === selectedDocumentId);
  const selectedSection = flatSections.find((s) => s.id === targetSectionId);

  const buildMotionText = useCallback((): string => {
    const parentSection = flatSections.find((s) => s.id === parentSectionId);

    switch (changeType) {
      case 'add':
        return `I move to amend the bylaws by adding a new section${parentSection ? ` under ${parentSection.numberLabel} "${parentSection.title}"` : ''}: "${newTitle}"`;
      case 'modify':
        return `I move to amend the bylaws by modifying ${selectedSection?.numberLabel || 'section'} "${selectedSection?.title || 'selected section'}"`;
      case 'delete':
        return `I move to amend the bylaws by deleting ${selectedSection?.numberLabel || 'section'} "${selectedSection?.title || 'selected section'}"`;
      case 'renumber':
        return `I move to amend the bylaws by renumbering ${selectedSection?.numberLabel || 'section'} to ${newNumberLabel}`;
    }
  }, [changeType, flatSections, parentSectionId, selectedSection, newTitle, newNumberLabel]);

  const handleSubmit = useCallback(() => {
    if (!selectedDocumentId) return;

    const bylawAmendment: BylawAmendment = {
      documentId: selectedDocumentId,
      documentTitle: selectedDocument?.title,
      changeType,
    };

    switch (changeType) {
      case 'add':
        bylawAmendment.parentSectionId = parentSectionId || undefined;
        bylawAmendment.newTitle = newTitle;
        bylawAmendment.newContent = newContent;
        bylawAmendment.newNumberLabel = newNumberLabel || undefined;
        break;
      case 'modify':
        if (!targetSectionId) return;
        bylawAmendment.targetSectionId = targetSectionId;
        bylawAmendment.targetSectionLabel = selectedSection
          ? `${selectedSection.numberLabel} "${selectedSection.title}"`
          : undefined;
        bylawAmendment.newContent = newContent;
        if (newTitle) bylawAmendment.newTitle = newTitle;
        break;
      case 'delete':
        if (!targetSectionId) return;
        bylawAmendment.targetSectionId = targetSectionId;
        bylawAmendment.targetSectionLabel = selectedSection
          ? `${selectedSection.numberLabel} "${selectedSection.title}"`
          : undefined;
        break;
      case 'renumber':
        if (!targetSectionId) return;
        bylawAmendment.targetSectionId = targetSectionId;
        bylawAmendment.targetSectionLabel = selectedSection
          ? `${selectedSection.numberLabel} "${selectedSection.title}"`
          : undefined;
        bylawAmendment.newNumberLabel = newNumberLabel;
        break;
    }

    onSubmit(buildMotionText(), bylawAmendment);
  }, [
    selectedDocumentId,
    selectedDocument,
    changeType,
    parentSectionId,
    newTitle,
    newContent,
    newNumberLabel,
    targetSectionId,
    selectedSection,
    onSubmit,
    buildMotionText,
  ]);

  const canSubmit = useCallback((): boolean => {
    if (!selectedDocumentId) return false;
    switch (changeType) {
      case 'add':
        return newTitle.trim().length > 0 && newContent.trim().length > 0;
      case 'modify':
        return targetSectionId.length > 0 && newContent.trim().length > 0;
      case 'delete':
        return targetSectionId.length > 0;
      case 'renumber':
        return targetSectionId.length > 0 && newNumberLabel.trim().length > 0;
      default:
        return false;
    }
  }, [selectedDocumentId, changeType, newTitle, newContent, targetSectionId, newNumberLabel]);

  // Early returns for status states
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onCancel={onCancel} />;
  if (!linkedOrg?.linked || !linkedOrg.organization)
    return <NoOrgLinkedState onCancel={onCancel} />;
  if (documents.length === 0)
    return <NoDocumentsState orgName={linkedOrg.organization.name} onCancel={onCancel} />;

  return (
    <div className="space-y-4">
      {/* Organization Info Banner */}
      <div className="bg-gavel-tint border border-gavel/30 rounded-lg p-3">
        <p className="text-sm text-ink">
          Proposing amendment for <span className="font-medium">{linkedOrg.organization.name}</span>
        </p>
      </div>

      {/* Document Selection */}
      <div>
        <label className="block text-sm font-medium text-ink mb-1">Document</label>
        <select
          value={selectedDocumentId}
          onChange={(e) => setSelectedDocumentId(e.target.value)}
          className="w-full p-3 border border-rule rounded-lg bg-surface text-ink"
        >
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </select>
      </div>

      {/* Change Type Selection */}
      <ChangeTypeSelector value={changeType} onChange={setChangeType} />

      {loadingSections ? (
        <LoadingSections />
      ) : (
        <>
          {/* Section Selection - for modify, delete, renumber */}
          {changeType !== 'add' && (
            <SectionSelector
              label={`Section to ${changeType === 'modify' ? 'Modify' : changeType === 'delete' ? 'Delete' : 'Renumber'}`}
              value={targetSectionId}
              onChange={setTargetSectionId}
              sections={flatSections}
            />
          )}

          {/* Parent Section - for add */}
          {changeType === 'add' && (
            <SectionSelector
              label="Parent Section (optional)"
              value={parentSectionId}
              onChange={setParentSectionId}
              sections={flatSections}
              allowEmpty
              emptyLabel="Top level (no parent)"
            />
          )}

          {/* Dynamic Content Fields */}
          <ContentFields
            changeType={changeType}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newContent={newContent}
            setNewContent={setNewContent}
            newNumberLabel={newNumberLabel}
            setNewNumberLabel={setNewNumberLabel}
          />

          {/* Preview for delete */}
          {changeType === 'delete' && selectedSection && (
            <DeletePreview section={selectedSection} />
          )}
        </>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-lg border border-rule text-ink hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit()}
          className="flex-1 py-3 rounded-lg bg-gavel text-paper hover:bg-gavel/90 disabled:bg-rule disabled:cursor-not-allowed font-medium"
        >
          Submit Motion
        </button>
      </div>
    </div>
  );
}
