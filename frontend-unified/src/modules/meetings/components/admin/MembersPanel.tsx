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
  onRename,
}: MembersPanelProps) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-ink">
        <Users size={18} /> Members
      </h3>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{m.name}</span>
              <button
                onClick={() => onRename(m)}
                className="text-ink-muted hover:text-gavel p-1"
                title="Rename member"
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  m.role === 'chair'
                    ? 'bg-gavel-tint text-ink'
                    : m.role === 'admin'
                      ? 'bg-gavel-tint text-ink'
                      : 'bg-rule text-ink'
                }`}
              >
                {m.role}
              </span>
              <button
                onClick={() => onRoleChange(m)}
                className="text-gavel hover:underline text-sm font-medium"
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
