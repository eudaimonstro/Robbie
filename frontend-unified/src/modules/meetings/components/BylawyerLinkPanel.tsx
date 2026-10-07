import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Link, Unlink, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import {
  bylawSync,
  type MeetingOrganizationResponse,
  type OrganizationWithRole,
} from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { atLeast } from '../../../utils/roles';

interface BylawyerLinkPanelProps {
  meetingCode: string;
  suggestedOrgId?: string;
}

/**
 * Links this live meeting to one of the user's organizations, so a bylaw amendment passed in it
 * reaches that organization's documents. Linking and unlinking need the secretary role there.
 */
export function BylawyerLinkPanel({ meetingCode, suggestedOrgId }: BylawyerLinkPanelProps) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { setCurrentOrganization } = useMeetingOrganization();
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([]);
  const [linkedOrg, setLinkedOrg] = useState<MeetingOrganizationResponse | null>(null);
  // The user's choice; null until they make one ('' once they choose none)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Only the organizations where the user may link a meeting
  const linkable = organizations.filter((org) => atLeast(org.role, 'secretary'));
  // The organization selected in the header, when the user may link to it
  const suggested = linkable.find((org) => org.id === suggestedOrgId) ?? null;
  const chosenOrgId = selectedOrgId ?? suggested?.id ?? '';

  // An unlinked meeting (404) comes back from the client as not linked
  const fetchLinkedOrg = useCallback(async () => {
    if (!meetingCode) return;
    try {
      setLinkedOrg(await bylawSync.getMeetingOrganization(meetingCode));
    } catch (err) {
      console.error('Error fetching linked organization:', err);
    }
  }, [meetingCode]);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setOrganizations(await bylawSync.getOrganizations());
      setUnavailable(false);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrganizations();
    void fetchLinkedOrg();
  }, [fetchOrganizations, fetchLinkedOrg]);

  const handleLink = async () => {
    if (!chosenOrgId || !meetingCode) return;
    try {
      setLoading(true);
      await bylawSync.linkMeeting(meetingCode, chosenOrgId);
      await fetchLinkedOrg();
      setSelectedOrgId(null);
      showToast('success', 'Meeting linked to the organization');
    } catch (err) {
      // "That meeting code is already in use": the code belongs to another organization
      showToast('error', err instanceof Error ? err.message : 'Failed to link the meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!meetingCode) return;
    try {
      setLoading(true);
      await bylawSync.unlinkMeeting(meetingCode);
      setLinkedOrg({ linked: false, organization: null });
      showToast('success', 'Meeting unlinked from the organization');
    } catch (err) {
      // "Remove the agenda and attachments first" for a scheduled meeting
      showToast('error', err instanceof Error ? err.message : 'Failed to unlink the meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    void fetchOrganizations();
    void fetchLinkedOrg();
  };

  const linked = linkedOrg?.linked ? linkedOrg.organization : null;
  const canUnlink = linked !== null && linkable.some((org) => org.id === linked.id);

  /** Show the linked organization's documents, not the header's */
  const viewDocuments = () => {
    const org = linked && organizations.find((o) => o.id === linked.id);
    if (org) setCurrentOrganization(org);
    navigate('/');
  };

  if (unavailable) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
          <Building2 size={18} />
          Organization
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <AlertCircle className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-gray-500 text-sm">Couldn't load your organizations</p>
          <button
            onClick={handleRefresh}
            className="mt-2 text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1 mx-auto"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-gray-800">
          <Building2 size={18} />
          Organization
        </h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 p-1"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {linked ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link className="text-green-600" size={16} />
              <span className="font-medium text-green-800">Linked to</span>
            </div>
            <p className="text-green-900 font-semibold">{linked.name}</p>
            {linked.description && (
              <p className="text-green-700 text-sm mt-1">{linked.description}</p>
            )}
            <button
              type="button"
              onClick={viewDocuments}
              className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 text-sm mt-2"
            >
              View Documents
              <ExternalLink size={12} />
            </button>
          </div>

          {canUnlink && (
            <button
              onClick={handleUnlink}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <Unlink size={16} />
              Unlink Organization
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-gray-600 text-sm">
            Link this meeting to one of your organizations to amend its bylaws from the meeting.
          </p>

          {linkedOrg?.warning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-700 text-sm">{linkedOrg.warning}</p>
            </div>
          )}

          {linkable.length > 0 ? (
            <>
              <div className="flex gap-2">
                <select
                  aria-label="Organization"
                  value={chosenOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  disabled={loading}
                  className="flex-1 p-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100"
                >
                  <option value="">Select an organization...</option>
                  {linkable.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                      {org.id === suggestedOrgId ? ' (Current)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLink}
                  disabled={loading || !chosenOrgId}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <Link size={16} />
                  Link
                </button>
              </div>
              {suggested && (
                <p className="text-indigo-600 text-xs">
                  Suggested: {suggested.name} (your current organization)
                </p>
              )}
            </>
          ) : (
            !loading && (
              <p className="text-gray-500 text-sm italic">
                You need the secretary role in an organization to link this meeting.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
