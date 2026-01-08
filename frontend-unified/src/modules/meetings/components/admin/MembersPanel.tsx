import React from 'react';
import { Users, Pencil } from 'lucide-react';
import type { Member } from '@robbie-bylawyer/shared/types';

interface MembersPanelProps {
  members: Member[];
  onRoleChange: (member: Member) => void;
  onRename: (member: Member) => void;
}

export const MembersPanel = React.memo(function MembersPanel({
  members,
  onRoleChange,
  onRename
}: MembersPanelProps) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-secondary-800 dark:text-white">
        <Users size={18}/> Members
      </h3>
      <ul className="space-y-2">
        {members.map(m => (
          <li key={m.id} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium text-secondary-900 dark:text-white">{m.name}</span>
              <button
                onClick={() => onRename(m)}
                className="text-secondary-400 hover:text-meeting-600 dark:hover:text-meeting-400 p-1"
                title="Rename member"
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                m.role === 'chair'
                  ? 'bg-meeting-100 dark:bg-meeting-900/30 text-meeting-800 dark:text-meeting-300'
                  : m.role === 'admin'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300'
                  : 'bg-secondary-200 dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300'
              }`}>{m.role}</span>
              <button
                onClick={() => onRoleChange(m)}
                className="text-meeting-600 dark:text-meeting-400 hover:text-meeting-800 dark:hover:text-meeting-300 text-sm font-medium"
              >
                Change Role
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
