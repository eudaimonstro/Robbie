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
  onCancel
}: RenameModalProps) {
  const isValid = newName.trim().length >= 2;
  const hasChanged = newName.trim() !== member.name;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h4 className="font-semibold text-lg mb-4 text-secondary-900 dark:text-white">
          Rename {member.name}
        </h4>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Enter new name"
          className="w-full p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg mb-4 bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
          autoFocus
        />
        {newName.trim().length > 0 && newName.trim().length < 2 && (
          <p className="text-danger-500 dark:text-danger-400 text-sm mb-4">
            Name must be at least 2 characters.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!newName.trim() || !isValid || !hasChanged}
            className="flex-1 bg-meeting-600 text-white py-2 rounded-lg hover:bg-meeting-700 disabled:bg-secondary-300 dark:disabled:bg-secondary-600 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-secondary-200 dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300 py-2 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});
