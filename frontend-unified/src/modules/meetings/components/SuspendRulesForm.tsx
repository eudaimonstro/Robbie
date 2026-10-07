import { useState } from 'react';
import type { SuspendableRule } from '@robbie-bylawyer/shared/types';
import { getRuleName, getRuleDescription } from '@robbie-bylawyer/shared/utils';

interface SuspendRulesFormProps {
  onSubmit: (
    purpose: string,
    specificAction: string,
    scope: 'single-action' | 'meeting-remainder',
    rule: SuspendableRule,
  ) => void;
  onCancel: () => void;
}

// Common suspendable rules organized by tier
const COMMON_RULES: SuspendableRule[] = [
  // Tier 1: Most common
  'second-requirement',
  'motion-precedence',
  'order-of-business',
  'debate-rules',
  // Tier 2: Less common but useful
  'pro-con-alternation',
  'amendment-depth',
];

export function SuspendRulesForm({ onSubmit, onCancel }: SuspendRulesFormProps) {
  // Phase 3: Dynamic selection of Tier 1 rules
  const [rule, setRule] = useState<SuspendableRule>('second-requirement');
  const [purpose, setPurpose] = useState('');
  const [specificAction, setSpecificAction] = useState('');
  const [scope, setScope] = useState<'single-action' | 'meeting-remainder'>('meeting-remainder');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!purpose.trim() || !specificAction.trim()) {
      alert('Please provide both a purpose and specific action.');
      return;
    }

    onSubmit(purpose.trim(), specificAction.trim(), scope, rule);
  };

  return (
    <div className="bg-surface border-2 border-caution rounded-lg p-6 shadow-lg max-w-md mx-auto">
      <h3 className="text-xl font-bold mb-4 text-ink">Suspend the Rules</h3>

      <div className="mb-4 p-3 bg-caution-tint border border-caution/40 rounded-sm">
        <p className="text-sm font-semibold text-ink mb-1">Requires 2/3 vote</p>
        <p className="text-xs text-ink">
          This motion requires approval by two-thirds of the assembly.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Rule selection (Tier 1 rules) */}
        <div className="mb-4">
          <label htmlFor="rule" className="block text-sm font-semibold mb-2 text-ink">
            Which rule to suspend? <span className="text-gavel">*</span>
          </label>
          <select
            id="rule"
            value={rule}
            onChange={(e) => setRule(e.target.value as SuspendableRule)}
            className="w-full px-3 py-2 border border-rule rounded-sm focus:outline-hidden focus:ring-2 focus:ring-gavel mb-2"
          >
            {COMMON_RULES.map((r) => (
              <option key={r} value={r}>
                {getRuleName(r)}
              </option>
            ))}
          </select>
          <div className="p-2 bg-surface-2 border border-rule rounded-sm">
            <p className="text-xs text-ink-muted">{getRuleDescription(rule)}</p>
          </div>
        </div>

        {/* Purpose (RONR requirement) */}
        <div className="mb-4">
          <label htmlFor="purpose" className="block text-sm font-semibold mb-2 text-ink">
            For what purpose? <span className="text-gavel">*</span>
          </label>
          <input
            type="text"
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., 'Emergency situation requires immediate action'"
            className="w-full px-3 py-2 border border-rule rounded-sm focus:outline-hidden focus:ring-2 focus:ring-gavel"
            required
          />
          <p className="text-xs text-ink-muted mt-1">
            Robert's Rules requires stating why the rule should be suspended.
          </p>
        </div>

        {/* Specific Action */}
        <div className="mb-4">
          <label htmlFor="specificAction" className="block text-sm font-semibold mb-2 text-ink">
            What specific action is allowed? <span className="text-gavel">*</span>
          </label>
          <input
            type="text"
            id="specificAction"
            value={specificAction}
            onChange={(e) => setSpecificAction(e.target.value)}
            placeholder="e.g., 'Allow motion to proceed without a second'"
            className="w-full px-3 py-2 border border-rule rounded-sm focus:outline-hidden focus:ring-2 focus:ring-gavel"
            required
          />
          <p className="text-xs text-ink-muted mt-1">
            Describe exactly what action will be permitted under this suspension.
          </p>
        </div>

        {/* Duration/Scope */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-ink">Duration:</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="single-action"
                checked={scope === 'single-action'}
                onChange={(e) => setScope(e.target.value as 'single-action')}
                className="mr-2 accent-gavel"
              />
              <span className="text-sm">
                Single action{' '}
                <span className="text-ink-muted">(suspension ends after one use)</span>
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="meeting-remainder"
                checked={scope === 'meeting-remainder'}
                onChange={(e) => setScope(e.target.value as 'meeting-remainder')}
                className="mr-2 accent-gavel"
              />
              <span className="text-sm">
                Remainder of meeting <span className="text-ink-muted">(until adjournment)</span>
              </span>
            </label>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-surface-2 text-ink rounded-sm hover:bg-rule transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-gavel text-paper rounded-sm hover:bg-gavel-700 dark:hover:bg-gavel-300 transition-colors font-semibold"
          >
            Submit Motion
          </button>
        </div>
      </form>
    </div>
  );
}
