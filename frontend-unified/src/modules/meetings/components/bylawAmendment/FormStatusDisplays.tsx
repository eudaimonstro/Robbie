import React from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';

interface CancelButtonProps {
  onCancel: () => void;
}

const CancelButton = ({ onCancel }: CancelButtonProps) => (
  <button
    onClick={onCancel}
    className="w-full py-3 rounded-lg border border-rule text-ink hover:bg-surface-2"
  >
    Cancel
  </button>
);

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="animate-spin text-gavel" size={24} />
      <span className="ml-2 text-ink-muted">Loading...</span>
    </div>
  );
}

export function ErrorState({ error, onCancel }: { error: string } & CancelButtonProps) {
  return (
    <div className="space-y-4">
      <div className="bg-gavel-tint border border-gavel/30 rounded-lg p-4">
        <div className="flex items-center gap-2 text-ink">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      </div>
      <CancelButton onCancel={onCancel} />
    </div>
  );
}

export function NoOrgLinkedState({ onCancel }: CancelButtonProps) {
  return (
    <div className="space-y-4">
      <div className="bg-caution-tint border border-caution/40 rounded-lg p-4">
        <div className="flex items-center gap-2 text-caution-ink mb-2">
          <AlertCircle size={18} />
          <span className="font-medium">No Organization Linked</span>
        </div>
        <p className="text-ink text-sm">
          This meeting must be linked to a Bylawyer organization to propose bylaw amendments. Ask
          the meeting administrator to link this meeting in the Admin panel.
        </p>
      </div>
      <CancelButton onCancel={onCancel} />
    </div>
  );
}

export function NoDocumentsState({ orgName, onCancel }: { orgName: string } & CancelButtonProps) {
  return (
    <div className="space-y-4">
      <div className="bg-caution-tint border border-caution/40 rounded-lg p-4">
        <div className="flex items-center gap-2 text-caution-ink mb-2">
          <FileText size={18} />
          <span className="font-medium">No Documents Found</span>
        </div>
        <p className="text-ink text-sm">
          The linked organization "{orgName}" has no bylaw documents. Create a document in Bylawyer
          first.
        </p>
      </div>
      <CancelButton onCancel={onCancel} />
    </div>
  );
}

export function LoadingSections() {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="animate-spin text-ink-muted" size={20} />
      <span className="ml-2 text-ink-muted text-sm">Loading sections...</span>
    </div>
  );
}
