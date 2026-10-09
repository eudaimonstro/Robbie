import { useId, useState } from 'react';
import { Scale } from 'lucide-react';
import type { BylawAmendmentVote } from '@robbie-bylawyer/shared/types';
import { organizations as organizationsApi } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';

/** The four rules, as the bylaws of an association say them */
const RULES: Array<{ value: BylawAmendmentVote; label: string }> = [
  { value: 'twoThirdsCast', label: 'Two thirds of the votes cast' },
  { value: 'majorityCast', label: 'A majority of the votes cast' },
  { value: 'majorityMembers', label: 'A majority of all the voting members' },
  { value: 'twoThirdsMembers', label: 'Two thirds of all the voting members' },
];

/** The rule in words, for anyone who can't change it */
function bylawVoteLabel(rule: BylawAmendmentVote | undefined): string {
  return RULES.find((r) => r.value === rule)?.label ?? RULES[0].label;
}

/**
 * What the organization's bylaws require to amend them, which each bylaw amendment moved in a
 * meeting carries (the meeting's question card states it). Admins change it.
 */
export function BylawVoteCard() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const isAdmin = useCan('admin');
  const { showToast } = useToast();
  const selectId = useId();
  const [saving, setSaving] = useState(false);
  if (!currentOrganization) return null;

  const current = currentOrganization.bylawAmendmentVote ?? 'twoThirdsCast';
  const change = async (rule: BylawAmendmentVote) => {
    setSaving(true);
    try {
      await organizationsApi.setVoteRules(currentOrganization.id, { bylawAmendmentVote: rule });
      await refreshOrganizations();
      showToast('success', 'Saved what bylaw amendments need');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't save the vote required");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="border-b border-rule px-4 py-4 sm:px-6">
        <h3 className="card-title flex items-center gap-2">
          <Scale className="h-5 w-5" aria-hidden="true" />
          Bylaw amendments
        </h3>
      </div>
      <div className="space-y-2 p-4 sm:p-6">
        {isAdmin ? (
          <>
            <label htmlFor={selectId} className="label">
              Bylaw amendments need
            </label>
            <select
              id={selectId}
              className="select"
              value={current}
              disabled={saving}
              onChange={(e) => void change(e.target.value as BylawAmendmentVote)}
            >
              {RULES.map((rule) => (
                <option key={rule.value} value={rule.value}>
                  {rule.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="font-medium text-ink">{`Bylaw amendments need ${bylawVoteLabel(current).toLowerCase()}`}</p>
        )}
        <p className="text-xs text-ink-muted">
          As your bylaws or state law require. All the voting members are the number under
          Attendance. A motion keeps the rule it was moved under.
        </p>
      </div>
    </div>
  );
}
