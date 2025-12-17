import { useState } from 'react';
import type { SuspendableRule } from '../types';
import { getRuleName, getRuleDescription } from '../utils/ruleSuspensionHelper';

interface SuspendRulesFormProps {
  onSubmit: (purpose: string, specificAction: string, scope: 'single-action' | 'meeting-remainder', rule: SuspendableRule) => void;
  onCancel: () => void;
}

export function SuspendRulesForm({ onSubmit, onCancel }: SuspendRulesFormProps) {
  // Phase 2: Hardcoded to second-requirement for proof of concept
  const rule: SuspendableRule = 'second-requirement';

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
    <div className="bg-white border-2 border-amber-500 rounded-lg p-6 shadow-lg max-w-md mx-auto">
      <h3 className="text-xl font-bold mb-4 text-amber-900">
        Suspend the Rules
      </h3>

      <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded">
        <p className="text-sm font-semibold text-amber-900 mb-1">⚠️ Requires 2/3 vote</p>
        <p className="text-xs text-amber-800">
          This motion requires approval by two-thirds of the assembly.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Rule being suspended (hardcoded for Phase 2) */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-2 text-gray-700">
            Rule to suspend:
          </label>
          <div className="p-3 bg-gray-50 border border-gray-300 rounded">
            <p className="font-semibold text-gray-900">{getRuleName(rule)}</p>
            <p className="text-xs text-gray-600 mt-1">{getRuleDescription(rule)}</p>
          </div>
        </div>

        {/* Purpose (RONR requirement) */}
        <div className="mb-4">
          <label htmlFor="purpose" className="block text-sm font-semibold mb-2 text-gray-700">
            For what purpose? <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., 'Emergency situation requires immediate action'"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Robert's Rules requires stating why the rule should be suspended.
          </p>
        </div>

        {/* Specific Action */}
        <div className="mb-4">
          <label htmlFor="specificAction" className="block text-sm font-semibold mb-2 text-gray-700">
            What specific action is allowed? <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="specificAction"
            value={specificAction}
            onChange={(e) => setSpecificAction(e.target.value)}
            placeholder="e.g., 'Allow motion to proceed without a second'"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Describe exactly what action will be permitted under this suspension.
          </p>
        </div>

        {/* Duration/Scope */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-700">
            Duration:
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="single-action"
                checked={scope === 'single-action'}
                onChange={(e) => setScope(e.target.value as 'single-action')}
                className="mr-2"
              />
              <span className="text-sm">
                Single action <span className="text-gray-500">(suspension ends after one use)</span>
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="meeting-remainder"
                checked={scope === 'meeting-remainder'}
                onChange={(e) => setScope(e.target.value as 'meeting-remainder')}
                className="mr-2"
              />
              <span className="text-sm">
                Remainder of meeting <span className="text-gray-500">(until adjournment)</span>
              </span>
            </label>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-semibold"
          >
            Submit Motion
          </button>
        </div>
      </form>
    </div>
  );
}
