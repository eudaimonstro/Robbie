import React, { useState } from 'react';
import { generateId } from '@eudaimonstro/robbie-shared/utils';
import type { AgendaAmendmentFormProps } from '../types';

export function AgendaAmendmentForm({ agenda, onSubmit, onCancel }: AgendaAmendmentFormProps) {
  const [amendmentType, setAmendmentType] = useState<'add' | 'remove' | 'reorder'>('add');
  const [newItemTitle, setNewItemTitle] = useState<string>('');
  const [newItemPosition, setNewItemPosition] = useState<'beginning' | 'end' | number>('end');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(agenda[0]?.id || null);
  const [moveDirection, setMoveDirection] = useState<'up' | 'down'>('up');

  const handleSubmit = () => {
    let text = '';
    let agendaAmendment = null;
    if (amendmentType === 'add') {
      const positionText = newItemPosition === 'end' ? 'at the end' : newItemPosition === 'beginning' ? 'at the beginning' : `after item ${(newItemPosition as number) + 1}`;
      text = `Amend the agenda by adding "${newItemTitle}" ${positionText}`;
      agendaAmendment = {
        action: 'add',
        title: newItemTitle,
        position: newItemPosition === 'end' ? 'end' : newItemPosition === 'beginning' ? 'beginning' : (newItemPosition as number) + 1,
        itemId: generateId()
      };
    } else if (amendmentType === 'remove') {
      const item = agenda.find(a => a.id === selectedItemId);
      text = `Amend the agenda by removing "${item?.title}"`;
      agendaAmendment = { action: 'remove', itemId: selectedItemId };
    } else if (amendmentType === 'reorder') {
      const fromIndex = agenda.findIndex(a => a.id === selectedItemId);
      const toIndex = moveDirection === 'up' ? Math.max(0, fromIndex - 1) : Math.min(agenda.length - 1, fromIndex + 1);
      const item = agenda.find(a => a.id === selectedItemId);
      text = `Amend the agenda by moving "${item?.title}" ${moveDirection}`;
      agendaAmendment = { action: 'reorder', fromIndex, toIndex };
    }
    onSubmit(text, agendaAmendment);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Amendment Type</label>
        <div className="grid grid-cols-3 gap-2">
          {[{ value: 'add' as const, label: 'Add', icon: '+' }, { value: 'remove' as const, label: 'Remove', icon: '−' }, { value: 'reorder' as const, label: 'Reorder', icon: '↕' }].map(opt => (
            <button key={opt.value} onClick={() => setAmendmentType(opt.value)} className={`p-3 rounded-lg border-2 text-center ${amendmentType === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
              <span className="text-xl block">{opt.icon}</span>
              <span className="text-sm">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      {amendmentType === 'add' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Item Title</label>
            <input type="text" value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} placeholder="Enter agenda item..." className="w-full p-3 border rounded-lg"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
            <select value={newItemPosition} onChange={(e) => {
              const val = e.target.value;
              setNewItemPosition(val === 'beginning' || val === 'end' ? val : parseInt(val));
            }} className="w-full p-3 border rounded-lg bg-white">
              <option value="beginning">At the beginning</option>
              {agenda.map((item, i) => (<option key={item.id} value={i}>After: {item.title}</option>))}
              <option value="end">At the end</option>
            </select>
          </div>
        </>
      )}
      {amendmentType === 'remove' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Item to Remove</label>
          <select value={selectedItemId || ''} onChange={(e) => setSelectedItemId(parseInt(e.target.value))} className="w-full p-3 border rounded-lg bg-white">
            {agenda.map((item, i) => (<option key={item.id} value={item.id}>{i + 1}. {item.title}</option>))}
          </select>
        </div>
      )}
      {amendmentType === 'reorder' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Item to Move</label>
            <select value={selectedItemId || ''} onChange={(e) => setSelectedItemId(parseInt(e.target.value))} className="w-full p-3 border rounded-lg bg-white">
              {agenda.map((item, i) => (<option key={item.id} value={item.id}>{i + 1}. {item.title}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMoveDirection('up')} className={`p-3 rounded-lg border-2 ${moveDirection === 'up' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>↑ Move Up</button>
            <button onClick={() => setMoveDirection('down')} className={`p-3 rounded-lg border-2 ${moveDirection === 'down' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>↓ Move Down</button>
          </div>
        </>
      )}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
        <button onClick={handleSubmit} disabled={amendmentType === 'add' && !newItemTitle.trim()} className="flex-1 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 font-medium">Submit Motion</button>
      </div>
    </div>
  );
}
