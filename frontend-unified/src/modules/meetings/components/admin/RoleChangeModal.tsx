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
  onCancel,
}: RoleChangeModalProps) {
  return (
    <div className="fixed inset-0 bg-ink-900/50 dark:bg-ink-900/70 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h4 className="font-semibold text-lg mb-4 text-ink">Change Role for {member.name}</h4>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as 'member' | 'chair' | 'admin')}
          className="w-full p-2 border border-rule rounded-lg mb-4 bg-surface text-ink"
        >
          <option value="member">Member</option>
          <option value="chair">Chair</option>
          <option value="admin">Admin</option>
        </select>
        {selectedRole === 'chair' && member.role !== 'chair' && currentChair && (
          <p className="text-caution-ink text-sm mb-4 bg-caution-tint p-3 rounded-lg">
            Note: {currentChair.name} (current chair) will be demoted to member.
          </p>
        )}
        {selectedRole === member.role && (
          <p className="text-ink-muted text-sm mb-4">
            No change - {member.name} is already {member.role}.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={selectedRole === member.role}
            className="flex-1 bg-gavel text-paper py-2 rounded-lg hover:bg-gavel/90 disabled:bg-rule disabled:cursor-not-allowed"
          >
            Confirm
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
