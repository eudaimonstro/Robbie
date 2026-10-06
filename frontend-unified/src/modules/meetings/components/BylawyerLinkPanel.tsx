import { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Building2, Link, Unlink, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { bylawSync, type LinkedOrganization } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';

interface BylawyerLinkPanelProps {
  meetingCode: string;
  suggestedOrgId?: string;
}

interface LinkedOrgState {
  linked: boolean;
  organization: LinkedOrganization | null;
  warning?: string;
}

export function BylawyerLinkPanel({ meetingCode, suggestedOrgId }: BylawyerLinkPanelProps) {
  const { showToast } = useToast();
  const [organizations, setOrganizations] = useState<LinkedOrganization[]>([]);
  const [linkedOrg, setLinkedOrg] = useState<LinkedOrgState | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(suggestedOrgId || '');
  const [loading, setLoading] = useState(false);
  const [bylawyerAvailable, setBylawyerAvailable] = useState(true);

  // Update selectedOrgId when suggestedOrgId changes
  useEffect(() => {
    if (suggestedOrgId && !selectedOrgId) {
      setSelectedOrgId(suggestedOrgId);
    }
  }, [suggestedOrgId, selectedOrgId]);

  // Fetch the current linked organization
  const fetchLinkedOrg = useCallback(async () => {
    if (!meetingCode) return;
    try {
      const data = await bylawSync.getMeetingOrganization(meetingCode);
      setLinkedOrg(data);
      setBylawyerAvailable(true);
    } catch (err) {
      console.error('Error fetching linked organization:', err);
    }
  }, [meetingCode]);

  // Fetch available organizations from Bylawyer
  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await bylawSync.getOrganizations();
      setOrganizations(data);
      setBylawyerAvailable(true);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setBylawyerAvailable(false);
      showToast('error', 'Could not connect to Bylawyer');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchOrganizations();
    fetchLinkedOrg();
  }, [fetchOrganizations, fetchLinkedOrg]);

  const handleLink = async () => {
    if (!selectedOrgId || !meetingCode) return;

    try {
      setLoading(true);
      await bylawSync.linkMeeting(meetingCode, selectedOrgId);
      await fetchLinkedOrg();
      setSelectedOrgId('');
      showToast('success', 'Meeting linked to organization');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to link meeting';
      showToast('error', message);
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
      showToast('success', 'Meeting unlinked from organization');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlink meeting';
      showToast('error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchOrganizations();
    fetchLinkedOrg();
  };

  // Find the suggested org name if we have one
  const suggestedOrg = suggestedOrgId ? organizations.find((o) => o.id === suggestedOrgId) : null;

  // Show compact unavailable state if Bylawyer is not available
  if (!bylawyerAvailable) {
    return (
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
          <Building2 size={18} />
          Bylawyer Integration
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <AlertCircle className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-gray-500 text-sm">Bylawyer service unavailable</p>
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
    <div className="bg-white rounded-lg p-4 shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-gray-800">
          <Building2 size={18} />
          Bylawyer Integration
        </h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 p-1"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {linkedOrg?.linked && linkedOrg.organization ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link className="text-green-600" size={16} />
              <span className="font-medium text-green-800">Linked to Organization</span>
            </div>
            <p className="text-green-900 font-semibold">{linkedOrg.organization.name}</p>
            {linkedOrg.organization.description && (
              <p className="text-green-700 text-sm mt-1">{linkedOrg.organization.description}</p>
            )}
            <RouterLink
              to="/"
              className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 text-sm mt-2"
            >
              View Documents
              <ExternalLink size={12} />
            </RouterLink>
          </div>

          <button
            onClick={handleUnlink}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            <Unlink size={16} />
            Unlink Organization
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-gray-600 text-sm">
            Link this meeting to a Bylawyer organization to manage bylaw amendments.
          </p>

          {linkedOrg?.warning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-700 text-sm">{linkedOrg.warning}</p>
            </div>
          )}

          <div className="flex gap-2">
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={loading || organizations.length === 0}
              className="flex-1 p-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100"
            >
              <option value="">Select an organization...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.id === suggestedOrgId ? ' (Current)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleLink}
              disabled={loading || !selectedOrgId}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Link size={16} />
              Link
            </button>
          </div>

          {suggestedOrg && !linkedOrg?.linked && (
            <p className="text-indigo-600 text-xs">
              Suggested: {suggestedOrg.name} (your current organization)
            </p>
          )}

          {organizations.length === 0 && !loading && (
            <p className="text-gray-500 text-sm italic">
              No organizations found. Create one in the Documents section first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
