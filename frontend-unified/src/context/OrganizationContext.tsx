import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { organizations, type OrganizationWithRole } from '../api/client';
import { useSession } from './SessionContext';
import { atLeast, type OrgRole } from '../utils/roles';

interface OrganizationContextType {
  /** The signed-in user's organizations, each with their role */
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole | null;
  /** The user's role in the current organization, or null without one */
  role: OrgRole | null;
  setCurrentOrganization: (org: OrganizationWithRole | null) => void;
  /** Whether the first load is still under way; a refresh keeps the current list showing */
  loading: boolean;
  error: string | null;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

const SELECTION_KEY = 'selectedOrganizationId';

// The remembered selection belongs to the user who made it, so someone else signing in on the
// same browser starts at their own first organization
function savedOrganizationId(userId: number | undefined): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null') as {
      userId?: number;
      id?: string;
    } | null;
    return saved && saved.userId === userId && saved.id ? saved.id : null;
  } catch {
    return null;
  }
}

function saveOrganizationId(userId: number | undefined, id: string | null) {
  try {
    if (id && userId) localStorage.setItem(SELECTION_KEY, JSON.stringify({ userId, id }));
    else localStorage.removeItem(SELECTION_KEY);
  } catch {
    // Storage may be unavailable; the selection just isn't remembered across reloads
  }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id;
  const [orgs, setOrgs] = useState<OrganizationWithRole[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshOrganizations = useCallback(async () => {
    try {
      setError(null);
      const data = await organizations.list();
      setOrgs(data);

      // Re-resolve the selection from the fresh list, so a rename or a new role shows and a
      // deleted or left organization is replaced. Otherwise use the saved choice, or the first.
      setCurrentOrganization((current) => {
        const stillListed = current && data.find((o) => o.id === current.id);
        if (stillListed) return stillListed;
        const savedOrgId = savedOrganizationId(userId);
        const saved = data.find((o) => o.id === savedOrgId);
        // The saved organization was left or deleted: forget it
        if (savedOrgId && !saved) saveOrganizationId(userId, null);
        return saved ?? data[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations]);

  // Remember the selection for this user
  useEffect(() => {
    if (currentOrganization) saveOrganizationId(userId, currentOrganization.id);
  }, [currentOrganization, userId]);

  return (
    <OrganizationContext.Provider
      value={{
        organizations: orgs,
        currentOrganization,
        role: currentOrganization?.role ?? null,
        setCurrentOrganization,
        loading,
        error,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

/**
 * Whether the user's role in the current organization is `min` or higher, to hide actions the
 * role can't take. The server still decides.
 */
export function useCan(min: OrgRole): boolean {
  const { role } = useOrganization();
  return role !== null && atLeast(role, min);
}

/**
 * Makes the organization a record (a document, an amendment, a recorded meeting) belongs to
 * the current one once the record loads, so the page's role, breadcrumb and lists follow the
 * record rather than the header. Not one of the user's organizations: the selection stays,
 * since the server has already answered that the record wasn't found.
 */
export function useSelectRecordOrganization(organizationId: string | undefined): void {
  const { organizations: orgs, currentOrganization, setCurrentOrganization } = useOrganization();
  const currentId = currentOrganization?.id;
  useEffect(() => {
    if (!organizationId || organizationId === currentId) return;
    const org = orgs.find((o) => o.id === organizationId);
    if (org) setCurrentOrganization(org);
  }, [organizationId, currentId, orgs, setCurrentOrganization]);
}
