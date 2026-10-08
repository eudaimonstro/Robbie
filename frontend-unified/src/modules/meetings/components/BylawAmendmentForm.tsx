import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  MAX_BYLAW_LABEL_LENGTH,
  MAX_BYLAW_TEXT_LENGTH,
  MAX_BYLAW_TITLE_LENGTH,
} from '@robbie-bylawyer/shared/constants';
import { bylawChangeView, bylawMotionText, sectionLabel } from '@robbie-bylawyer/shared/utils';
import type { Amendment } from '../../../api/client';
import type { BylawAmendmentFormProps, BylawChangeType, BylawAmendment } from '../types';
import { BylawText } from './BylawText';
import {
  useBylawAmendmentData,
  SectionSelector,
  LoadingState,
  ErrorState,
  NoOrgLinkedState,
  NoDocumentsState,
  LoadingSections,
  type FlatSection,
} from './bylawAmendment';

/** The kinds of change, in the words the phone uses */
const KINDS: Array<{ value: BylawChangeType; label: string }> = [
  { value: 'modify', label: 'Change' },
  { value: 'add', label: 'Add' },
  { value: 'delete', label: 'Strike out' },
  { value: 'renumber', label: 'Renumber' },
];

/** How near the limit the wording gets before the form says how much room is left */
const WARN_WITHIN = 1000;

/** Where the motion comes from: a proposed amendment as drafted, or a change written here */
type Source = 'proposed' | 'new';

const labelOf = (section: FlatSection | undefined) => (section ? sectionLabel(section) : undefined);

/**
 * A proposed amendment's change as the motion carries it, with the section's current text, for
 * the preview: one change only (the server refuses more)
 */
function proposedChange(
  amendment: Amendment,
  documentId: string,
  sections: FlatSection[],
): BylawAmendment | null {
  if (amendment.changes.length !== 1) return null;
  const [change] = amendment.changes;
  const section = sections.find((s) => s.id === change.targetSectionId);
  const add = change.changeType === 'add';
  return {
    documentId,
    amendmentId: amendment.id,
    amendmentTitle: amendment.title,
    changeType: change.changeType,
    ...(add
      ? {
          parentSectionId: change.targetSectionId ?? undefined,
          parentSectionLabel: labelOf(section),
        }
      : {
          targetSectionId: change.targetSectionId ?? undefined,
          targetSectionLabel: labelOf(section),
          currentTitle: section?.title ?? undefined,
          currentContent: section?.content ?? undefined,
        }),
    newContent: change.newContent ?? undefined,
    newTitle: change.newTitle ?? undefined,
    newNumberLabel: change.newNumberLabel ?? undefined,
  };
}

/** The motion's words, a line under the form, as the server will set them */
function MotionWords({ change }: { change: BylawAmendment }) {
  return (
    <p className="text-sm text-ink-muted">
      The motion: <span className="text-ink">{bylawMotionText(change)}</span>
    </p>
  );
}

/**
 * Amend the bylaws from a phone: move one of the document's proposed amendments as it was
 * drafted, or write a change, starting from the section's current text. The room sees the
 * section and its text on the question card; the server checks them against the bylaws.
 */
