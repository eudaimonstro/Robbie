/**
 * Packet Builder Component
 *
 * Build a meeting packet with agenda items and attachments. Each change is saved as it is made;
 * a refusal is shown with the server's message, and a reorder the server refuses is put back.
 */

import React, { useState, useCallback } from 'react';
import { Plus, Clock, FileText, Loader2, X } from 'lucide-react';
import type { MeetingPacket, AgendaItemChanges, Attachment } from './types';
import { AgendaItemEditor } from './AgendaItemEditor';
import { AttachmentUploader } from './AttachmentUploader';
import { createAgendaItem, updateAgendaItem, deleteAgendaItem, reorderAgendaItems } from './api';

interface PacketBuilderProps {
  packet: MeetingPacket;
  onPacketUpdate: (packet: MeetingPacket) => void;
}

/** The message of a failed save */
const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

export function PacketBuilder({ packet, onPacketUpdate }: PacketBuilderProps) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddItem = async () => {
    const title = newItemTitle.trim();
    if (!title) return;

    setIsCreating(true);
    setError(null);
    try {
      const newItem = await createAgendaItem(packet.id, { title });
      onPacketUpdate({
        ...packet,
        agendaItems: [
          ...packet.agendaItems,
          { ...newItem, attachments: newItem.attachments ?? [] },
        ],
      });
      setNewItemTitle('');
    } catch (err) {
      setError(messageOf(err, "Couldn't add the agenda item"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateItem = useCallback(
    async (itemId: string, updates: AgendaItemChanges) => {
      setError(null);
      try {
        const updated = await updateAgendaItem(itemId, updates);
        onPacketUpdate({
          ...packet,
          agendaItems: packet.agendaItems.map((item) =>
            item.id === itemId ? { ...item, ...updated, attachments: item.attachments } : item,
          ),
        });
      } catch (err) {
        setError(messageOf(err, "Couldn't save the agenda item"));
      }
    },
    [packet, onPacketUpdate],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      setError(null);
      try {
        await deleteAgendaItem(itemId);
        onPacketUpdate({
          ...packet,
          agendaItems: packet.agendaItems.filter((item) => item.id !== itemId),
        });
      } catch (err) {
        setError(messageOf(err, "Couldn't remove the agenda item"));
      }
    },
    [packet, onPacketUpdate],
  );

  const handleItemAttachmentAdded = useCallback(
    (itemId: string, attachment: Attachment) => {
      onPacketUpdate({
        ...packet,
        agendaItems: packet.agendaItems.map((item) =>
          item.id === itemId ? { ...item, attachments: [...item.attachments, attachment] } : item,
        ),
      });
    },
    [packet, onPacketUpdate],
  );

  const handleItemAttachmentRemoved = useCallback(
    (itemId: string, attachmentId: string) => {
      onPacketUpdate({
        ...packet,
        agendaItems: packet.agendaItems.map((item) =>
          item.id === itemId
            ? { ...item, attachments: item.attachments.filter((a) => a.id !== attachmentId) }
            : item,
        ),
      });
    },
    [packet, onPacketUpdate],
  );

  const handlePacketAttachmentAdded = useCallback(
    (attachment: Attachment) => {
      onPacketUpdate({
        ...packet,
        attachments: [...packet.attachments, attachment],
      });
    },
    [packet, onPacketUpdate],
  );

  const handlePacketAttachmentRemoved = useCallback(
    (attachmentId: string) => {
      onPacketUpdate({
        ...packet,
        attachments: packet.attachments.filter((a) => a.id !== attachmentId),
      });
    },
    [packet, onPacketUpdate],
  );

  /** Move the item at one position to another: shown at once, saved, put back if refused */
  const moveItem = async (fromIndex: number, toIndex: number) => {
    const items = packet.agendaItems;
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= items.length) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const positioned = reordered.map((item, index) => ({ ...item, position: index }));

    setError(null);
    onPacketUpdate({ ...packet, agendaItems: positioned });
    try {
      await reorderAgendaItems(positioned.map((item) => item.id));
    } catch (err) {
      onPacketUpdate({ ...packet, agendaItems: items });
      setError(messageOf(err, "Couldn't reorder the agenda"));
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
        <h3 id="agenda-heading" className="mb-3 font-medium text-ink">
          Agenda
        </h3>

        {count > 0 && (
          <ol className="mb-4 space-y-2">
            {packet.agendaItems.map((item, index) => (
              <li
                key={item.id}
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
                    robbieCode={packet.robbieCode}
                    organizationId={packet.organizationId}
                    packetId={packet.id}
                    onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onMoveUp={() => void moveItem(index, index - 1)}
                    onMoveDown={() => void moveItem(index, index + 1)}
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
            placeholder="Treasurer's report"
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
