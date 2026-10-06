/**
 * Packet Builder Component
 *
 * Build a meeting packet with agenda items and attachments
 */

import React, { useState, useCallback } from 'react';
import { Plus, Clock, FileText, Loader2 } from 'lucide-react';
import type { MeetingPacket, AgendaItem, Attachment } from './types';
import { AgendaItemEditor } from './AgendaItemEditor';
import { AttachmentUploader } from './AttachmentUploader';
import { createAgendaItem, updateAgendaItem, deleteAgendaItem, reorderAgendaItems } from './api';

interface PacketBuilderProps {
  packet: MeetingPacket;
  onPacketUpdate: (packet: MeetingPacket) => void;
}

export function PacketBuilder({ packet, onPacketUpdate }: PacketBuilderProps) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const handleAddItem = async () => {
    if (!newItemTitle.trim()) return;

    setIsCreating(true);
    try {
      const newItem = await createAgendaItem(packet.id, { title: newItemTitle.trim() });
      onPacketUpdate({
        ...packet,
        agendaItems: [...packet.agendaItems, newItem],
      });
      setNewItemTitle('');
    } catch (err) {
      console.error('Failed to create agenda item:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateItem = useCallback(
    async (itemId: string, updates: Partial<AgendaItem>) => {
      try {
        const updated = await updateAgendaItem(itemId, updates);
        onPacketUpdate({
          ...packet,
          agendaItems: packet.agendaItems.map((item) =>
            item.id === itemId ? { ...item, ...updated } : item,
          ),
        });
      } catch (err) {
        console.error('Failed to update agenda item:', err);
      }
    },
    [packet, onPacketUpdate],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      try {
        await deleteAgendaItem(itemId);
        onPacketUpdate({
          ...packet,
          agendaItems: packet.agendaItems.filter((item) => item.id !== itemId),
        });
      } catch (err) {
        console.error('Failed to delete agenda item:', err);
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

  // Simple drag and drop handlers (without external library)
  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) return;
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedItemId || draggedItemId === targetId) {
      setDraggedItemId(null);
      return;
    }

    const draggedIndex = packet.agendaItems.findIndex((i) => i.id === draggedItemId);
    const targetIndex = packet.agendaItems.findIndex((i) => i.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder locally first for immediate feedback
    const newItems = [...packet.agendaItems];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, removed);

    // Update positions
    const reorderedItems = newItems.map((item, index) => ({
      ...item,
      position: index,
    }));

    onPacketUpdate({
      ...packet,
      agendaItems: reorderedItems,
    });

    // Then sync to server
    try {
      await reorderAgendaItems(reorderedItems.map((i) => i.id));
    } catch (err) {
      console.error('Failed to reorder:', err);
      // Could revert on error
    }

    setDraggedItemId(null);
  };

  const totalMinutes = packet.agendaItems.reduce(
    (sum, item) => sum + (item.estimatedMinutes || 0),
    0,
  );
  const totalAttachments =
    packet.attachments.length +
    packet.agendaItems.reduce((sum, item) => sum + item.attachments.length, 0);

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Clock size={16} />
          <span>
            {packet.agendaItems.length} items
            {totalMinutes > 0 && ` (~${totalMinutes} min)`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FileText size={16} />
          <span>{totalAttachments} attachments</span>
        </div>
      </div>

      {/* Meeting-level attachments */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3">Meeting Documents</h3>
        <p className="text-sm text-gray-600 mb-3">
          Documents available for the entire meeting (e.g., previous minutes, bylaws)
        </p>
        <AttachmentUploader
          robbieCode={packet.robbieCode}
          attachments={packet.attachments}
          target={{ packetId: packet.id }}
          onAttachmentAdded={handlePacketAttachmentAdded}
          onAttachmentRemoved={handlePacketAttachmentRemoved}
        />
      </div>

      {/* Agenda items */}
      <div>
        <h3 className="font-medium text-gray-800 mb-3">Agenda Items</h3>

        {/* Existing items */}
        <div className="space-y-2 mb-4">
          {packet.agendaItems.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDrop={() => handleDrop(item.id)}
              className="transition-opacity"
              style={{ opacity: draggedItemId === item.id ? 0.5 : 1 }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-400 w-6">{index + 1}.</span>
                <div className="flex-1">
                  <AgendaItemEditor
                    item={item}
                    robbieCode={packet.robbieCode}
                    packetId={packet.id}
                    onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                    onDelete={() => handleDeleteItem(item.id)}
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
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add new item */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            placeholder="Add agenda item..."
            className="flex-1 p-3 border rounded-lg"
            disabled={isCreating}
          />
          <button
            onClick={handleAddItem}
            disabled={!newItemTitle.trim() || isCreating}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
            Add
          </button>
        </div>
      </div>

      {/* Empty state */}
      {packet.agendaItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No agenda items yet.</p>
          <p className="text-sm">Add items above to build your meeting agenda.</p>
        </div>
      )}
    </div>
  );
}
