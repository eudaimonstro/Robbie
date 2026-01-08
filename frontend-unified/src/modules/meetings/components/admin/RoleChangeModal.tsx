import React from 'react';
import type { Member } from '@robbie-bylawyer/shared/types';

interface RoleChangeModalProps {
  member: Member;
  selectedRole: 'member' | 'chair' | 'admin';
  setSelectedRole: (role: 'member' | 'chair' | 'admin') => void;
  currentChair: Member | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RoleChangeModal = React.memo(function RoleChangeModal({
  member,
  selectedRole,
  setSelectedRole,
  currentChair,
  onConfirm,
  onCancel
}: RoleChangeModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h4 className="font-semibold text-lg mb-4 text-secondary-900 dark:text-white">
          Change Role for {member.name}
        </h4>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as 'member' | 'chair' | 'admin')}
          className="w-full p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg mb-4 bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
        >
          <option value="member">Member</option>
          <option value="chair">Chair</option>
          <option value="admin">Admin</option>
        </select>
        {selectedRole === 'chair' && member.role !== 'chair' && currentChair && (
          <p className="text-accent-600 dark:text-accent-400 text-sm mb-4 bg-accent-50 dark:bg-accent-900/20 p-3 rounded-lg">
            Note: {currentChair.name} (current chair) will be demoted to member.
          </p>
        )}
        {selectedRole === member.role && (
          <p className="text-secondary-500 dark:text-secondary-400 text-sm mb-4">
            No change - {member.name} is already {member.role}.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={selectedRole === member.role}
            className="flex-1 bg-meeting-600 text-white py-2 rounded-lg hover:bg-meeting-700 disabled:bg-secondary-300 dark:disabled:bg-secondary-600 disabled:cursor-not-allowed"
          >
            Confirm
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
