import { useEffect, useState, useCallback, useRef } from 'react';
import {
  amendments as amendmentsApi,
  documents as documentsApi,
  versions as versionsApi,
  Amendment,
  AmendmentChangeCreate,
  Document,
  SectionTree,
} from '../../../../api/client';
import { useToast } from '../../../../context/ToastContext';
import { isNotFound } from '../../../../utils/httpErrors';

interface UseAmendmentDataReturn {
  amendment: Amendment | null;
  document: Document | null;
  sectionTree: SectionTree[];
  loading: boolean;
  /** The first load failed: the amendment isn't there (or isn't the user's), or the load failed */
  loadError: 'missing' | 'failed' | null;
  fetchAmendment: () => Promise<void>;
  updateAmendment: (title: string, description?: string) => Promise<void>;
  addChange: (data: AmendmentChangeCreate) => Promise<void>;
  deleteChange: (changeId: string) => Promise<void>;
  propose: () => Promise<void>;
  withdraw: () => Promise<void>;
  pass: () => Promise<void>;
  fail: () => Promise<void>;
  apply: () => Promise<{ versionNumber: number } | null>;
}

export function useAmendmentData(amendmentId: string | undefined): UseAmendmentDataReturn {
  const { showToast } = useToast();

  const [amendment, setAmendment] = useState<Amendment | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [sectionTree, setSectionTree] = useState<SectionTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);
  // Whether this amendment is on the page: a refresh that fails after an action is a toast, and
  // the page stays; a first load that fails is the page's own message, with Try again
  const shown = useRef(false);

  // Loading (which shows a full-page spinner) is for the first load of each amendment; a
  // refresh after an action updates the page in place
  const [loadedFor, setLoadedFor] = useState(amendmentId);
  if (amendmentId !== loadedFor) {
    setLoadedFor(amendmentId);
    setLoading(true);
    setLoadError(null);
  }

  const fetchAmendment = useCallback(async () => {
    if (!amendmentId) return;

    try {
      setLoadError(null);
      const amend = await amendmentsApi.get(amendmentId);
      setAmendment(amend);

      const doc = await documentsApi.get(amend.documentId);
      setDocument(doc);

      if (doc.currentVersionId) {
        const tree = await versionsApi.getTree(doc.currentVersionId);
        setSectionTree(tree);
      }
      shown.current = true;
    } catch (err) {
      if (shown.current) showToast('error', "Couldn't load the amendment again. Reload the page.");
      else setLoadError(isNotFound(err) ? 'missing' : 'failed');
    } finally {
      setLoading(false);
    }
  }, [amendmentId, showToast]);

  useEffect(() => {
    // Another amendment: not on the page yet
    shown.current = false;
    fetchAmendment();
  }, [fetchAmendment]);

  const updateAmendment = useCallback(
    async (title: string, description?: string) => {
      if (!amendment) return;
      await amendmentsApi.update(amendment.id, { title, description });
      await fetchAmendment();
      showToast('success', 'Amendment updated');
    },
    [amendment, fetchAmendment, showToast],
  );

  const addChange = useCallback(
    async (data: AmendmentChangeCreate) => {
      if (!amendment) return;
      await amendmentsApi.addChange(amendment.id, data);
      await fetchAmendment();
      showToast('success', 'Change added');
    },
    [amendment, fetchAmendment, showToast],
  );

  const deleteChange = useCallback(
    async (changeId: string) => {
      await amendmentsApi.deleteChange(changeId);
      await fetchAmendment();
      showToast('success', 'Change deleted');
    },
    [fetchAmendment, showToast],
  );

  const propose = useCallback(async () => {
    if (!amendment) return;
    await amendmentsApi.propose(amendment.id);
    await fetchAmendment();
    showToast('success', 'Amendment proposed');
  }, [amendment, fetchAmendment, showToast]);

  const withdraw = useCallback(async () => {
    if (!amendment) return;
    await amendmentsApi.withdraw(amendment.id);
    await fetchAmendment();
    showToast('success', 'Amendment withdrawn');
  }, [amendment, fetchAmendment, showToast]);

  const pass = useCallback(async () => {
    if (!amendment) return;
    await amendmentsApi.pass(amendment.id);
    await fetchAmendment();
    showToast('success', 'Amendment marked as passed');
  }, [amendment, fetchAmendment, showToast]);

  const fail = useCallback(async () => {
    if (!amendment) return;
    await amendmentsApi.fail(amendment.id);
    await fetchAmendment();
    showToast('success', 'Amendment marked as failed');
  }, [amendment, fetchAmendment, showToast]);

  const apply = useCallback(async (): Promise<{ versionNumber: number } | null> => {
    if (!amendment) return null;
    const result = await amendmentsApi.apply(amendment.id);
    await fetchAmendment();
    showToast('success', `Amendment applied. Created version ${result.version.versionNumber}`);
    return { versionNumber: result.version.versionNumber };
  }, [amendment, fetchAmendment, showToast]);

  return {
    amendment,
    document,
    sectionTree,
    loading,
    loadError,
    fetchAmendment,
    updateAmendment,
    addChange,
    deleteChange,
    propose,
    withdraw,
    pass,
    fail,
    apply,
  };
}

export function flattenSections(
  sections: SectionTree[],
  depth = 0,
): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];
  for (const section of sections) {
    const label = `${'  '.repeat(depth)}${section.numberLabel || ''} ${section.title || ''}`.trim();
    result.push({ id: section.id, label });
    if (section.children?.length) {
      result.push(...flattenSections(section.children, depth + 1));
    }
  }
  return result;
}

/**
 * The section a change targets: as the current version names it, or else as it was named when
 * the change was made (a change applied, or drafted against an earlier version, targets a section
 * id the current version no longer has)
 */
export function getSectionLabel(
  sectionTree: SectionTree[],
  sectionId: string,
  savedLabel?: string | null,
): string {
  const flat = flattenSections(sectionTree);
  const section = flat.find((s) => s.id === sectionId);
  return section?.label.trim() || savedLabel || 'Unknown section';
}
