import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import type { OrganizationWithRole } from '../../api/client';
import { ROLE_LABELS } from '../../utils/roles';
import { showsOneOrganizationsRecord } from '../../utils/organizationPages';
import { NewOrganizationModal } from '../organizations/NewOrganizationModal';

/** The current organization; the user's organizations with their roles; "New organization" */
export function OrganizationSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { organizations: orgs, currentOrganization, setCurrentOrganization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const choose = (org: OrganizationWithRole) => {
    // A document, amendment or meeting page belongs to the old one
    if (org.id !== currentOrganization?.id && showsOneOrganizationsRecord(location.pathname)) {
      navigate('/');
    }
    setCurrentOrganization(org);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-600 transition-colors"
      >
        <Building2 className="w-4 h-4 text-secondary-500" aria-hidden="true" />
        <span className="max-w-[200px] truncate">
          {currentOrganization?.name ?? 'No organization'}
        </span>
        <ChevronDown className="w-4 h-4 text-secondary-400" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1 w-64 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-20 py-1"
          >
            {orgs.length > 0 ? (
              <>
                <div className="max-h-48 overflow-y-auto scrollbar-thin">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      role="menuitem"
                      onClick={() => choose(org)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors ${
                        currentOrganization?.id === org.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                          : 'text-secondary-700 dark:text-secondary-300'
                      }`}
                    >
                      <span className="block truncate">{org.name}</span>
                      <span className="block text-xs text-secondary-500">
                        {ROLE_LABELS[org.role]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
              </>
            ) : (
              <p className="px-4 py-2 text-sm text-secondary-500">No organizations yet</p>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="w-full text-left px-4 py-2 text-sm text-primary-600 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New organization
            </button>
          </div>
        </>
      )}

      <NewOrganizationModal isOpen={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
