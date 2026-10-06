/**
 * Agenda Item Editor Component
 *
 * Edit a single agenda item with title, description, presenter, time estimate
 */

import React, { useState, useEffect } from 'react';
import { Clock, User, Trash2, ChevronDown, ChevronUp, Paperclip, GripVertical } from 'lucide-react';
import type { AgendaItem, Attachment } from './types';
import { AttachmentUploader } from './AttachmentUploader';

interface AgendaItemEditorProps {
  item: AgendaItem;
  robbieCode: string;
  packetId: string;
  onUpdate: (updates: Partial<AgendaItem>) => void;
  onDelete: () => void;
  onAttachmentAdded: (attachment: Attachment) => void;
  onAttachmentRemoved: (attachmentId: string) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

export function AgendaItemEditor({
  item,
  robbieCode,
  packetId,
  onUpdate,
  onDelete,
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

  // Sync local state with prop changes
  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description || '');
    setPresenter(item.presenter || '');
    setEstimatedMinutes(item.estimatedMinutes?.toString() || '');
  }, [item]);

  const handleTitleBlur = () => {
    if (title !== item.title) {
      onUpdate({ title });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (item.description || '')) {
      onUpdate({ description: description || undefined });
    }
  };

  const handlePresenterBlur = () => {
    if (presenter !== (item.presenter || '')) {
      onUpdate({ presenter: presenter || undefined });
    }
  };

  const handleMinutesBlur = () => {
    const minutes = estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined;
    if (minutes !== item.estimatedMinutes) {
      onUpdate({ estimatedMinutes: minutes });
    }
  };

  return (
    <div
      className={`bg-white border rounded-lg shadow-sm transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-indigo-500' : ''
      }`}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-2 p-3">
        {/* Drag handle */}
        <div {...dragHandleProps} className="cursor-grab text-gray-400 hover:text-gray-600">
          <GripVertical size={20} />
        </div>

        {/* Title input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Agenda item title"
          className="flex-1 font-medium text-gray-800 bg-transparent border-none focus:ring-0 p-0"
        />

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {item.estimatedMinutes && (
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {item.estimatedMinutes}m
            </span>
          )}
          {item.attachments.length > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={14} />
              {item.attachments.length}
            </span>
          )}
        </div>

        {/* Expand/collapse button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {/* Delete button */}
        <button type="button" onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600">
          <Trash2 size={18} />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t p-4 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Optional description or notes..."
              rows={2}
              className="w-full p-2 border rounded-lg text-sm resize-none"
            />
          </div>

          {/* Presenter and Time in a row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User size={14} className="inline mr-1" />
                Presenter
              </label>
              <input
                type="text"
                value={presenter}
                onChange={(e) => setPresenter(e.target.value)}
                onBlur={handlePresenterBlur}
                placeholder="Who will present?"
                className="w-full p-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock size={14} className="inline mr-1" />
                Estimated Time
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  onBlur={handleMinutesBlur}
                  placeholder="Minutes"
                  min="1"
                  max="120"
                  className="w-full p-2 border rounded-lg text-sm pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  minutes
                </span>
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Paperclip size={14} className="inline mr-1" />
              Attachments
            </label>
            <AttachmentUploader
              robbieCode={robbieCode}
              attachments={item.attachments}
              target={{ agendaItemId: item.id }}
              onAttachmentAdded={onAttachmentAdded}
              onAttachmentRemoved={onAttachmentRemoved}
            />
          </div>
        </div>
      )}
    </div>
  );
}