export function BylawAmendmentForm({ meetingCode, onSubmit, onCancel }: BylawAmendmentFormProps) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const {
    linkedOrg,
    documents,
    flatSections,
    loading,
    loadingSections,
    error,
    selectedDocumentId,
    setSelectedDocumentId,
    proposed,
    loadingProposed,
  } = useBylawAmendmentData(meetingCode);

  // Proposed amendments first, when the document has any
  const [chosenSource, setSource] = useState<Source | null>(null);
  const source: Source = chosenSource ?? (proposed.length > 0 ? 'proposed' : 'new');
  const [amendmentId, setAmendmentId] = useState('');

  const [changeType, setChangeType] = useState<BylawChangeType>('modify');
  const [targetSectionId, setTargetSectionId] = useState('');
  const [parentSectionId, setParentSectionId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newNumberLabel, setNewNumberLabel] = useState('');

  const target = flatSections.find((s) => s.id === targetSectionId);
  const parent = flatSections.find((s) => s.id === parentSectionId);

  // Choosing a section starts the new wording from what it says now: an edit, not a retyping
  const chooseTarget = (sectionId: string) => {
    setTargetSectionId(sectionId);
    const section = flatSections.find((s) => s.id === sectionId);
    setNewContent(section?.content ?? '');
    setNewTitle(section?.title ?? '');
    setNewNumberLabel('');
  };
  const chooseKind = (kind: BylawChangeType) => {
    setChangeType(kind);
    setTargetSectionId('');
    setParentSectionId('');
    setNewContent('');
    setNewTitle('');
    setNewNumberLabel('');
  };

  /** The change written here, as the motion carries it */
  const written = useMemo((): BylawAmendment | null => {
    if (!selectedDocumentId) return null;
    const base = { documentId: selectedDocumentId, changeType };
    const trimmed = (text: string) => text.trim() || undefined;
    switch (changeType) {
      case 'add':
        if (!newTitle.trim() && !newContent.trim()) return null;
        return {
          ...base,
          parentSectionId: parentSectionId || undefined,
          parentSectionLabel: labelOf(parent),
          newTitle: trimmed(newTitle),
          newContent: trimmed(newContent),
          newNumberLabel: trimmed(newNumberLabel),
        };
      case 'modify': {
        if (!target) return null;
        // Only what changes: an unchanged title or number stays as it is
        const content =
          newContent.trim() !== (target.content ?? '').trim() ? newContent : undefined;
        const title = newTitle.trim() !== (target.title ?? '') ? newTitle.trim() : undefined;
        if (content === undefined && title === undefined) return null;
        return {
          ...base,
          targetSectionId: target.id,
          targetSectionLabel: labelOf(target),
          currentTitle: target.title ?? undefined,
          currentContent: target.content ?? undefined,
          ...(content !== undefined && { newContent: content }),
          ...(title !== undefined && { newTitle: title }),
        };
      }
      case 'delete':
        if (!target) return null;
        return {
          ...base,
          targetSectionId: target.id,
          targetSectionLabel: labelOf(target),
          currentTitle: target.title ?? undefined,
          currentContent: target.content ?? undefined,
        };
      case 'renumber':
        if (!target || !newNumberLabel.trim()) return null;
        return {
          ...base,
          targetSectionId: target.id,
          targetSectionLabel: labelOf(target),
          newNumberLabel: newNumberLabel.trim(),
        };
    }
  }, [
    selectedDocumentId,
    changeType,
    parentSectionId,
    parent,
    target,
    newTitle,
    newContent,
    newNumberLabel,
  ]);

  const picked = proposed.find((a) => a.id === amendmentId);
  const pickedChange = picked ? proposedChange(picked, selectedDocumentId, flatSections) : null;
  const change = source === 'proposed' ? pickedChange : written;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!change) return;
    // The server fills in every label and current text, and copies a proposed amendment's
    // change itself: only the change goes, with the words as the motion will read
    const sent: BylawAmendment = change.amendmentId
      ? {
          documentId: change.documentId,
          amendmentId: change.amendmentId,
          changeType: change.changeType,
        }
      : {
          documentId: change.documentId,
          changeType: change.changeType,
          ...(change.targetSectionId && { targetSectionId: change.targetSectionId }),
          ...(change.parentSectionId && { parentSectionId: change.parentSectionId }),
          ...(change.newContent !== undefined && { newContent: change.newContent }),
          ...(change.newTitle !== undefined && { newTitle: change.newTitle }),
          ...(change.newNumberLabel !== undefined && { newNumberLabel: change.newNumberLabel }),
        };
    onSubmit(bylawMotionText(change), sent);
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onCancel={onCancel} />;
  if (!linkedOrg?.linked || !linkedOrg.organization)
    return <NoOrgLinkedState onCancel={onCancel} />;
  if (documents.length === 0) {
    return <NoDocumentsState orgName={linkedOrg.organization.name} onCancel={onCancel} />;
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Amend the bylaws">
      <div>
        <label htmlFor={id('document')} className="label">
          Document
        </label>
        <select
          id={id('document')}
          value={selectedDocumentId}
          onChange={(e) => {
            setSelectedDocumentId(e.target.value);
            setAmendmentId('');
            chooseKind(changeType);
          }}
          className="input"
        >
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </select>
      </div>

      {/* Offered once the proposed amendments are in: the default follows whether there are any */}
      {!loadingProposed && (
        <fieldset>
          <legend className="label">The amendment</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['proposed', 'As proposed'],
                ['new', 'Write a change'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  source === value ? 'border-gavel bg-gavel-tint text-ink' : 'border-rule text-ink'
                }`}
              >
                <input
                  type="radio"
                  name={id('source')}
                  value={value}
                  checked={source === value}
                  onChange={() => setSource(value)}
                  className="accent-gavel"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {loadingSections || loadingProposed ? (
        <LoadingSections />
      ) : source === 'proposed' ? (
        <ProposedPicker
          name={id('proposed')}
          proposed={proposed}
          sections={flatSections}
          value={amendmentId}
          onChange={setAmendmentId}
        />
      ) : (
        <>
          <fieldset>
            <legend className="label">Kind of change</legend>
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  aria-pressed={changeType === kind.value}
                  onClick={() => chooseKind(kind.value)}
                  className={`min-h-11 rounded-lg border px-2 text-sm ${
                    changeType === kind.value
                      ? 'border-gavel bg-gavel-tint text-ink'
                      : 'border-rule text-ink-muted hover:border-ink-muted'
                  }`}
                >
                  {kind.label}
                </button>
              ))}
            </div>
          </fieldset>

          {changeType === 'add' ? (
            <SectionSelector
              id={id('parent')}
              label="Goes under"
              value={parentSectionId}
              onChange={setParentSectionId}
              sections={flatSections}
              allowEmpty
              emptyLabel="The top level"
            />
          ) : (
            <SectionSelector
              id={id('section')}
              label="Section"
              value={targetSectionId}
              onChange={chooseTarget}
              sections={flatSections}
            />
          )}

          {target && changeType !== 'add' && (
            <div className="rounded-lg border border-rule bg-surface-2 p-3">
              <p className="label-caps">Now reads</p>
              {target.title && <p className="mt-1 font-semibold text-ink">{target.title}</p>}
              <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line text-sm text-ink">
                {target.content || 'This section has no text of its own.'}
              </p>
            </div>
          )}

          {(changeType === 'add' || changeType === 'renumber') &&
            (changeType === 'add' || target) && (
              <div>
                <label htmlFor={id('number')} className="label">
                  {changeType === 'add' ? 'Number (optional)' : 'New number'}
                </label>
                <input
                  id={id('number')}
                  value={newNumberLabel}
                  onChange={(e) => setNewNumberLabel(e.target.value)}
                  maxLength={MAX_BYLAW_LABEL_LENGTH}
                  className="input"
                />
              </div>
            )}

          {(changeType === 'add' || (changeType === 'modify' && target)) && (
            <>
              <div>
                <label htmlFor={id('title')} className="label">
                  Title
                </label>
                <input
                  id={id('title')}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={MAX_BYLAW_TITLE_LENGTH}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor={id('wording')} className="label">
                  New wording
                </label>
                <textarea
                  id={id('wording')}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  maxLength={MAX_BYLAW_TEXT_LENGTH}
                  rows={6}
                  className="input resize-y"
                  aria-describedby={
                    newContent.length > MAX_BYLAW_TEXT_LENGTH - WARN_WITHIN ? id('room') : undefined
                  }
                />
                {newContent.length > MAX_BYLAW_TEXT_LENGTH - WARN_WITHIN && (
                  <p id={id('room')} className="mt-1 text-sm text-caution-ink" aria-live="polite">
                    {MAX_BYLAW_TEXT_LENGTH - newContent.length} characters left of{' '}
                    {MAX_BYLAW_TEXT_LENGTH.toLocaleString('en-US')}
                  </p>
                )}
              </div>
            </>
          )}
          {changeType === 'modify' && target && !written && (
            <p className="text-sm text-ink-muted">Change the wording or the title to move it.</p>
          )}
        </>
      )}

      {change && (
        <>
          {source === 'proposed' && <BylawText text={bylawChangeView(change)} size="phone" />}
          <MotionWords change={change} />
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={!change} className="btn-primary flex-1">
          Move
        </button>
      </div>
    </form>
  );
}

/** The document's proposed amendments, to move one as drafted */
function ProposedPicker({
  name,
  proposed,
  sections,
  value,
  onChange,
}: {
  name: string;
  proposed: Amendment[];
  sections: FlatSection[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (proposed.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No amendment to this document is proposed. A secretary proposes a draft from Amendments; or
        write the change here.
      </p>
    );
  }
  return (
    <fieldset>
      <legend className="label">Proposed amendments</legend>
      <ul className="space-y-2">
        {proposed.map((amendment) => {
          const [first] = amendment.changes;
          const section = sections.find((s) => s.id === first?.targetSectionId);
          // Why it can't be moved, if it can't: more than one change, or a section the current
          // bylaws no longer have (for an addition, none means the top level)
          const reason =
            amendment.changes.length !== 1
              ? `${amendment.changes.length} changes: can't be moved in a meeting yet`
              : first.targetSectionId && !section
                ? "Its section isn't in the current bylaws"
                : null;
          const one = !reason;
          return (
            <li key={amendment.id}>
              <label
                className={`flex gap-3 rounded-lg border p-3 ${
                  value === amendment.id ? 'border-gavel bg-gavel-tint' : 'border-rule'
                } ${one ? 'cursor-pointer' : 'opacity-60'}`}
              >
                <input
                  type="radio"
                  name={name}
                  value={amendment.id}
                  checked={value === amendment.id}
                  disabled={!one}
                  onChange={() => onChange(amendment.id)}
                  className="mt-1 accent-gavel"
                />
                <span>
                  <span className="block font-medium text-ink">{amendment.title}</span>
                  <span className="block text-sm text-ink-muted">
                    {reason ??
                      (section
                        ? first.changeType === 'add'
                          ? `A new section under ${sectionLabel(section)}`
                          : sectionLabel(section)
                        : 'A new section at the top level')}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
