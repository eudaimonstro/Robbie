import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronRight, Plus, Edit2, Trash2, Clock, FileText,
  Send, XCircle, CheckCircle, AlertTriangle, RotateCcw
} from 'lucide-react'
import {
  amendments as amendmentsApi,
  documents as documentsApi,
  versions as versionsApi,
  Amendment,
  AmendmentChange,
  AmendmentChangeCreate,
  Document,
  SectionTree,
} from '../../../api/client'
import { useOrganization } from '../../../context/OrganizationContext'
import { LoadingPage } from '../../../components/ui/LoadingSpinner'
import { StatusBadge } from '../../../components/ui/Badge'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { useToast } from '../../../context/ToastContext'

export default function AmendmentDetailPage() {
  const { amendmentId } = useParams<{ amendmentId: string }>()
  const { currentOrganization } = useOrganization()
  const { showToast } = useToast()

  const [amendment, setAmendment] = useState<Amendment | null>(null)
  const [document, setDocument] = useState<Document | null>(null)
  const [sectionTree, setSectionTree] = useState<SectionTree[]>([])
  const [loading, setLoading] = useState(true)

  // Edit amendment modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Add change modal
  const [changeModalOpen, setChangeModalOpen] = useState(false)
  const [changeType, setChangeType] = useState<AmendmentChangeCreate['change_type']>('modify')
  const [targetSectionId, setTargetSectionId] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newNumberLabel, setNewNumberLabel] = useState('')
  const [addingChange, setAddingChange] = useState(false)

  // Delete change dialog
  const [deleteChangeDialogOpen, setDeleteChangeDialogOpen] = useState(false)
  const [deletingChange, setDeletingChange] = useState<AmendmentChange | null>(null)
  const [deletingChangeLoading, setDeletingChangeLoading] = useState(false)

  // Status action dialogs
  const [proposeDialogOpen, setProposeDialogOpen] = useState(false)
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false)
  const [passDialogOpen, setPassDialogOpen] = useState(false)
  const [failDialogOpen, setFailDialogOpen] = useState(false)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchAmendment = useCallback(async () => {
    if (!amendmentId) return

    try {
      setLoading(true)
      const amend = await amendmentsApi.get(amendmentId)
      setAmendment(amend)

      const doc = await documentsApi.get(amend.document_id)
      setDocument(doc)

      // Get section tree for the current version
      if (doc.current_version_id) {
        const tree = await versionsApi.getTree(doc.current_version_id)
        setSectionTree(tree)
      }
    } catch (err) {
      showToast('error', 'Failed to load amendment')
    } finally {
      setLoading(false)
    }
  }, [amendmentId, showToast])

  useEffect(() => {
    fetchAmendment()
  }, [fetchAmendment])

  const handleEditAmendment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amendment) return

    try {
      setSaving(true)
      await amendmentsApi.update(amendment.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      })
      await fetchAmendment()
      setEditModalOpen(false)
      showToast('success', 'Amendment updated')
    } catch (err) {
      showToast('error', 'Failed to update amendment')
    } finally {
      setSaving(false)
    }
  }

  const handleAddChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amendment) return

    try {
      setAddingChange(true)
      const data: AmendmentChangeCreate = {
        change_type: changeType,
        target_section_id: targetSectionId || undefined,
        new_content: newContent.trim() || undefined,
        new_title: newTitle.trim() || undefined,
        new_number_label: newNumberLabel.trim() || undefined,
      }
      await amendmentsApi.addChange(amendment.id, data)
      await fetchAmendment()
      setChangeModalOpen(false)
      resetChangeForm()
      showToast('success', 'Change added')
    } catch (err) {
      showToast('error', 'Failed to add change')
    } finally {
      setAddingChange(false)
    }
  }

  const resetChangeForm = () => {
    setChangeType('modify')
    setTargetSectionId('')
    setNewContent('')
    setNewTitle('')
    setNewNumberLabel('')
  }

  const handleDeleteChange = async () => {
    if (!deletingChange) return

    try {
      setDeletingChangeLoading(true)
      await amendmentsApi.deleteChange(deletingChange.id)
      await fetchAmendment()
      setDeleteChangeDialogOpen(false)
      setDeletingChange(null)
      showToast('success', 'Change deleted')
    } catch (err) {
      showToast('error', 'Failed to delete change')
    } finally {
      setDeletingChangeLoading(false)
    }
  }

  const handlePropose = async () => {
    if (!amendment) return
    try {
      setActionLoading(true)
      await amendmentsApi.propose(amendment.id)
      await fetchAmendment()
      setProposeDialogOpen(false)
      showToast('success', 'Amendment proposed')
    } catch (err) {
      showToast('error', 'Failed to propose amendment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleWithdraw = async () => {
    if (!amendment) return
    try {
      setActionLoading(true)
      await amendmentsApi.withdraw(amendment.id)
      await fetchAmendment()
      setWithdrawDialogOpen(false)
      showToast('success', 'Amendment withdrawn')
    } catch (err) {
      showToast('error', 'Failed to withdraw amendment')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePass = async () => {
    if (!amendment) return
    try {
      setActionLoading(true)
      await amendmentsApi.pass(amendment.id)
      await fetchAmendment()
      setPassDialogOpen(false)
      showToast('success', 'Amendment marked as passed')
    } catch (err) {
      showToast('error', 'Failed to pass amendment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleFail = async () => {
    if (!amendment) return
    try {
      setActionLoading(true)
      await amendmentsApi.fail(amendment.id)
      await fetchAmendment()
      setFailDialogOpen(false)
      showToast('success', 'Amendment marked as failed')
    } catch (err) {
      showToast('error', 'Failed to mark amendment as failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApply = async () => {
    if (!amendment) return
    try {
      setActionLoading(true)
      const result = await amendmentsApi.apply(amendment.id)
      await fetchAmendment()
      setApplyDialogOpen(false)
      showToast('success', `Amendment applied. Created version ${result.version.version_number}`)
    } catch (err) {
      showToast('error', 'Failed to apply amendment')
    } finally {
      setActionLoading(false)
    }
  }

  const openEditModal = () => {
    if (amendment) {
      setEditTitle(amendment.title)
      setEditDescription(amendment.description || '')
      setEditModalOpen(true)
    }
  }

  const flattenSections = (sections: SectionTree[], depth = 0): { id: string; label: string }[] => {
    const result: { id: string; label: string }[] = []
    for (const section of sections) {
      const label = `${'  '.repeat(depth)}${section.number_label || ''} ${section.title || ''}`.trim()
      result.push({ id: section.id, label })
      if (section.children?.length) {
        result.push(...flattenSections(section.children, depth + 1))
      }
    }
    return result
  }

  const getSectionLabel = (sectionId: string): string => {
    const flat = flattenSections(sectionTree)
    const section = flat.find(s => s.id === sectionId)
    return section?.label || 'Unknown section'
  }

  const changeTypeLabels: Record<string, string> = {
    add: 'Add Section',
    modify: 'Modify Section',
    delete: 'Delete Section',
    renumber: 'Renumber Section',
  }

  if (loading) {
    return <LoadingPage />
  }

  if (!amendment || !document) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
          Amendment not found
        </h2>
        <Link to="/amendments" className="text-primary-600 hover:text-primary-700">
          Return to amendments
        </Link>
      </div>
    )
  }

  const isDraft = amendment.status === 'draft'
  const isProposed = amendment.status === 'proposed'
  const isPassed = amendment.status === 'passed'
  const canEdit = isDraft
  const canPropose = isDraft && amendment.changes?.length > 0
  const canWithdraw = isDraft || isProposed
  const canVote = isProposed
  const canApply = isPassed && !amendment.resulting_version_id

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
          <Link to="/" className="hover:text-primary-600">
            {currentOrganization?.name}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link to={`/documents/${document.id}`} className="hover:text-primary-600">
            {document.title}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span>Amendment</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
              {amendment.title}
            </h2>
            <StatusBadge status={amendment.status} />
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button onClick={openEditModal} className="btn-ghost btn-sm">
                <Edit2 className="w-4 h-4 mr-1" />
                Edit
              </button>
            )}
            {canWithdraw && (
              <button onClick={() => setWithdrawDialogOpen(true)} className="btn-ghost btn-sm text-secondary-600">
                <XCircle className="w-4 h-4 mr-1" />
                Withdraw
              </button>
            )}
            {canPropose && (
              <button onClick={() => setProposeDialogOpen(true)} className="btn-primary btn-sm">
                <Send className="w-4 h-4 mr-1" />
                Propose
              </button>
            )}
            {canVote && (
              <>
                <button onClick={() => setFailDialogOpen(true)} className="btn-danger btn-sm">
                  <XCircle className="w-4 h-4 mr-1" />
                  Mark Failed
                </button>
                <button onClick={() => setPassDialogOpen(true)} className="btn-success btn-sm">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Mark Passed
                </button>
              </>
            )}
            {canApply && (
              <button onClick={() => setApplyDialogOpen(true)} className="btn-primary btn-sm">
                <RotateCcw className="w-4 h-4 mr-1" />
                Apply to Document
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {amendment.description && (
        <div className="card p-4 mb-6">
          <h3 className="font-medium text-secondary-900 dark:text-white mb-2">
            Description / Rationale
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400">
            {amendment.description}
          </p>
        </div>
      )}

      {/* Timeline info */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1 text-secondary-600">
            <Clock className="w-4 h-4" />
            Created: {new Date(amendment.created_at).toLocaleString()}
          </div>
          {amendment.proposed_at && (
            <div className="text-secondary-600">
              Proposed: {new Date(amendment.proposed_at).toLocaleString()}
            </div>
          )}
          {amendment.decided_at && (
            <div className="text-secondary-600">
              Decided: {new Date(amendment.decided_at).toLocaleString()}
            </div>
          )}
          {amendment.resulting_version_id && (
            <div className="text-success-600">
              Applied to new version
            </div>
          )}
        </div>
      </div>

      {/* Changes */}
      <div className="card">
        <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
          <h3 className="font-semibold text-secondary-900 dark:text-white">
            Proposed Changes ({amendment.changes?.length || 0})
          </h3>
          {canEdit && (
            <button
              onClick={() => setChangeModalOpen(true)}
              className="btn-primary btn-sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Change
            </button>
          )}
        </div>

        {!amendment.changes?.length ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-accent-500 mx-auto mb-3" />
            <p className="text-secondary-600 dark:text-secondary-400 mb-4">
              No changes defined yet. Add changes to specify what this amendment will modify.
            </p>
            {canEdit && (
              <button onClick={() => setChangeModalOpen(true)} className="btn-primary btn-sm">
                <Plus className="w-4 h-4 mr-1" />
                Add First Change
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
            {amendment.changes.map((change, index) => (
              <div key={change.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-secondary-500">
                        Change {index + 1}:
                      </span>
                      <span className={`badge ${
                        change.change_type === 'add' ? 'badge-passed' :
                        change.change_type === 'delete' ? 'badge-failed' :
                        'badge-proposed'
                      }`}>
                        {changeTypeLabels[change.change_type]}
                      </span>
                    </div>

                    {change.target_section_id && (
                      <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-2">
                        Target: {getSectionLabel(change.target_section_id)}
                      </p>
                    )}

                    {(change.new_number_label || change.new_title) && (
                      <p className="text-sm mb-2">
                        {change.new_number_label && (
                          <span className="font-medium text-primary-600">{change.new_number_label}</span>
                        )}
                        {change.new_title && (
                          <span className="ml-2">{change.new_title}</span>
                        )}
                      </p>
                    )}

                    {change.new_content && (
                      <div className="bg-secondary-50 dark:bg-secondary-800/50 p-3 rounded text-sm text-secondary-700 dark:text-secondary-300">
                        {change.new_content}
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => {
                        setDeletingChange(change)
                        setDeleteChangeDialogOpen(true)
                      }}
                      className="p-1 text-secondary-400 hover:text-danger-600 rounded"
                      title="Delete change"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Amendment Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Amendment">
        <form onSubmit={handleEditAmendment}>
          <div className="mb-4">
            <label htmlFor="editTitle" className="label">Title</label>
            <input
              type="text"
              id="editTitle"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="editDescription" className="label">Description</label>
            <textarea
              id="editDescription"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="textarea h-24"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditModalOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!editTitle.trim() || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Change Modal */}
      <Modal isOpen={changeModalOpen} onClose={() => { setChangeModalOpen(false); resetChangeForm(); }} title="Add Change" size="lg">
        <form onSubmit={handleAddChange}>
          <div className="mb-4">
            <label className="label">Change Type</label>
            <select
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as AmendmentChangeCreate['change_type'])}
              className="select"
            >
              <option value="add">Add new section</option>
              <option value="modify">Modify existing section</option>
              <option value="delete">Delete section</option>
              <option value="renumber">Renumber section</option>
            </select>
          </div>

          {(changeType === 'modify' || changeType === 'delete' || changeType === 'renumber') && (
            <div className="mb-4">
              <label className="label">Target Section</label>
              <select
                value={targetSectionId}
                onChange={(e) => setTargetSectionId(e.target.value)}
                className="select"
                required
              >
                <option value="">Select a section...</option>
                {flattenSections(sectionTree).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          {changeType !== 'delete' && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Section Number</label>
                  <input
                    type="text"
                    value={newNumberLabel}
                    onChange={(e) => setNewNumberLabel(e.target.value)}
                    className="input"
                    placeholder="e.g., Section 1.3"
                  />
                </div>
                <div>
                  <label className="label">Section Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="input"
                    placeholder="e.g., New Membership Dues"
                  />
                </div>
              </div>

              {changeType !== 'renumber' && (
                <div className="mb-6">
                  <label className="label">Content</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="textarea h-32"
                    placeholder="Enter the new section content..."
                  />
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setChangeModalOpen(false); resetChangeForm(); }} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={addingChange}>
              {addingChange ? 'Adding...' : 'Add Change'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Change Dialog */}
      <ConfirmDialog
        isOpen={deleteChangeDialogOpen}
        onClose={() => setDeleteChangeDialogOpen(false)}
        onConfirm={handleDeleteChange}
        title="Delete Change"
        message="Are you sure you want to delete this change from the amendment?"
        confirmText="Delete"
        variant="danger"
        loading={deletingChangeLoading}
      />

      {/* Propose Dialog */}
      <ConfirmDialog
        isOpen={proposeDialogOpen}
        onClose={() => setProposeDialogOpen(false)}
        onConfirm={handlePropose}
        title="Propose Amendment"
        message="Are you sure you want to propose this amendment? Once proposed, it can be voted on but the changes cannot be modified."
        confirmText="Propose"
        loading={actionLoading}
      />

      {/* Withdraw Dialog */}
      <ConfirmDialog
        isOpen={withdrawDialogOpen}
        onClose={() => setWithdrawDialogOpen(false)}
        onConfirm={handleWithdraw}
        title="Withdraw Amendment"
        message="Are you sure you want to withdraw this amendment? This action cannot be undone."
        confirmText="Withdraw"
        variant="danger"
        loading={actionLoading}
      />

      {/* Pass Dialog */}
      <ConfirmDialog
        isOpen={passDialogOpen}
        onClose={() => setPassDialogOpen(false)}
        onConfirm={handlePass}
        title="Mark Amendment as Passed"
        message="Are you sure this amendment has passed the required vote? This will allow it to be applied to the document."
        confirmText="Mark as Passed"
        loading={actionLoading}
      />

      {/* Fail Dialog */}
      <ConfirmDialog
        isOpen={failDialogOpen}
        onClose={() => setFailDialogOpen(false)}
        onConfirm={handleFail}
        title="Mark Amendment as Failed"
        message="Are you sure this amendment has failed the vote? This action cannot be undone."
        confirmText="Mark as Failed"
        variant="danger"
        loading={actionLoading}
      />

      {/* Apply Dialog */}
      <ConfirmDialog
        isOpen={applyDialogOpen}
        onClose={() => setApplyDialogOpen(false)}
        onConfirm={handleApply}
        title="Apply Amendment to Document"
        message="This will create a new version of the document with all the changes from this amendment applied. Continue?"
        confirmText="Apply Amendment"
        loading={actionLoading}
      />
    </div>
  )
}
