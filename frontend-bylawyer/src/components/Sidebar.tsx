import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FileText, GitBranch, Calendar, Settings, Plus, ChevronRight, ChevronDown, X } from 'lucide-react'
import { useOrganization } from '../context/OrganizationContext'
import { documents as documentsApi, Document } from '../api/client'

const navItems = [
  { icon: FileText, label: 'Documents', path: '/' },
  { icon: GitBranch, label: 'Amendments', path: '/amendments' },
  { icon: Calendar, label: 'Meetings', path: '/meetings' },
]

interface SidebarProps {
  onNewDocument: () => void
  onClose?: () => void
}

export default function Sidebar({ onNewDocument, onClose }: SidebarProps) {
  const location = useLocation()
  const { currentOrganization } = useOrganization()
  const [documents, setDocuments] = useState<Document[]>([])
  const [expandedDocs, setExpandedDocs] = useState(true)

  useEffect(() => {
    if (currentOrganization) {
      documentsApi.list(currentOrganization.id).then(setDocuments).catch(console.error)
    } else {
      setDocuments([])
    }
  }, [currentOrganization])

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/documents')
    }
    return location.pathname.startsWith(path)
  }

  return (
    <aside className="w-64 bg-primary-600 text-white flex flex-col h-full">
      {/* Mobile close button */}
      {onClose && (
        <div className="flex justify-end p-2 md:hidden">
          <button
            onClick={onClose}
            className="p-2 text-primary-200 hover:text-white hover:bg-primary-700 rounded-md"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* New Document Button */}
      <div className="p-4 pt-2 md:pt-4">
        <button
          onClick={onNewDocument}
          disabled={!currentOrganization}
          className="w-full btn bg-accent-500 hover:bg-accent-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Document
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)

          if (item.path === '/') {
            // Documents with expandable list
            return (
              <div key={item.path}>
                <button
                  onClick={() => setExpandedDocs(!expandedDocs)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors ${
                    active
                      ? 'bg-primary-700 text-white'
                      : 'text-primary-100 hover:bg-primary-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {expandedDocs ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                {expandedDocs && documents.length > 0 && (
                  <div className="ml-4 mb-2">
                    {documents.map((doc) => (
                      <Link
                        key={doc.id}
                        to={`/documents/${doc.id}`}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md mb-0.5 transition-colors ${
                          location.pathname === `/documents/${doc.id}`
                            ? 'bg-primary-700 text-white'
                            : 'text-primary-200 hover:bg-primary-700 hover:text-white'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span className="truncate">{doc.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors ${
                active
                  ? 'bg-primary-700 text-white'
                  : 'text-primary-100 hover:bg-primary-700 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Settings */}
      <div className="p-4 border-t border-primary-500">
        <Link
          to="/settings"
          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
            location.pathname === '/settings'
              ? 'bg-primary-700 text-white'
              : 'text-primary-100 hover:bg-primary-700 hover:text-white'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  )
}
