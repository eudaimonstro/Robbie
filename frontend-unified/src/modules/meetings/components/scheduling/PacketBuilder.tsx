/**
 * Packet Builder Component
 *
 * Build a meeting packet with agenda items and attachments. Each change is saved as it is made;
 * a refusal is shown with the server's message, and a reorder the server refuses is put back.
 */

import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { Plus, Clock, FileText, Loader2, X } from 'lucide-react';
import type { MeetingPacket, AgendaItem, AgendaItemChanges, Attachment } from './types';
import { AgendaItemEditor } from './AgendaItemEditor';
import { AttachmentUploader } from './AttachmentUploader';
import { createAgendaItem, updateAgendaItem, deleteAgendaItem, reorderAgendaItems } from './api';

type MoveDirection = 'up' | 'down';

/** A change to the packet, made to the latest one (another save may have landed meanwhile) */
export type PacketUpdater = (prev: MeetingPacket) => MeetingPacket;

interface PacketBuilderProps {
  packet: MeetingPacket;
  onPacketUpdate: (update: PacketUpdater) => void;
}

/** The message of a failed save */
const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/**
 * The items in the order of these ids, numbered again; an item added meanwhile goes at the end
 * and an id removed meanwhile is skipped
 */
function inOrder(items: AgendaItem[], ids: string[]): AgendaItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const listed = ids.flatMap((id) => byId.get(id) ?? []);
  const added = items.filter((item) => !ids.includes(item.id));
  return [...listed, ...added].map((item, index) => ({ ...item, position: index }));
}

/** The agenda items, with this one changed */
const withItem = (
  packet: MeetingPacket,
  itemId: string,
  change: (item: AgendaItem) => AgendaItem,
): MeetingPacket => ({
  ...packet,
  agendaItems: packet.agendaItems.map((item) => (item.id === itemId ? change(item) : item)),
});

