import React, { useState } from 'react';
import { X, CheckCircle, ChevronRight } from 'lucide-react';

export function DraggableAgendaList({ agenda, dispatch, disabled, showStatus = false }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    if (disabled) return;
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e, toIndex) => {
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

  return (
    <ul className="space-y-2">
      {agenda.map((item, i) => (
        <li
          key={item.id}
          draggable={!disabled}
          onDragStart={(e) => handleDragStart(e, i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          className={`flex items-center justify-between p-3 rounded-lg transition-all ${
            draggedIndex === i ? 'opacity-50 bg-gray-200' : 'bg-gray-50'
          } ${
            dragOverIndex === i && draggedIndex !== i ? 'border-t-2 border-indigo-500' : ''
          } ${
            !disabled ? 'cursor-grab' : ''
          } ${
            showStatus && item.status === 'completed' ? 'bg-green-50' : ''
          } ${
            showStatus && item.status === 'active' ? 'bg-indigo-50' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            {!disabled && <span className="text-gray-400">⠿</span>}
            {showStatus && item.status === 'completed' && <CheckCircle size={16} className="text-green-600"/>}
            {showStatus && item.status === 'active' && <ChevronRight size={16} className="text-indigo-600"/>}
            <span className={showStatus && item.status === 'completed' ? 'line-through text-gray-400' : ''}>
              {i + 1}. {item.title}
            </span>
          </div>
          {!disabled && (
            <button
              onClick={() => dispatch({ type: 'REMOVE_AGENDA_ITEM', id: item.id })}
              className="text-red-400 hover:text-red-600 p-1"
            >
              <X size={18}/>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
