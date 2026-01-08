import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, Plus, ChevronDown, Building2, Menu, Search, X, FileText, Hash } from 'lucide-react'
import { useOrganization } from '../../context/OrganizationContext'
import { organizations, OrganizationCreate, search as searchApi, SearchResultItem } from '../../api/client'
import Modal from '../ui/Modal'
import { useToast } from '../../context/ToastContext'

interface HeaderProps {
  onMenuClick?: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const { organizations: orgs, currentOrganization, setCurrentOrganization, refreshOrganizations } = useOrganization()
  const { showToast } = useToast()
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await searchApi.query(searchQuery, currentOrganization?.id)
        setSearchResults(result.results)
        setShowSearchResults(true)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, currentOrganization?.id])

  const handleSearchResultClick = (result: SearchResultItem) => {
    setShowSearchResults(false)
    setSearchQuery('')
    if (result.type === 'document') {
      navigate(`/documents/${result.document_id}`)
    } else {
      navigate(`/documents/${result.document_id}`)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowSearchResults(false)
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOrgName.trim()) return

    try {
      setCreating(true)
      const data: OrganizationCreate = { name: newOrgName.trim() }
      const newOrg = await organizations.create(data)
      await refreshOrganizations()
      setCurrentOrganization(newOrg)
      setNewOrgName('')
      setIsCreateModalOpen(false)
      showToast('success', `Organization "${newOrg.name}" created successfully`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <header className="h-14 border-b border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 -ml-2 text-secondary-600 hover:text-secondary-900 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:text-white dark:hover:bg-secondary-700 rounded-md md:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <Scale className="w-6 h-6 text-primary-600" />
          <h1 className="text-xl font-heading font-bold text-primary-600">Robbie-Bylawyer</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                placeholder="Search documents..."
                className="w-64 pl-9 pr-8 py-1.5 text-sm border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-400 dark:focus:border-primary-400"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-secondary-400 hover:text-secondary-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && (
              <div className="absolute top-full left-0 mt-1 w-96 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                {isSearching ? (
                  <div className="p-4 text-center text-secondary-500 text-sm">
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-secondary-500 text-sm">
                    No results found for "{searchQuery}"
                  </div>
                ) : (
                  <div className="py-1">
                    {searchResults.map((result) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleSearchResultClick(result)}
                        className="w-full text-left px-4 py-2 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {result.type === 'document' ? (
                              <FileText className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Hash className="w-4 h-4 text-secondary-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-secondary-900 dark:text-white truncate">
                              {result.title}
                            </div>
                            {result.type === 'section' && (
                              <div className="text-xs text-secondary-500 truncate">
                                in {result.document_title}
                              </div>
                            )}
                            <div className="text-xs text-secondary-400 mt-0.5 line-clamp-2">
                              {result.snippet}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Organization selector */}
          <div className="relative">
            <button
              onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-600 transition-colors"
            >
              <Building2 className="w-4 h-4 text-secondary-500" />
              <span className="max-w-[200px] truncate">
                {currentOrganization?.name || 'Select Organization'}
              </span>
              <ChevronDown className="w-4 h-4 text-secondary-400" />
            </button>

            {isOrgDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsOrgDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-20 py-1">
                  {orgs.length > 0 ? (
                    <>
                      <div className="max-h-48 overflow-y-auto scrollbar-thin">
                        {orgs.map((org) => (
                          <button
                            key={org.id}
                            onClick={() => {
                              setCurrentOrganization(org)
                              setIsOrgDropdownOpen(false)
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors ${
                              currentOrganization?.id === org.id
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                                : 'text-secondary-700 dark:text-secondary-300'
                            }`}
                          >
                            {org.name}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
                    </>
                  ) : (
                    <p className="px-4 py-2 text-sm text-secondary-500">No organizations</p>
                  )}
                  <button
                    onClick={() => {
                      setIsOrgDropdownOpen(false)
                      setIsCreateModalOpen(true)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-primary-600 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Organization
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Create Organization Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Organization"
      >
        <form onSubmit={handleCreateOrganization}>
          <div className="mb-4">
            <label htmlFor="orgName" className="label">
              Organization Name
            </label>
            <input
              type="text"
              id="orgName"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              className="input"
              placeholder="e.g., Eastside Running Club"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!newOrgName.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
