/**
 * Agenda Item Editor Component
 *
 * Edit a single agenda item: its title in place, and under Details its description, presenter,
 * time estimate and attachments. Each field is saved when it loses focus.
 */

import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Paperclip,
  Trash2,
  User,
} from 'lucide-react';
import type { AgendaItem, AgendaItemChanges, Attachment } from './types';
import { AttachmentUploader } from './AttachmentUploader';

interface AgendaItemEditorProps {
  item: AgendaItem;
  /** Its place in the agenda, from 0 */
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /**
   * A move is being saved: Move up and Move down wait for it (aria-disabled, not disabled, so a
   * focused one keeps the focus)
   */
  isMoving?: boolean;
  robbieCode: string;
  /** The packet's organization, for linking its documents */
  organizationId: string;
  packetId: string;
  /** Save a change; null clears a field */
  onUpdate: (updates: AgendaItemChanges) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAttachmentAdded: (attachment: Attachment) => void;
  onAttachmentRemoved: (attachmentId: string) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

export function AgendaItemEditor({
  item,
  index,
  isFirst,
  isLast,
  isMoving = false,
  robbieCode,
  organizationId,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAttachmentAdded,
  onAttachmentRemoved,
  isDragging,
  dragHandleProps,
}: AgendaItemEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description || '');
  const [presenter, setPresenter] = useState(item.presenter || '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(item.estimatedMinutes?.toString() || '');

  // A saved value that changed (this editor's save coming back, or a reload) replaces that
  // field only: text being typed in another field is kept, as it would not be if every new item
  // object reset them all. Adjusted while rendering, as React recommends, not in an effect
  const [saved, setSaved] = useState(item);
  if (saved !== item) {
    setSaved(item);
    if (item.title !== saved.title) setTitle(item.title);
    if ((item.description || '') !== (saved.description || '')) {
      setDescription(item.description || '');
    }
    if ((item.presenter || '') !== (saved.presenter || '')) setPresenter(item.presenter || '');
    if (item.estimatedMinutes !== saved.estimatedMinutes) {
      setEstimatedMinutes(item.estimatedMinutes?.toString() || '');
    }
  }

  // An item always has a title: one emptied goes back to the saved one
  const handleTitleBlur = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(item.title);
    } else if (trimmed !== item.title) {
      onUpdate({ title: trimmed });
    }
  };

  // An emptied field is cleared on the server (null), not left out of the change
  const handleDescriptionBlur = () => {
    if (description !== (item.description || '')) {
      onUpdate({ description: description || null });
    }
  };

  const handlePresenterBlur = () => {
    if (presenter !== (item.presenter || '')) {
      onUpdate({ presenter: presenter || null });
    }
  };

  const handleMinutesBlur = () => {
    const minutes = estimatedMinutes ? parseInt(estimatedMinutes, 10) : null;
    if (minutes !== (item.estimatedMinutes ?? null)) {
      onUpdate({ estimatedMinutes: minutes });
    }
  };

  const fieldId = (name: string) => `agenda-${item.id}-${name}`;
  const iconButton = 'rounded-sm p-1 text-ink-muted hover:text-ink disabled:opacity-30';

  return (
    <div
      className={`rounded-lg border border-rule bg-surface shadow-xs transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-gavel' : ''
      }`}
    >
      {/* Collapsed header: the title over its controls on a phone, beside them from sm up */}
      <div className="flex flex-wrap items-center justify-end gap-1 p-2 sm:flex-nowrap sm:gap-2 sm:p-3">
        {/* Drag handle, for a mouse */}
        <div
          {...dragHandleProps}
          className="hidden cursor-grab text-ink-muted hover:text-ink sm:block"
          aria-hidden="true"
        >
          <GripVertical size={20} />
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          aria-label={`Agenda item ${index + 1}`}
          maxLength={500}
          className="min-w-0 flex-1 basis-full rounded-sm border-none bg-transparent p-1 font-medium text-ink focus:ring-2 focus:ring-gavel sm:basis-auto"
        />

        {/* Quick stats */}
        <div className="hidden items-center gap-3 text-sm text-ink-muted sm:flex">
          {item.estimatedMinutes ? (
            <span className="flex items-center gap-1">
              <Clock size={14} aria-hidden="true" />
              {item.estimatedMinutes}m
            </span>
          ) : null}
          {item.attachments.length > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={14} aria-hidden="true" />
              {item.attachments.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (!isMoving) onMoveUp();
          }}
          disabled={isFirst}
          aria-disabled={(!isFirst && isMoving) || undefined}
          data-move="up"
          aria-label={`Move ${item.title} up`}
          className={iconButton}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isMoving) onMoveDown();
          }}
          disabled={isLast}
          aria-disabled={(!isLast && isMoving) || undefined}
          data-move="down"
          aria-label={`Move ${item.title} down`}
          className={iconButton}
        >
          <ArrowDown size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={`Details of ${item.title}`}
          aria-expanded={isExpanded}
          className={iconButton}
        >
          {isExpanded ? (
            <ChevronUp size={20} aria-hidden="true" />
          ) : (
            <ChevronDown size={20} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove ${item.title}`}
          className="rounded-sm p-1 text-ink-muted hover:text-gavel"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div role="group" aria-label={item.title} className="space-y-4 border-t border-rule p-4">
          <div>
            <label htmlFor={fieldId('description')} className="label">
              Description
            </label>
            <textarea
              id={fieldId('description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Notes for the members"
              rows={2}
              className="textarea"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldId('presenter')} className="label">
                <User size={14} className="mr-1 inline" aria-hidden="true" />
                Presenter
              </label>
              <input
                id={fieldId('presenter')}
                type="text"
                value={presenter}
                onChange={(e) => setPresenter(e.target.value)}
                onBlur={handlePresenterBlur}
                placeholder="Who presents it"
                className="input"
              />
            </div>
            <div>
              <label htmlFor={fieldId('minutes')} className="label">
                <Clock size={14} className="mr-1 inline" aria-hidden="true" />
                Time in minutes
              </label>
              <input
                id={fieldId('minutes')}
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                onBlur={handleMinutesBlur}
                min="1"
                max="120"
                className="input"
              />
            </div>
          </div>

          <div>
            <p className="label">
              <Paperclip size={14} className="mr-1 inline" aria-hidden="true" />
              Attachments
            </p>
            <AttachmentUploader
              robbieCode={robbieCode}
              organizationId={organizationId}
              attachments={item.attachments}
              target={{ agendaItemId: item.id }}
              targetName={item.title}
              onAttachmentAdded={onAttachmentAdded}
              onAttachmentRemoved={onAttachmentRemoved}
            />
          </div>
        </div>
      )}
    </div>
  );
}
