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
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-2 sm:px-3 py-1.5 max-md:min-h-11 text-sm border border-rule rounded-md bg-surface hover:bg-surface-2 transition-colors max-w-full"
      >
        <Building2 className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
        {/* The name is only read out on phones; it truncates on wider screens */}
        <span className="sr-only sm:not-sr-only min-w-0">
          <span className="block truncate max-w-32 lg:max-w-48 xl:max-w-[200px]">
            {currentOrganization?.name ?? 'No organization'}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1 w-64 bg-surface border border-rule rounded-lg shadow-lg z-20 py-1"
          >
            {orgs.length > 0 ? (
              <>
                <div className="max-h-48 overflow-y-auto scrollbar-thin">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      role="menuitem"
                      onClick={() => choose(org)}
                      className={`w-full text-left px-4 py-2 max-md:py-3 text-sm hover:bg-surface-2 transition-colors ${
                        currentOrganization?.id === org.id ? 'bg-gavel-tint text-ink' : 'text-ink'
                      }`}
                    >
                      <span className="block truncate">{org.name}</span>
                      <span className="block text-xs text-ink-muted">{ROLE_LABELS[org.role]}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-rule my-1" />
              </>
            ) : (
              <p className="px-4 py-2 text-sm text-ink-muted">No organizations yet</p>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="w-full text-left px-4 py-2 max-md:py-3 text-sm text-gavel hover:bg-surface-2 transition-colors flex items-center gap-2"
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
