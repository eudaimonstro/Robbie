import { useState, useEffect } from 'react';
import {
  amendments,
  bylawSync,
  type Amendment,
  type Document,
  type SectionTree,
  type MeetingOrganizationResponse,
} from '../../../../api/client';
import { useToast } from '../../../../context/ToastContext';

export interface FlatSection extends SectionTree {
  depth: number;
}

// Flatten sections tree for dropdown
function flattenSections(sectionList: SectionTree[], depth = 0): FlatSection[] {
  const result: FlatSection[] = [];
  for (const section of sectionList) {
    result.push({ ...section, depth });
    if (section.children && section.children.length > 0) {
      result.push(...flattenSections(section.children, depth + 1));
    }
  }
  return result;
}

const NO_AMENDMENTS: Amendment[] = [];
const NO_SECTIONS: FlatSection[] = [];

interface BylawAmendmentData {
  linkedOrg: MeetingOrganizationResponse | null;
  documents: Document[];
  flatSections: FlatSection[];
  loading: boolean;
  loadingSections: boolean;
  error: string | null;
  selectedDocumentId: string;
  setSelectedDocumentId: (id: string) => void;
  /** The selected document's proposed amendments, which a member can move as they are */
  proposed: Amendment[];
  /** Whether the proposed amendments are still loading */
  loadingProposed: boolean;
}

export function useBylawAmendmentData(meetingCode: string): BylawAmendmentData {
  const { showToast } = useToast();
  const [linkedOrg, setLinkedOrg] = useState<MeetingOrganizationResponse | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  // The sections of one document: another document's never show while its own load
  const [loadedSections, setLoadedSections] = useState<{
    documentId: string;
    list: FlatSection[];
  }>({ documentId: '', list: NO_SECTIONS });
  const [error, setError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [loadedProposed, setLoadedProposed] = useState<{
    documentId: string;
    list: Amendment[];
  }>({ documentId: '', list: NO_AMENDMENTS });

  // Fetch linked organization
  useEffect(() => {
    async function fetchLinkedOrg() {
      try {
        const data = await bylawSync.getMeetingOrganization(meetingCode);
        setLinkedOrg(data);
      } catch {
        setError('Could not connect to server');
        showToast('error', 'Could not connect to server');
      } finally {
        setLoading(false);
      }
    }
    fetchLinkedOrg();
  }, [meetingCode, showToast]);

  // Fetch documents when org is linked
  useEffect(() => {
    if (!linkedOrg?.linked || !linkedOrg.organization) return;

    async function fetchDocuments() {
      try {
        const data = await bylawSync.getOrganizationDocuments(linkedOrg!.organization!.id);
        setDocuments(data);
        if (data.length > 0) {
          setSelectedDocumentId(data[0].id);
        }
      } catch {
        showToast('error', 'Failed to load documents');
      }
    }
    fetchDocuments();
  }, [linkedOrg, showToast]);

  // The selected document's sections
  useEffect(() => {
    if (!selectedDocumentId) return;
    let current = true;
    bylawSync
      .getDocumentSections(selectedDocumentId)
      .then(flattenSections, () => {
        if (current) showToast('error', 'Failed to load document sections');
        return NO_SECTIONS;
      })
      .then((list) => {
        if (current) setLoadedSections({ documentId: selectedDocumentId, list });
      });
    return () => {
      current = false;
    };
  }, [selectedDocumentId, showToast]);
  const flatSections =
    loadedSections.documentId === selectedDocumentId ? loadedSections.list : NO_SECTIONS;
  const loadingSections = !!selectedDocumentId && loadedSections.documentId !== selectedDocumentId;

  // The document's proposed amendments, drafted and proposed ahead of the meeting: kept with
  // the document they are for, so another document's never show while its own load
  useEffect(() => {
    if (!selectedDocumentId) return;
    let current = true;
    amendments
      .list(selectedDocumentId)
      // None to move when they can't be loaded: the member can still write the change
      .catch(() => [])
      .then((list) => {
        if (!current) return;
        setLoadedProposed({
          documentId: selectedDocumentId,
          list: list.filter((a) => a.status === 'proposed'),
        });
      });
    return () => {
      current = false;
    };
  }, [selectedDocumentId]);
  const proposed =
    loadedProposed.documentId === selectedDocumentId ? loadedProposed.list : NO_AMENDMENTS;
  const loadingProposed = !!selectedDocumentId && loadedProposed.documentId !== selectedDocumentId;

  return {
    linkedOrg,
    documents,
    flatSections,
    loading,
    loadingSections,
    error,
    selectedDocumentId,
    setSelectedDocumentId,
    proposed,
    loadingProposed,
  };
}
