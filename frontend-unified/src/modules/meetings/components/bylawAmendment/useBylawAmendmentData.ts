import { useState, useEffect } from 'react';
import {
  bylawSync,
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

interface BylawAmendmentData {
  linkedOrg: MeetingOrganizationResponse | null;
  documents: Document[];
  flatSections: FlatSection[];
  loading: boolean;
  loadingSections: boolean;
  error: string | null;
  selectedDocumentId: string;
  setSelectedDocumentId: (id: string) => void;
}

export function useBylawAmendmentData(meetingCode: string): BylawAmendmentData {
  const { showToast } = useToast();
  const [linkedOrg, setLinkedOrg] = useState<MeetingOrganizationResponse | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [flatSections, setFlatSections] = useState<FlatSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');

  // Fetch linked organization
  useEffect(() => {
    async function fetchLinkedOrg() {
      try {
        const data = await bylawSync.getMeetingOrganization(meetingCode);
        setLinkedOrg(data);
      } catch (err) {
        console.error('Error fetching linked organization:', err);
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
      } catch (err) {
        console.error('Error fetching documents:', err);
        showToast('error', 'Failed to load documents');
      }
    }
    fetchDocuments();
  }, [linkedOrg, showToast]);

  // Fetch sections when document is selected
  useEffect(() => {
    if (!selectedDocumentId) {
      setFlatSections([]);
      return;
    }

    async function fetchSections() {
      setLoadingSections(true);
      try {
        const data = await bylawSync.getDocumentSections(selectedDocumentId);
        setFlatSections(flattenSections(data));
      } catch (err) {
        console.error('Error fetching sections:', err);
        showToast('error', 'Failed to load document sections');
      } finally {
        setLoadingSections(false);
      }
    }
    fetchSections();
  }, [selectedDocumentId, showToast]);

  return {
    linkedOrg,
    documents,
    flatSections,
    loading,
    loadingSections,
    error,
    selectedDocumentId,
    setSelectedDocumentId,
  };
}
