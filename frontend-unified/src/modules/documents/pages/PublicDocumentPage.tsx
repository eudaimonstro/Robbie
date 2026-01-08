import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Clock, FileText, Download, ChevronDown, Eye, AlertCircle } from 'lucide-react'
import {
  publicDocuments,
  versions as versionsApi,
  PublicDocument,
  PublicVersion,
  SectionTree as SectionTreeType,
} from '../../../api/client'
import { LoadingPage } from '../../../components/ui/LoadingSpinner'
import { DocumentTypeBadge } from '../../../components/ui/Badge'
import SectionTree from '../components/SectionTree'
import { useToast } from '../../../context/ToastContext'

export default function PublicDocumentPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const { showToast } = useToast()

  const [doc, setDoc] = useState<PublicDocument | null>(null)
  const [versions, setVersions] = useState<PublicVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<PublicVersion | null>(null)
  const [sectionTree, setSectionTree] = useState<SectionTreeType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Export dropdown
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportDropdownRef = useRef<HTMLDivElement>(null)

  // Close export dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false)
      }
    }

    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [exportDropdownOpen])

  const fetchDocument = useCallback(async () => {
    if (!shareToken) return

    try {
      setLoading(true)
      setError(null)

      const [fetchedDoc, vers] = await Promise.all([
        publicDocuments.get(shareToken),
        publicDocuments.getVersions(shareToken),
      ])

      setDoc(fetchedDoc)
      setVersions(vers)

      // Select current version or latest
      const currentVersion = fetchedDoc.current_version_id
        ? vers.find(v => v.id === fetchedDoc.current_version_id)
        : vers[vers.length - 1]

      if (currentVersion) {
        setSelectedVersion(currentVersion)
        const tree = await publicDocuments.getTree(shareToken, currentVersion.id)
        setSectionTree(tree)
      }
    } catch (err: unknown) {
      console.error(err)
      if (err && typeof err === 'object' && 'message' in err) {
        const errorObj = err as { message: string }
        if (errorObj.message.includes('404')) {
          setError('This document is not available. The link may be invalid or sharing may have been disabled.')
        } else {
          setError('Failed to load document')
        }
      } else {
        setError('Failed to load document')
      }
    } finally {
      setLoading(false)
    }
  }, [shareToken])

  useEffect(() => {
    fetchDocument()
  }, [fetchDocument])

  const handleVersionChange = async (versionId: string) => {
    if (!shareToken) return

    const version = versions.find(v => v.id === versionId)
    if (version) {
      setSelectedVersion(version)
      try {
        const tree = await publicDocuments.getTree(shareToken, version.id)
        setSectionTree(tree)
      } catch (err) {
        showToast('error', 'Failed to load version')
      }
    }
  }

  const handleExport = async (format: 'pdf' | 'markdown' | 'html') => {
    if (!selectedVersion) return

    try {
      setExporting(true)
      setExportDropdownOpen(false)

      switch (format) {
        case 'pdf':
          await versionsApi.exportPdf(selectedVersion.id)
          break
        case 'markdown':
          await versionsApi.exportMarkdown(selectedVersion.id)
          break
        case 'html':
          await versionsApi.exportHtml(selectedVersion.id)
          break
      }

      showToast('success', `Exported as ${format.toUpperCase()}`)
    } catch (err) {
      showToast('error', `Failed to export as ${format.toUpperCase()}`)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <LoadingPage />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-danger-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
            Document Not Available
          </h2>
          <p className="text-secondary-600 dark:text-secondary-400 mb-6">
            {error}
          </p>
          <Link to="/" className="btn-primary">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          Document not found
        </h2>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      {/* Readonly banner */}
      <div className="bg-primary-50 dark:bg-primary-900/30 border-b border-primary-200 dark:border-primary-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <span className="text-sm text-primary-700 dark:text-primary-300">
            You are viewing a shared document (read-only)
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
                {doc.title}
              </h1>
              <DocumentTypeBadge type={doc.doc_type} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Version selector */}
            <select
              value={selectedVersion?.id || ''}
              onChange={(e) => handleVersionChange(e.target.value)}
              className="select text-sm py-1.5"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version_number}
                  {v.id === doc.current_version_id ? ' (Current)' : ''}
                  {v.effective_date && ` - ${new Date(v.effective_date).toLocaleDateString()}`}
                </option>
              ))}
            </select>

            {/* Export dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="btn-secondary btn-sm"
                disabled={exporting || !selectedVersion}
              >
                <Download className="w-4 h-4 mr-2" />
                {exporting ? 'Exporting...' : 'Export'}
                <ChevronDown className="w-4 h-4 ml-1" />
              </button>

              {exportDropdownOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-secondary-800 rounded-lg shadow-lg border border-secondary-200 dark:border-secondary-700 z-10">
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-secondary-100 dark:hover:bg-secondary-700 first:rounded-t-lg"
                  >
                    PDF Document
                  </button>
                  <button
                    onClick={() => handleExport('markdown')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-secondary-100 dark:hover:bg-secondary-700"
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => handleExport('html')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-secondary-100 dark:hover:bg-secondary-700 last:rounded-b-lg"
                  >
                    HTML
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section tree */}
        <div className="card">
          <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
            <h3 className="font-semibold text-secondary-900 dark:text-white">
              Document Content
            </h3>
          </div>

          <div className="p-4">
            {sectionTree.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
                <p className="text-secondary-600 dark:text-secondary-400">
                  This document has no content yet.
                </p>
              </div>
            ) : (
              <SectionTree
                sections={sectionTree}
                editable={false}
              />
            )}
          </div>
        </div>

        {/* Version info */}
        {selectedVersion && (
          <div className="mt-4 card p-4">
            <div className="flex items-center gap-4 text-sm text-secondary-600 dark:text-secondary-400">
              {selectedVersion.effective_date && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Effective: {new Date(selectedVersion.effective_date).toLocaleDateString()}
                </div>
              )}
              {selectedVersion.adopted_at && (
                <div>
                  Adopted: {new Date(selectedVersion.adopted_at).toLocaleDateString()}
                </div>
              )}
              {selectedVersion.notes && (
                <div className="flex-1 truncate">
                  Notes: {selectedVersion.notes}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
