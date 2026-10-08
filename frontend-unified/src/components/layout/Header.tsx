import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Menu, Search, X, Hash } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { search as searchApi, type SearchHit } from '../../api/client';
import { UserMenu } from './UserMenu';
import { OrganizationSwitcher } from './OrganizationSwitcher';

interface HeaderProps {
  onMenuClick?: () => void;
  /** The menu button at every width, not only on phones: a live meeting hides the sidebar */
  menuAlways?: boolean;
}

export default function Header({ onMenuClick, menuAlways = false }: HeaderProps) {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  // Below the xl breakpoint the search box is an icon button that opens it over the header
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // The current organization's bylaws, from 2 characters
    const organizationId = currentOrganization?.id;
    const query = searchQuery.trim();
    if (!organizationId || query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
      return;
    }

    // Set when the query or the organization changes (or the search is cleared): an answer
    // already on its way is for a search nobody is looking at any more, and is dropped
    let stale = false;
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await searchApi.query(organizationId, query);
        if (stale) return;
        setSearchResults(result.results);
        setShowSearchResults(true);
      } catch {
        if (!stale) setSearchResults([]);
      } finally {
        if (!stale) setIsSearching(false);
      }
    }, 300);

    return () => {
      stale = true;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, currentOrganization?.id]);

  // The document opens at the section: it is selected and scrolled into view there
  const handleSearchResultClick = (hit: SearchHit) => {
    setShowSearchResults(false);
    setSearchQuery('');
    setSearchOpen(false);
    navigate(`/documents/${hit.documentId}#section-${hit.sectionId}`);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const openSearch = () => {
    setSearchOpen(true);
    // The input is drawn by this render; focus it once it is
    setTimeout(() => searchInputRef.current?.focus());
  };

  const closeSearch = () => {
    clearSearch();
    setSearchOpen(false);
  };

  return (
    <header className="relative h-14 border-b border-rule bg-surface px-4 md:px-6 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 shrink-0">
        {/* Mobile menu button */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className={`p-2 -ml-2 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-md ${menuAlways ? '' : 'md:hidden'}`}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Scale className="w-6 h-6 text-gavel" aria-hidden="true" />
        <h1 className="font-serif-soft text-title font-semibold text-ink">Robbie</h1>
      </div>

      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Search: a box on laptops; an icon button that opens it over the header below xl */}
        <button
          onClick={openSearch}
          className="xl:hidden p-2 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-md"
          aria-label="Search"
          aria-expanded={searchOpen}
        >
          <Search className="w-5 h-5" aria-hidden="true" />
        </button>
        <div
          className={
            searchOpen
              ? 'absolute inset-0 z-30 flex items-center gap-2 bg-surface px-4 md:px-6 xl:relative xl:inset-auto xl:z-auto xl:block xl:bg-transparent xl:px-0'
              : 'relative hidden xl:block'
          }
          ref={searchRef}
        >
          <div className="relative flex-1 xl:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
              onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              placeholder="Search documents..."
              aria-label="Search documents"
              className="w-full xl:w-64 pl-9 pr-8 py-1.5 max-md:min-h-11 text-sm border border-rule rounded-md bg-surface focus:border-gavel"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchOpen && (
            <button
              onClick={closeSearch}
              className="xl:hidden px-2 py-1.5 text-sm text-gavel hover:underline"
            >
              Close
            </button>
          )}

          {/* Search Results Dropdown */}
          {showSearchResults && (
            <div className="absolute top-full inset-x-4 md:inset-x-6 xl:inset-x-auto xl:left-0 mt-1 xl:w-96 bg-surface border border-rule rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
              {isSearching ? (
                <div className="p-4 text-center text-ink-muted text-sm">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-ink-muted text-sm">
                  No results found for "{searchQuery}"
                </div>
              ) : (
                <div className="py-1">
                  {searchResults.map((hit) => (
                    <button
                      key={hit.sectionId}
                      onClick={() => handleSearchResultClick(hit)}
                      className="w-full text-left px-4 py-2 hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Hash className="mt-0.5 w-4 h-4 text-ink-muted" aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink truncate">
                            {[hit.numberLabel, hit.title].filter(Boolean).join(' ') || 'Section'}
                          </div>
                          <div className="text-xs text-ink-muted truncate">
                            in {hit.documentTitle}
                          </div>
                          {hit.snippet && (
                            <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                              {hit.snippet}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <OrganizationSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
