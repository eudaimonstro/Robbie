import React, { useState } from 'react';
import { ArrowUpDown, Minus, Plus } from 'lucide-react';
import { generateId } from '@robbie-bylawyer/shared/utils';
import type { AgendaAmendmentFormProps } from '../types';

export function AgendaAmendmentForm({ agenda, onSubmit, onCancel }: AgendaAmendmentFormProps) {
  const [amendmentType, setAmendmentType] = useState<'add' | 'remove' | 'reorder'>('add');
  const [newItemTitle, setNewItemTitle] = useState<string>('');
  const [newItemPosition, setNewItemPosition] = useState<'beginning' | 'end' | number>('end');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(agenda[0]?.id || null);
  const [moveDirection, setMoveDirection] = useState<'up' | 'down'>('up');

  const handleSubmit = () => {
    if (amendmentType === 'add') {
      const positionText =
        newItemPosition === 'end'
          ? 'at the end'
          : newItemPosition === 'beginning'
            ? 'at the beginning'
            : `after item ${(newItemPosition as number) + 1}`;
      const text = `Amend the agenda by adding "${newItemTitle}" ${positionText}`;
      const position =
        newItemPosition === 'end'
          ? ('end' as const)
          : newItemPosition === 'beginning'
            ? ('beginning' as const)
            : (newItemPosition as number) + 1;
      const agendaAmendment = {
        action: 'add' as const,
        title: newItemTitle,
        position,
        itemId: generateId(),
      };
      onSubmit(text, agendaAmendment);
    } else if (amendmentType === 'remove' && selectedItemId !== null) {
      const item = agenda.find((a) => a.id === selectedItemId);
      const text = `Amend the agenda by removing "${item?.title}"`;
      const agendaAmendment = { action: 'remove' as const, itemId: selectedItemId };
      onSubmit(text, agendaAmendment);
    } else if (amendmentType === 'reorder' && selectedItemId !== null) {
      const fromIndex = agenda.findIndex((a) => a.id === selectedItemId);
      const toIndex =
        moveDirection === 'up'
          ? Math.max(0, fromIndex - 1)
          : Math.min(agenda.length - 1, fromIndex + 1);
      const item = agenda.find((a) => a.id === selectedItemId);
      const text = `Amend the agenda by moving "${item?.title}" ${moveDirection}`;
      const agendaAmendment = { action: 'reorder' as const, fromIndex, toIndex };
      onSubmit(text, agendaAmendment);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink mb-2">Amendment Type</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'add' as const, label: 'Add', Icon: Plus },
            { value: 'remove' as const, label: 'Remove', Icon: Minus },
            { value: 'reorder' as const, label: 'Reorder', Icon: ArrowUpDown },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAmendmentType(opt.value)}
              className={`p-3 rounded-lg border-2 text-center ${amendmentType === opt.value ? 'border-gavel bg-gavel-tint' : 'border-rule'}`}
            >
              <opt.Icon size={20} aria-hidden="true" className="mx-auto mb-1 block" />
              <span className="text-sm">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      {amendmentType === 'add' && (
        <>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">New Item Title</label>
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Enter agenda item..."
              className="w-full p-3 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Position</label>
            <select
              value={newItemPosition}
              onChange={(e) => {
                const val = e.target.value;
                setNewItemPosition(val === 'beginning' || val === 'end' ? val : parseInt(val));
              }}
              className="w-full p-3 border rounded-lg bg-surface"
            >
              <option value="beginning">At the beginning</option>
              {agenda.map((item, i) => (
                <option key={item.id} value={i}>
                  After: {item.title}
                </option>
              ))}
              <option value="end">At the end</option>
            </select>
          </div>
        </>
      )}
      {amendmentType === 'remove' && (
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Select Item to Remove</label>
          <select
            value={selectedItemId || ''}
            onChange={(e) => setSelectedItemId(parseInt(e.target.value))}
            className="w-full p-3 border rounded-lg bg-surface"
          >
            {agenda.map((item, i) => (
              <option key={item.id} value={item.id}>
                {i + 1}. {item.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {amendmentType === 'reorder' && (
        <>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Select Item to Move</label>
            <select
              value={selectedItemId || ''}
              onChange={(e) => setSelectedItemId(parseInt(e.target.value))}
              className="w-full p-3 border rounded-lg bg-surface"
            >
              {agenda.map((item, i) => (
                <option key={item.id} value={item.id}>
                  {i + 1}. {item.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMoveDirection('up')}
              className={`p-3 rounded-lg border-2 ${moveDirection === 'up' ? 'border-gavel bg-gavel-tint' : 'border-rule'}`}
            >
              ↑ Move Up
            </button>
            <button
              onClick={() => setMoveDirection('down')}
              className={`p-3 rounded-lg border-2 ${moveDirection === 'down' ? 'border-gavel bg-gavel-tint' : 'border-rule'}`}
            >
              ↓ Move Down
            </button>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-lg border border-rule text-ink hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={amendmentType === 'add' && !newItemTitle.trim()}
          className="flex-1 py-3 rounded-lg bg-gavel text-paper hover:bg-gavel-700 dark:hover:bg-gavel-300 disabled:bg-rule font-medium"
        >
          Submit Motion
        </button>
      </div>
    </div>
  );
}
