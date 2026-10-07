import React from 'react';
import type { Member } from '@robbie-bylawyer/shared/types';

interface RenameModalProps {
  member: Member;
  newName: string;
  setNewName: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RenameModal = React.memo(function RenameModal({
  member,
  newName,
  setNewName,
  onConfirm,
  onCancel,
}: RenameModalProps) {
  const isValid = newName.trim().length >= 2;
  const hasChanged = newName.trim() !== member.name;

  return (
    <div className="fixed inset-0 bg-ink-900/50 dark:bg-ink-900/70 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h4 className="font-semibold text-lg mb-4 text-ink">Rename {member.name}</h4>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Enter new name"
          className="w-full p-2 border border-rule rounded-lg mb-4 bg-surface text-ink"
          autoFocus
        />
        {newName.trim().length > 0 && newName.trim().length < 2 && (
          <p className="text-gavel text-sm mb-4">Name must be at least 2 characters.</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!newName.trim() || !isValid || !hasChanged}
            className="flex-1 bg-gavel text-paper py-2 rounded-lg hover:bg-gavel/90 disabled:bg-rule disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-rule text-ink py-2 rounded-lg hover:bg-ink-muted/25"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});