export function PacketBuilder({ packet, onPacketUpdate }: PacketBuilderProps) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A reorder is being saved: the next waits for it, so each is put back on its own if refused
  const [isMoving, setIsMoving] = useState(false);
  const movingRef = useRef(false);
  // A move from the keyboard: the moved item's button to focus once it is in its new place, and
  // what the live region says
  const focusAfterMove = useRef<{ itemId: string; direction: MoveDirection } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [announcement, setAnnouncement] = useState('');

  // Moving the item's row in the page takes the focus from its button: give it back, or to the
  // other button when the item has reached the end of the agenda
  // An item's row in the agenda
  const rowOf = (itemId: string) =>
    [...(listRef.current?.children ?? [])].find(
      (child) => (child as HTMLElement).dataset.itemId === itemId,
    );

  useLayoutEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const row = rowOf(target.itemId);
    const button = (direction: MoveDirection) =>
      row?.querySelector<HTMLButtonElement>(`button[data-move="${direction}"]`);
    const same = button(target.direction);
    const other = button(target.direction === 'up' ? 'down' : 'up');
    (same && !same.disabled ? same : other)?.focus();
  }, [packet.agendaItems]);

  const handleAddItem = async () => {
    const title = newItemTitle.trim();
    if (!title) return;

    setIsCreating(true);
    setError(null);
    try {
      const newItem = await createAgendaItem(packet.id, { title });
      const added = { ...newItem, attachments: newItem.attachments ?? [] };
      onPacketUpdate((prev) => ({ ...prev, agendaItems: [...prev.agendaItems, added] }));
      setNewItemTitle('');
    } catch (err) {
      setError(messageOf(err, "Couldn't add the agenda item"));
    } finally {
      setIsCreating(false);
    }
  };

  // Each answer changes only its own item, in the agenda as it is when the answer arrives: the
  // item keeps its place (a move may have been saved meanwhile), and one removed stays removed
  const handleUpdateItem = useCallback(
    async (itemId: string, updates: AgendaItemChanges) => {
      setError(null);
      try {
        const updated = await updateAgendaItem(itemId, updates);
        onPacketUpdate((prev) =>
          withItem(prev, itemId, (item) => ({
            ...item,
            ...updated,
            position: item.position,
            attachments: item.attachments,
          })),
        );
      } catch (err) {
        setError(messageOf(err, "Couldn't save the agenda item"));
      }
    },
    [onPacketUpdate],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      setError(null);
      try {
        await deleteAgendaItem(itemId);
        onPacketUpdate((prev) => ({
          ...prev,
          agendaItems: prev.agendaItems.filter((item) => item.id !== itemId),
        }));
      } catch (err) {
        setError(messageOf(err, "Couldn't remove the agenda item"));
      }
    },
    [onPacketUpdate],
  );

  const handleItemAttachmentAdded = useCallback(
    (itemId: string, attachment: Attachment) => {
      onPacketUpdate((prev) =>
        withItem(prev, itemId, (item) => ({
          ...item,
          attachments: [...item.attachments, attachment],
        })),
      );
    },
    [onPacketUpdate],
  );

  const handleItemAttachmentRemoved = useCallback(
    (itemId: string, attachmentId: string) => {
      onPacketUpdate((prev) =>
        withItem(prev, itemId, (item) => ({
          ...item,
          attachments: item.attachments.filter((a) => a.id !== attachmentId),
        })),
      );
    },
    [onPacketUpdate],
  );

  const handlePacketAttachmentAdded = useCallback(
    (attachment: Attachment) => {
      onPacketUpdate((prev) => ({ ...prev, attachments: [...prev.attachments, attachment] }));
    },
    [onPacketUpdate],
  );

  const handlePacketAttachmentRemoved = useCallback(
    (attachmentId: string) => {
      onPacketUpdate((prev) => ({
        ...prev,
        attachments: prev.attachments.filter((a) => a.id !== attachmentId),
      }));
    },
    [onPacketUpdate],
  );

  /**
   * Move the item at one position to another: shown at once, saved, and put back if refused.
   * One at a time: a move while another is being saved is ignored (the buttons are disabled).
   */
  const moveItem = async (fromIndex: number, toIndex: number, from?: MoveDirection) => {
    const items = packet.agendaItems;
    if (movingRef.current) return;
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= items.length) return;
    if (from) {
      focusAfterMove.current = { itemId: items[fromIndex].id, direction: from };
      setAnnouncement(`${items[fromIndex].title}, ${toIndex + 1} of ${items.length}`);
    }

    const before = items.map((item) => item.id);
    const after = [...before];
    const [moved] = after.splice(fromIndex, 1);
    after.splice(toIndex, 0, moved);

    movingRef.current = true;
    setIsMoving(true);
    setError(null);
    onPacketUpdate((prev) => ({ ...prev, agendaItems: inOrder(prev.agendaItems, after) }));
    try {
      await reorderAgendaItems(after);
    } catch (err) {
      // The order before this move, with whatever else changed meanwhile. Putting the row back
      // takes the focus from it again: it gets it back, if it still had it.
      if (from && rowOf(moved)?.contains(document.activeElement)) {
        focusAfterMove.current = { itemId: moved, direction: from };
        setAnnouncement(`${items[fromIndex].title}, ${fromIndex + 1} of ${items.length}`);
      }
      onPacketUpdate((prev) => ({ ...prev, agendaItems: inOrder(prev.agendaItems, before) }));
      setError(messageOf(err, "Couldn't reorder the agenda"));
    } finally {
      movingRef.current = false;
      setIsMoving(false);
    }
  };

  // Drag and drop, for a mouse; Move up and Move down do the same from the keyboard
  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetId: string) => {
    const draggedIndex = packet.agendaItems.findIndex((i) => i.id === draggedItemId);
    const targetIndex = packet.agendaItems.findIndex((i) => i.id === targetId);
    setDraggedItemId(null);
    if (draggedIndex === -1 || targetIndex === -1) return;
    await moveItem(draggedIndex, targetIndex);
  };

  const totalMinutes = packet.agendaItems.reduce(
    (sum, item) => sum + (item.estimatedMinutes || 0),
    0,
  );
  const totalAttachments =
    packet.attachments.length +
    packet.agendaItems.reduce((sum, item) => sum + item.attachments.length, 0);
  const count = packet.agendaItems.length;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
        <div className="flex items-center gap-2">
          <Clock size={16} aria-hidden="true" />
          <span>
            {count === 1 ? '1 item' : `${count} items`}
            {totalMinutes > 0 && ` (about ${totalMinutes} min)`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FileText size={16} aria-hidden="true" />
          <span>{totalAttachments === 1 ? '1 attachment' : `${totalAttachments} attachments`}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-gavel-tint px-4 py-3 text-sm text-ink">
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="text-ink-muted hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Meeting-level attachments */}
      <section className="rounded-lg bg-surface-2 p-4" aria-labelledby="meeting-documents-heading">
        <h3 id="meeting-documents-heading" className="mb-1 font-medium text-ink">
          Meeting documents
        </h3>
        <p className="mb-3 text-sm text-ink-muted">
          For the whole meeting, such as last year&apos;s minutes or the bylaws.
        </p>
        <AttachmentUploader
          robbieCode={packet.robbieCode}
          organizationId={packet.organizationId}
          attachments={packet.attachments}
          target={{ packetId: packet.id }}
          targetName="the meeting"
          onAttachmentAdded={handlePacketAttachmentAdded}
          onAttachmentRemoved={handlePacketAttachmentRemoved}
        />
      </section>

      {/* Agenda items */}
      <section aria-labelledby="agenda-heading">
        {/* Where a moved item is now, for a screen reader */}
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <h3 id="agenda-heading" className="mb-3 font-medium text-ink">
          Agenda
        </h3>

        {count > 0 && (
          <ol ref={listRef} className="mb-4 space-y-2">
            {packet.agendaItems.map((item, index) => (
              <li
                key={item.id}
                data-item-id={item.id}
                onDragOver={handleDragOver}
                onDrop={() => void handleDrop(item.id)}
                className="flex items-start gap-2 transition-opacity"
                style={{ opacity: draggedItemId === item.id ? 0.5 : 1 }}
              >
                <span
                  className="w-6 pt-3.5 text-sm font-medium text-ink-muted sm:pt-4"
                  aria-hidden="true"
                >
                  {index + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <AgendaItemEditor
                    item={item}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === count - 1}
                    isMoving={isMoving}
                    robbieCode={packet.robbieCode}
                    organizationId={packet.organizationId}
                    packetId={packet.id}
                    onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onMoveUp={() => void moveItem(index, index - 1, 'up')}
                    onMoveDown={() => void moveItem(index, index + 1, 'down')}
                    onAttachmentAdded={(attachment) =>
                      handleItemAttachmentAdded(item.id, attachment)
                    }
                    onAttachmentRemoved={(attachmentId) =>
                      handleItemAttachmentRemoved(item.id, attachmentId)
                    }
                    isDragging={draggedItemId === item.id}
                    dragHandleProps={{
                      draggable: true,
                      onDragStart: () => handleDragStart(item.id),
                      onDragEnd: () => setDraggedItemId(null),
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Add new item */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddItem();
          }}
        >
          <input
            type="text"
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="e.g. Treasurer's report"
            aria-label="New agenda item"
            maxLength={500}
            className="input flex-1"
            disabled={isCreating}
          />
          <button
            type="submit"
            disabled={!newItemTitle.trim() || isCreating}
            className="btn-primary"
          >
            {isCreating ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={20} aria-hidden="true" />
            )}
            Add
          </button>
        </form>

        {count === 0 && (
          <p className="py-6 text-center text-sm text-ink-muted">
            No agenda items yet. Add them in the order the meeting takes them.
          </p>
        )}
      </section>
    </div>
  );
}
