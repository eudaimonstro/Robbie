import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { organizations, type OrganizationWithRole } from '../api/client';
import { atLeast, type OrgRole } from '../utils/roles';

interface OrganizationContextType {
  /** The signed-in user's organizations, each with their role */
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole | null;
  /** The user's role in the current organization, or null without one */
  role: OrgRole | null;
  setCurrentOrganization: (org: OrganizationWithRole | null) => void;
  loading: boolean;
  error: string | null;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrganizationWithRole[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await organizations.list();
      setOrgs(data);

      // Re-resolve the selection from the fresh list, so a rename or a new role shows and a
      // deleted or left organization is replaced. Otherwise use the saved choice, or the first.
      setCurrentOrganization((current) => {
        const stillListed = current && data.find((o) => o.id === current.id);
        if (stillListed) return stillListed;
        const savedOrgId = localStorage.getItem('selectedOrganizationId');
        return data.find((o) => o.id === savedOrgId) ?? data[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations]);

  // Save selected org to localStorage
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('selectedOrganizationId', currentOrganization.id);
    }
  }, [currentOrganization]);

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
