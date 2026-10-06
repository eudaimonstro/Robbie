import React, { useState, useCallback, useRef } from 'react';
import { X, CheckCircle, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import type { DraggableAgendaListProps } from '../types';

export function DraggableAgendaList({
  agenda,
  dispatch,
  disabled,
  showStatus = false,
}: DraggableAgendaListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (disabled) return;
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    if (disabled) return;
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      dispatch({ type: 'REORDER_AGENDA', fromIndex: draggedIndex, toIndex });
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveItem = useCallback(
    (fromIndex: number, direction: 'up' | 'down') => {
      if (disabled) return;
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= agenda.length) return;
      dispatch({ type: 'REORDER_AGENDA', fromIndex, toIndex });
      setFocusedIndex(toIndex);
    },
    [disabled, agenda.length, dispatch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (disabled) return;

      switch (e.key) {
        case 'ArrowUp':
          if (e.altKey || e.metaKey) {
            e.preventDefault();
            moveItem(index, 'up');
          } else {
            e.preventDefault();
            const prevIndex = Math.max(0, index - 1);
            setFocusedIndex(prevIndex);
          }
          break;
        case 'ArrowDown':
          if (e.altKey || e.metaKey) {
            e.preventDefault();
            moveItem(index, 'down');
          } else {
            e.preventDefault();
            const nextIndex = Math.min(agenda.length - 1, index + 1);
            setFocusedIndex(nextIndex);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (e.altKey || e.metaKey) {
            e.preventDefault();
            dispatch({ type: 'REMOVE_AGENDA_ITEM', id: agenda[index].id });
          }
          break;
      }
    },
    [disabled, agenda, moveItem, dispatch],
  );

  // Focus the item when focusedIndex changes
  React.useEffect(() => {
    if (focusedIndex !== null && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="listitem"]');
      const item = items[focusedIndex] as HTMLElement;
      item?.focus();
    }
  }, [focusedIndex]);

  return (
    <ul ref={listRef} className="space-y-2" role="list" aria-label="Agenda items">
      {agenda.map((item, i) => (
        <li
          key={item.id}
          role="listitem"
          tabIndex={disabled ? -1 : 0}
          draggable={!disabled}
          onDragStart={(e) => handleDragStart(e, i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onFocus={() => setFocusedIndex(i)}
          aria-label={`${item.title}${showStatus ? `, ${item.status}` : ''}. Position ${i + 1} of ${agenda.length}`}
          className={`flex items-center justify-between p-3 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            draggedIndex === i ? 'opacity-50 bg-gray-200' : 'bg-gray-50'
          } ${dragOverIndex === i && draggedIndex !== i ? 'border-t-2 border-indigo-500' : ''} ${
            !disabled ? 'cursor-grab' : ''
          } ${showStatus && item.status === 'completed' ? 'bg-green-50' : ''} ${
            showStatus && item.status === 'active' ? 'bg-indigo-50' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            {!disabled && (
              <div className="flex flex-col" aria-hidden="true">
                <button
                  type="button"
                  onClick={() => moveItem(i, 'up')}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                  aria-label={`Move ${item.title} up`}
                  tabIndex={-1}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(i, 'down')}
                  disabled={i === agenda.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                  aria-label={`Move ${item.title} down`}
                  tabIndex={-1}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            {showStatus && item.status === 'completed' && (
              <CheckCircle size={16} className="text-green-600" aria-hidden="true" />
            )}
            {showStatus && item.status === 'active' && (
              <ChevronRight size={16} className="text-indigo-600" aria-hidden="true" />
            )}
            <span
              className={
                showStatus && item.status === 'completed' ? 'line-through text-gray-400' : ''
              }
            >
              {i + 1}. {item.title}
            </span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'REMOVE_AGENDA_ITEM', id: item.id })}
              className="text-red-400 hover:text-red-600 p-1"
              aria-label={`Remove ${item.title} from agenda`}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
      {!disabled && agenda.length > 0 && (
        <li className="text-xs text-gray-500 mt-2 px-3" aria-hidden="true">
          Tip: Use Alt+↑/↓ to reorder, or click the arrows
        </li>
      )}
    </ul>
  );
}
