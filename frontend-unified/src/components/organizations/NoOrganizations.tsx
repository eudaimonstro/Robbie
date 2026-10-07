import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { useSession } from '../../context/SessionContext';
import { NewOrganizationModal } from './NewOrganizationModal';

/** For a user in no organization: create one, or ask to be added by email */
export function NoOrganizations() {
  const { user } = useSession();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <EmptyState
        icon={Building2}
        title="No organizations yet"
        description={`Create an organization, or ask your organization's secretary to add ${user?.email ?? 'your email'}.`}
        action={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
            New organization
          </button>
        }
      />
      <NewOrganizationModal isOpen={creating} onClose={() => setCreating(false)} />
    </>
  );
}
