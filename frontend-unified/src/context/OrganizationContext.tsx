import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { organizations, Organization } from '../api/client'

interface OrganizationContextType {
  organizations: Organization[]
  currentOrganization: Organization | null
  setCurrentOrganization: (org: Organization | null) => void
  loading: boolean
  error: string | null
  refreshOrganizations: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextType | null>(null)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshOrganizations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await organizations.list()
      setOrgs(data)

      // If we have organizations and none selected, select the first one
      if (data.length > 0 && !currentOrganization) {
        // Check localStorage for previously selected org
        const savedOrgId = localStorage.getItem('selectedOrganizationId')
        const savedOrg = savedOrgId ? data.find(o => o.id === savedOrgId) : null
        setCurrentOrganization(savedOrg || data[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [currentOrganization])

  useEffect(() => {
    refreshOrganizations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save selected org to localStorage
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('selectedOrganizationId', currentOrganization.id)
    }
  }, [currentOrganization])

  return (
    <OrganizationContext.Provider
      value={{
        organizations: orgs,
        currentOrganization,
        setCurrentOrganization,
        loading,
        error,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}
