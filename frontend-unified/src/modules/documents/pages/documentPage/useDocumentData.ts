import { useEffect, useState, useCallback } from 'react'
import {
  documents as documentsApi,
  versions as versionsApi,
  sections as sectionsApi,
  amendments as amendmentsApi,
  Document,
  Version,
  SectionTree,
  Amendment,
  SectionCreate,
  SectionUpdate,
} from '../../../../api/client'
import { useToast } from '../../../../context/ToastContext'

interface UseDocumentDataReturn {
  doc: Document | null
  versions: Version[]
  selectedVersion: Version | null
  sectionTree: SectionTree[]
  amendments: Amendment[]
  loading: boolean
  setSelectedVersion: (version: Version | null) => void
  handleVersionChange: (versionId: string) => Promise<void>
  handleSaveSection: (data: SectionCreate | SectionUpdate, mode: 'create' | 'edit' | 'addChild', editingSection: SectionTree | null, parentSection: SectionTree | null) => Promise<void>
  handleDeleteSection: (sectionId: string) => Promise<void>
  handleReorderSections: (updates: Array<{ id: string; position: number }>) => Promise<void>
  handleCreateVersion: (notes?: string) => Promise<Version | null>
  handleCreateAmendment: (title: string, description?: string) => Promise<Amendment | null>
  refreshTree: () => Promise<void>
}

export function useDocumentData(documentId: string | undefined): UseDocumentDataReturn {
  const { showToast } = useToast()

  const [doc, setDoc] = useState<Document | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [sectionTree, setSectionTree] = useState<SectionTree[]>([])
  const [amendments, setAmendments] = useState<Amendment[]>([])
  const [loading, setLoading] = useState(true)

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

  const handleVersionChange = useCallback(async (versionId: string) => {
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
  }, [versions, showToast])

  const refreshTree = useCallback(async () => {
    if (selectedVersion) {
      const tree = await versionsApi.getTree(selectedVersion.id, true)
      setSectionTree(tree)
    }
  }, [selectedVersion])

  const handleSaveSection = useCallback(async (
    data: SectionCreate | SectionUpdate,
    mode: 'create' | 'edit' | 'addChild',
    editingSection: SectionTree | null,
    parentSection: SectionTree | null
  ) => {
    if (!selectedVersion) return

    if (mode === 'edit' && editingSection) {
      await sectionsApi.update(editingSection.id, data as SectionUpdate)
      showToast('success', 'Section updated')
    } else if (mode === 'addChild' && parentSection) {
      await sectionsApi.addChild(parentSection.id, data as SectionCreate)
      showToast('success', 'Child section added')
    } else {
      await sectionsApi.create(selectedVersion.id, data as SectionCreate)
      showToast('success', 'Section added')
    }

    await refreshTree()
  }, [selectedVersion, showToast, refreshTree])

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    await sectionsApi.delete(sectionId)
    showToast('success', 'Section deleted')
    await refreshTree()
  }, [showToast, refreshTree])

  const handleReorderSections = useCallback(async (updates: Array<{ id: string; position: number }>) => {
    if (!selectedVersion) return

    try {
      await sectionsApi.reorder(selectedVersion.id, updates)
      await refreshTree()
      showToast('success', 'Section order updated')
    } catch (err) {
      showToast('error', 'Failed to reorder sections')
      await refreshTree()
    }
  }, [selectedVersion, showToast, refreshTree])

  const handleCreateVersion = useCallback(async (notes?: string): Promise<Version | null> => {
    if (!documentId) return null

    const newVersion = await versionsApi.create(documentId, {
      notes: notes?.trim() || undefined,
    })
    await fetchDocument()
    setSelectedVersion(newVersion)
    const tree = await versionsApi.getTree(newVersion.id)
    setSectionTree(tree)
    showToast('success', `Version ${newVersion.version_number} created`)
    return newVersion
  }, [documentId, showToast, fetchDocument])

  const handleCreateAmendment = useCallback(async (title: string, description?: string): Promise<Amendment | null> => {
    if (!documentId || !title.trim()) return null

    const amendment = await amendmentsApi.create(documentId, {
      title: title.trim(),
      description: description?.trim() || undefined,
    })
    showToast('success', 'Amendment created')
    return amendment
  }, [documentId, showToast])

  return {
    doc,
    versions,
    selectedVersion,
    sectionTree,
    amendments,
    loading,
    setSelectedVersion,
    handleVersionChange,
    handleSaveSection,
    handleDeleteSection,
    handleReorderSections,
    handleCreateVersion,
    handleCreateAmendment,
    refreshTree,
  }
}
