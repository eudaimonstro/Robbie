import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, Edit, GitCompare, Plus, Clock, FileText, Download, ChevronDown, Share2 } from 'lucide-react'
import {
  documents as documentsApi,
  versions as versionsApi,
  sections as sectionsApi,
  amendments as amendmentsApi,
  Document,
  Version,
  SectionTree as SectionTreeType,
  Amendment,
  SectionCreate,
  SectionUpdate,
} from '../api/client'
import { useOrganization } from '../context/OrganizationContext'
import { LoadingPage } from '../components/ui/LoadingSpinner'
import { StatusBadge, DocumentTypeBadge } from '../components/ui/Badge'
import SectionTree from '../components/SectionTree'
import SectionEditor from '../components/SectionEditor'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import ShareModal from '../components/ShareModal'

export default function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const { currentOrganization } = useOrganization()
  const { showToast } = useToast()

  const [doc, setDoc] = useState<Document | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [sectionTree, setSectionTree] = useState<SectionTreeType[]>([])
  const [amendments, setAmendments] = useState<Amendment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSection, setSelectedSection] = useState<SectionTreeType | null>(null)

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'addChild'>('create')
  const [editingSection, setEditingSection] = useState<SectionTreeType | null>(null)
  const [parentSection, setParentSection] = useState<SectionTreeType | null>(null)

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingSection, setDeletingSection] = useState<SectionTreeType | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Create version modal
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [versionNotes, setVersionNotes] = useState('')
  const [creatingVersion, setCreatingVersion] = useState(false)

  // Create amendment modal
  const [amendmentModalOpen, setAmendmentModalOpen] = useState(false)
  const [amendmentTitle, setAmendmentTitle] = useState('')
  const [amendmentDescription, setAmendmentDescription] = useState('')
  const [creatingAmendment, setCreatingAmendment] = useState(false)

  // Export dropdown
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportDropdownRef = useRef<HTMLDivElement>(null)

  // Share modal
  const [shareModalOpen, setShareModalOpen] = useState(false)

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
    if (!documentId) return

    try {
      setLoading(true)
      const [fetchedDoc, vers, amends] = await Promise.all([
        documentsApi.get(documentId),
        versionsApi.list(documentId),
        amendmentsApi.list(documentId),
      ])

      setDoc(fetchedDoc)
      setVersions(vers)
      setAmendments(amends.filter(a => a.status === 'draft' || a.status === 'proposed'))

      // Select current version or latest
      const currentVersion = fetchedDoc.current_version_id
        ? vers.find(v => v.id === fetchedDoc.current_version_id)
        : vers[vers.length - 1]

      if (currentVersion) {
        setSelectedVersion(currentVersion)
        const tree = await versionsApi.getTree(currentVersion.id)
        setSectionTree(tree)
      }
    } catch (err) {
      showToast('error', 'Failed to load document')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [documentId, showToast])

  useEffect(() => {
    fetchDocument()
  }, [fetchDocument])

  const handleVersionChange = async (versionId: string) => {
    const version = versions.find(v => v.id === versionId)
    if (version) {
      setSelectedVersion(version)
      try {
        const tree = await versionsApi.getTree(version.id)
        setSectionTree(tree)
      } catch (err) {
        showToast('error', 'Failed to load version')
      }
    }
  }

  const handleAddSection = () => {
    setEditorMode('create')
    setEditingSection(null)
    setParentSection(null)
    setEditorOpen(true)
  }

  const handleEditSection = (section: SectionTreeType) => {
    setEditorMode('edit')
    setEditingSection(section)
    setParentSection(null)
    setEditorOpen(true)
  }

  const handleAddChild = (parent: SectionTreeType) => {
    setEditorMode('addChild')
    setEditingSection(null)
    setParentSection(parent)
    setEditorOpen(true)
  }

  const handleDeleteSection = (section: SectionTreeType) => {
    setDeletingSection(section)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingSection) return

    try {
      setDeleting(true)
      await sectionsApi.delete(deletingSection.id)
      showToast('success', 'Section deleted')
      setDeleteDialogOpen(false)
      setDeletingSection(null)

      // Refresh section tree (bypass cache to get fresh data)
      if (selectedVersion) {
        const tree = await versionsApi.getTree(selectedVersion.id, true)
        setSectionTree(tree)
      }
    } catch (err) {
      showToast('error', 'Failed to delete section')
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveSection = async (data: SectionCreate | SectionUpdate) => {
    if (!selectedVersion) return

    try {
      if (editorMode === 'edit' && editingSection) {
        await sectionsApi.update(editingSection.id, data as SectionUpdate)
        showToast('success', 'Section updated')
      } else if (editorMode === 'addChild' && parentSection) {
        await sectionsApi.addChild(parentSection.id, data as SectionCreate)
        showToast('success', 'Child section added')
      } else {
        await sectionsApi.create(selectedVersion.id, data as SectionCreate)
        showToast('success', 'Section added')
      }

      // Refresh section tree (bypass cache to get fresh data)
      const tree = await versionsApi.getTree(selectedVersion.id, true)
      setSectionTree(tree)
    } catch (err) {
      console.error('Failed to save section:', err)
      throw err // Re-throw so SectionEditor can display the error
    }
  }

  const handleReorderSections = async (updates: Array<{ id: string; position: number }>) => {
    if (!selectedVersion) return

    try {
      await sectionsApi.reorder(selectedVersion.id, updates)
      // Refresh section tree (bypass cache to get fresh data)
      const tree = await versionsApi.getTree(selectedVersion.id, true)
      setSectionTree(tree)
      showToast('success', 'Section order updated')
    } catch (err) {
      showToast('error', 'Failed to reorder sections')
      // Refresh to restore original order (bypass cache)
      const tree = await versionsApi.getTree(selectedVersion.id, true)
      setSectionTree(tree)
    }
  }

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!documentId) return

    try {
      setCreatingVersion(true)
      const newVersion = await versionsApi.create(documentId, {
        notes: versionNotes.trim() || undefined,
      })
      await fetchDocument()
      setSelectedVersion(newVersion)
      const tree = await versionsApi.getTree(newVersion.id)
      setSectionTree(tree)
      setVersionModalOpen(false)
      setVersionNotes('')
      showToast('success', `Version ${newVersion.version_number} created`)
    } catch (err) {
      showToast('error', 'Failed to create version')
    } finally {
      setCreatingVersion(false)
    }
  }

  const handleCreateAmendment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!documentId || !amendmentTitle.trim()) return

    try {
      setCreatingAmendment(true)
      const amendment = await amendmentsApi.create(documentId, {
        title: amendmentTitle.trim(),
        description: amendmentDescription.trim() || undefined,
      })
      setAmendmentModalOpen(false)
      setAmendmentTitle('')
      setAmendmentDescription('')
      showToast('success', 'Amendment created')
      navigate(`/amendments/${amendment.id}`)
    } catch (err) {
      showToast('error', 'Failed to create amendment')
    } finally {
      setCreatingAmendment(false)
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

  if (!doc) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          Document not found
        </h2>
        <Link to="/" className="text-primary-600 hover:text-primary-700">
          Return to documents
        </Link>
      </div>
    )
  }

  return (
    <div className="flex gap-6 max-w-7xl mx-auto">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
              <Link to="/" className="hover:text-primary-600">
                {currentOrganization?.name}
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span>{doc.title}</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
                {doc.title}
              </h2>
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

            <Link
              to={`/documents/${documentId}/diff`}
              className="btn-secondary btn-sm"
            >
              <GitCompare className="w-4 h-4 mr-2" />
              Compare
            </Link>

            <button
              onClick={() => setShareModalOpen(true)}
              className="btn-secondary btn-sm"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </button>

            <button
              onClick={() => setAmendmentModalOpen(true)}
              className="btn-primary btn-sm"
            >
              <Edit className="w-4 h-4 mr-2" />
              Propose Amendment
            </button>
          </div>
        </div>

        {/* Section tree */}
        <div className="card">
          <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
            <h3 className="font-semibold text-secondary-900 dark:text-white">
              Document Content
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVersionModalOpen(true)}
                className="btn-ghost btn-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Version
              </button>
              <button
                onClick={handleAddSection}
                className="btn-primary btn-sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Section
              </button>
            </div>
          </div>

          <div className="p-4">
            {!selectedVersion ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Create a version to start adding content.
                </p>
                <button onClick={() => setVersionModalOpen(true)} className="btn-primary btn-sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Create First Version
                </button>
              </div>
            ) : sectionTree.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  This document has no sections yet.
                </p>
                <button onClick={handleAddSection} className="btn-primary btn-sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add First Section
                </button>
              </div>
            ) : (
              <SectionTree
                sections={sectionTree}
                selectedSectionId={selectedSection?.id}
                onSelectSection={setSelectedSection}
                onEditSection={handleEditSection}
                onDeleteSection={handleDeleteSection}
                onAddChild={handleAddChild}
                onReorder={handleReorderSections}
                editable
              />
            )}
          </div>
        </div>

        {/* Version info */}
        {selectedVersion && (
          <div className="mt-4 card p-4">
            <div className="flex items-center gap-4 text-sm text-secondary-600 dark:text-secondary-400">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Created: {new Date(selectedVersion.created_at).toLocaleString()}
              </div>
              {selectedVersion.effective_date && (
                <div>
                  Effective: {new Date(selectedVersion.effective_date).toLocaleDateString()}
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

      {/* Right panel - Amendments */}
      <div className="w-80 flex-shrink-0">
        <div className="card sticky top-6">
          <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700">
            <h3 className="font-semibold text-secondary-900 dark:text-white text-sm">
              Pending Amendments
            </h3>
          </div>

          {amendments.length === 0 ? (
            <div className="p-4 text-center text-sm text-secondary-500">
              No pending amendments
            </div>
          ) : (
            <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
              {amendments.map((amendment) => (
                <Link
                  key={amendment.id}
                  to={`/amendments/${amendment.id}`}
                  className="block px-4 py-3 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-secondary-900 dark:text-white truncate">
                      {amendment.title}
                    </span>
                    <StatusBadge status={amendment.status} />
                  </div>
                  {amendment.description && (
                    <p className="text-xs text-secondary-500 line-clamp-2">
                      {amendment.description}
                    </p>
                  )}
                  <p className="text-xs text-secondary-400 mt-1">
                    {amendment.changes?.length || 0} change(s)
                  </p>
                </Link>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-t border-secondary-200 dark:border-secondary-700">
            <Link
              to={`/documents/${documentId}/amendments`}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              View all amendments
            </Link>
          </div>
        </div>
      </div>

      {/* Section Editor Modal */}
      <SectionEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveSection}
        section={editingSection || undefined}
        parentLabel={parentSection?.number_label || parentSection?.title || undefined}
        mode={editorMode}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Section"
        message={`Are you sure you want to delete "${deletingSection?.number_label || deletingSection?.title || 'this section'}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />

      {/* Create Version Modal */}
      <Modal
        isOpen={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
        title="Create New Version"
      >
        <form onSubmit={handleCreateVersion}>
          <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-4">
            Create a new version to make changes to the document. The current version will be preserved.
          </p>
          <div className="mb-4">
            <label htmlFor="versionNotes" className="label">
              Version Notes (optional)
            </label>
            <textarea
              id="versionNotes"
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              className="textarea h-24"
              placeholder="Describe what changes this version includes..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setVersionModalOpen(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={creatingVersion}
            >
              {creatingVersion ? 'Creating...' : 'Create Version'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Amendment Modal */}
      <Modal
        isOpen={amendmentModalOpen}
        onClose={() => setAmendmentModalOpen(false)}
        title="Propose Amendment"
      >
        <form onSubmit={handleCreateAmendment}>
          <div className="mb-4">
            <label htmlFor="amendmentTitle" className="label">
              Amendment Title
            </label>
            <input
              type="text"
              id="amendmentTitle"
              value={amendmentTitle}
              onChange={(e) => setAmendmentTitle(e.target.value)}
              className="input"
              placeholder="e.g., Update membership dues"
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label htmlFor="amendmentDescription" className="label">
              Description / Rationale
            </label>
            <textarea
              id="amendmentDescription"
              value={amendmentDescription}
              onChange={(e) => setAmendmentDescription(e.target.value)}
              className="textarea h-24"
              placeholder="Explain the purpose and rationale for this amendment..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setAmendmentModalOpen(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!amendmentTitle.trim() || creatingAmendment}
            >
              {creatingAmendment ? 'Creating...' : 'Create Amendment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Share Modal */}
      {doc && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
        />
      )}
    </div>
  )
}
