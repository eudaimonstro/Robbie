import { useEffect, useState, useCallback } from 'react';
import {
  meetings as meetingsApi,
  votes as votesApi,
  documents as documentsApi,
  amendments as amendmentsApi,
  Meeting,
  MeetingUpdate,
  Vote,
  VoteCreate,
  Document,
  Amendment,
} from '../../../../api/client';
import { useToast } from '../../../../context/ToastContext';

interface UseMeetingDataReturn {
  meeting: Meeting | null;
  votes: Vote[];
  documents: Document[];
  proposedAmendments: Amendment[];
  allAmendments: Amendment[];
  loading: boolean;
  error: string | null;
  updateMeeting: (data: MeetingUpdate) => Promise<void>;
  changeStatus: (status: Meeting['status']) => Promise<void>;
  recordVote: (data: VoteCreate) => Promise<{ passed: boolean }>;
  getAmendmentTitle: (amendmentId: string) => string;
  getDocumentTitle: (amendmentId: string) => string;
}

export function useMeetingData(
  meetingId: string | undefined,
  organizationId: string | undefined,
): UseMeetingDataReturn {
  const { showToast } = useToast();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [proposedAmendments, setProposedAmendments] = useState<Amendment[]>([]);
  const [allAmendments, setAllAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Loading (which shows a full-page spinner) is for the first load of each meeting; a refresh
  // after an action (recording a vote, say) updates the page in place
  const loadKey = `${meetingId}:${organizationId}`;
  const [loadedFor, setLoadedFor] = useState(loadKey);
  if (loadKey !== loadedFor) {
    setLoadedFor(loadKey);
    setLoading(true);
  }

  const fetchMeeting = useCallback(async () => {
    if (!meetingId || !organizationId) return;

    try {
      setError(null);
      const [mtg, vts, docs] = await Promise.all([
        meetingsApi.get(meetingId),
        votesApi.list(meetingId),
        documentsApi.list(organizationId),
      ]);

      setMeeting(mtg);
      setVotes(vts);
      setDocuments(docs);

      // Fetch all amendments from all documents
      const all: Amendment[] = [];
      const proposed: Amendment[] = [];
      for (const doc of docs) {
        try {
          const amends = await amendmentsApi.list(doc.id);
          all.push(...amends);
          proposed.push(...amends.filter((a) => a.status === 'proposed'));
        } catch {
          // Ignore
        }
      }
      setAllAmendments(all);
      setProposedAmendments(proposed);
    } catch {
      setError('Failed to load meeting');
      showToast('error', 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [meetingId, organizationId, showToast]);

  useEffect(() => {
    fetchMeeting();
  }, [fetchMeeting]);

  const updateMeeting = useCallback(
    async (data: MeetingUpdate) => {
      if (!meeting) return;
      await meetingsApi.update(meeting.id, data);
      await fetchMeeting();
      showToast('success', 'Meeting updated');
    },
    [meeting, fetchMeeting, showToast],
  );

  const changeStatus = useCallback(
    async (status: Meeting['status']) => {
      if (!meeting) return;
      await meetingsApi.update(meeting.id, { status });
      await fetchMeeting();
      showToast('success', `Meeting ${status === 'in_progress' ? 'started' : status}`);
    },
    [meeting, fetchMeeting, showToast],
  );

  const recordVote = useCallback(
    async (data: VoteCreate): Promise<{ passed: boolean }> => {
      if (!meeting) throw new Error('No meeting');
      const result = await votesApi.create(meeting.id, data);
      await fetchMeeting();
      return { passed: result.result === 'passed' };
    },
    [meeting, fetchMeeting],
  );

  const getAmendmentTitle = useCallback(
    (amendmentId: string): string => {
      const amendment = allAmendments.find((a) => a.id === amendmentId);
      return amendment?.title || 'Unknown Amendment';
    },
    [allAmendments],
  );

  const getDocumentTitle = useCallback(
    (amendmentId: string): string => {
      const amendment = allAmendments.find((a) => a.id === amendmentId);
      if (amendment) {
        const doc = documents.find((d) => d.id === amendment.documentId);
        return doc?.title || 'Unknown Document';
      }
      return 'Unknown Document';
    },
    [allAmendments, documents],
  );

  return {
    meeting,
    votes,
    documents,
    proposedAmendments,
    allAmendments,
    loading,
    error,
    updateMeeting,
    changeStatus,
    recordVote,
    getAmendmentTitle,
    getDocumentTitle,
  };
}
