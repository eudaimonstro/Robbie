import { useEffect, useState, useCallback } from 'react'
import {
  amendments as amendmentsApi,
  documents as documentsApi,
  versions as versionsApi,
  Amendment,
  AmendmentChangeCreate,
  Document,
  SectionTree,
} from '../../../../api/client'
import { useToast } from '../../../../context/ToastContext'

interface UseAmendmentDataReturn {
  amendment: Amendment | null
  document: Document | null
  sectionTree: SectionTree[]
  loading: boolean
  fetchAmendment: () => Promise<void>
  updateAmendment: (title: string, description?: string) => Promise<void>
  addChange: (data: AmendmentChangeCreate) => Promise<void>
  deleteChange: (changeId: string) => Promise<void>
  propose: () => Promise<void>
  withdraw: () => Promise<void>
  pass: () => Promise<void>
  fail: () => Promise<void>
  apply: () => Promise<{ versionNumber: number } | null>
}

export function useAmendmentData(amendmentId: string | undefined): UseAmendmentDataReturn {
  const { showToast } = useToast()

  const [amendment, setAmendment] = useState<Amendment | null>(null)
  const [document, setDocument] = useState<Document | null>(null)
  const [sectionTree, setSectionTree] = useState<SectionTree[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAmendment = useCallback(async () => {
    if (!amendmentId) return

    try {
      setLoading(true)
      const amend = await amendmentsApi.get(amendmentId)
      setAmendment(amend)

      const doc = await documentsApi.get(amend.document_id)
      setDocument(doc)

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

  const updateAmendment = useCallback(async (title: string, description?: string) => {
    if (!amendment) return
    await amendmentsApi.update(amendment.id, { title, description })
    await fetchAmendment()
    showToast('success', 'Amendment updated')
  }, [amendment, fetchAmendment, showToast])

  const addChange = useCallback(async (data: AmendmentChangeCreate) => {
    if (!amendment) return
    await amendmentsApi.addChange(amendment.id, data)
    await fetchAmendment()
    showToast('success', 'Change added')
  }, [amendment, fetchAmendment, showToast])

  const deleteChange = useCallback(async (changeId: string) => {
    await amendmentsApi.deleteChange(changeId)
    await fetchAmendment()
    showToast('success', 'Change deleted')
  }, [fetchAmendment, showToast])

  const propose = useCallback(async () => {
    if (!amendment) return
    await amendmentsApi.propose(amendment.id)
    await fetchAmendment()
    showToast('success', 'Amendment proposed')
  }, [amendment, fetchAmendment, showToast])

  const withdraw = useCallback(async () => {
    if (!amendment) return
    await amendmentsApi.withdraw(amendment.id)
    await fetchAmendment()
    showToast('success', 'Amendment withdrawn')
  }, [amendment, fetchAmendment, showToast])

  const pass = useCallback(async () => {
    if (!amendment) return
    await amendmentsApi.pass(amendment.id)
    await fetchAmendment()
    showToast('success', 'Amendment marked as passed')
  }, [amendment, fetchAmendment, showToast])

  const fail = useCallback(async () => {
    if (!amendment) return
    await amendmentsApi.fail(amendment.id)
    await fetchAmendment()
    showToast('success', 'Amendment marked as failed')
  }, [amendment, fetchAmendment, showToast])

  const apply = useCallback(async (): Promise<{ versionNumber: number } | null> => {
    if (!amendment) return null
    const result = await amendmentsApi.apply(amendment.id)
    await fetchAmendment()
    showToast('success', `Amendment applied. Created version ${result.version.version_number}`)
    return { versionNumber: result.version.version_number }
  }, [amendment, fetchAmendment, showToast])

  return {
    amendment,
    document,
    sectionTree,
    loading,
    fetchAmendment,
    updateAmendment,
    addChange,
    deleteChange,
    propose,
    withdraw,
    pass,
    fail,
    apply,
  }
}

export function flattenSections(sections: SectionTree[], depth = 0): { id: string; label: string }[] {
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

export function getSectionLabel(sectionTree: SectionTree[], sectionId: string): string {
  const flat = flattenSections(sectionTree)
  const section = flat.find(s => s.id === sectionId)
  return section?.label || 'Unknown section'
}
