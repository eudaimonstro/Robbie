import React from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';

interface CancelButtonProps {
  onCancel: () => void;
}

const CancelButton = ({ onCancel }: CancelButtonProps) => (
  <button
    onClick={onCancel}
    className="w-full py-3 rounded-lg border border-secondary-300 dark:border-secondary-600 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-50 dark:hover:bg-secondary-800"
  >
    Cancel
  </button>
);

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="animate-spin text-meeting-600 dark:text-meeting-400" size={24} />
      <span className="ml-2 text-secondary-600 dark:text-secondary-400">Loading...</span>
    </div>
  );
}

export function ErrorState({ error, onCancel }: { error: string } & CancelButtonProps) {
  return (
    <div className="space-y-4">
      <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-danger-700 dark:text-danger-400">
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
      <div className="bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-accent-700 dark:text-accent-400 mb-2">
          <AlertCircle size={18} />
          <span className="font-medium">No Organization Linked</span>
        </div>
        <p className="text-accent-600 dark:text-accent-500 text-sm">
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
      <div className="bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-accent-700 dark:text-accent-400 mb-2">
          <FileText size={18} />
          <span className="font-medium">No Documents Found</span>
        </div>
        <p className="text-accent-600 dark:text-accent-500 text-sm">
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
      <Loader2 className="animate-spin text-secondary-400 dark:text-secondary-500" size={20} />
      <span className="ml-2 text-secondary-500 dark:text-secondary-400 text-sm">
        Loading sections...
      </span>
    </div>
  );
}
