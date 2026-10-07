import { createContext, useContext, ReactNode } from 'react';
import { useOrganization } from '../../../context/OrganizationContext';
import type { OrganizationWithRole } from '../../../api/client';

/**
 * MeetingOrganizationContext provides a bridge for the meetings module
 * to access the current organization without tight coupling to the
 * documents module's OrganizationContext.
 */
interface MeetingOrganizationContextType {
  /** The currently selected organization (from documents module), with the user's role */
  currentOrganization: OrganizationWithRole | null;
  /** The user's organizations, each with their role */
  availableOrganizations: OrganizationWithRole[];
  /** Whether organizations are still loading */
  loading: boolean;
}

const MeetingOrganizationContext = createContext<MeetingOrganizationContextType | null>(null);

export function MeetingOrganizationProvider({ children }: { children: ReactNode }) {
  const { currentOrganization, organizations, loading } = useOrganization();

  return (
    <MeetingOrganizationContext.Provider
      value={{
        currentOrganization,
        availableOrganizations: organizations,
        loading,
      }}
    >
      {children}
    </MeetingOrganizationContext.Provider>
  );
}

/**
 * Hook to access organization data in the meetings module.
 * Returns null values if used outside of MeetingOrganizationProvider
 * (graceful fallback for standalone meeting usage).
 */
export function useMeetingOrganization(): MeetingOrganizationContextType {
  const context = useContext(MeetingOrganizationContext);

  // Provide fallback for when meetings module is used standalone
  if (!context) {
    return {
      currentOrganization: null,
      availableOrganizations: [],
      loading: false,
    };
  }

  return context;
}
