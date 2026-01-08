import { useState, useEffect, useCallback } from 'react';
import { Building2, Link, Unlink, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface BylawyerOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface LinkedOrganization {
  linked: boolean;
  organization: BylawyerOrganization | null;
  warning?: string;
}

interface BylawyerLinkPanelProps {
  meetingCode: string;
}

export function BylawyerLinkPanel({ meetingCode }: BylawyerLinkPanelProps) {
  const [organizations, setOrganizations] = useState<BylawyerOrganization[]>([]);
  const [linkedOrg, setLinkedOrg] = useState<LinkedOrganization | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bylawyerAvailable, setBylawyerAvailable] = useState(true);

  // Fetch the current linked organization
  const fetchLinkedOrg = useCallback(async () => {
    if (!meetingCode) return;
    try {
      const response = await fetch(`${SERVER_URL}/api/bylawyer/meeting/${meetingCode}/organization`);
      if (response.ok) {
        const data = await response.json();
        setLinkedOrg(data);
        setBylawyerAvailable(true);
      }
    } catch (err) {
      console.error('Error fetching linked organization:', err);
    }
  }, [meetingCode]);

  // Fetch available organizations from Bylawyer
  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${SERVER_URL}/api/bylawyer/organizations`);

      if (!response.ok) {
        if (response.status === 503) {
          setBylawyerAvailable(false);
          setError('Bylawyer service is unavailable');
        } else {
          throw new Error('Failed to fetch organizations');
        }
        return;
      }

      const data = await response.json();
      setOrganizations(data);
      setBylawyerAvailable(true);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setBylawyerAvailable(false);
      setError('Could not connect to Bylawyer');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
    fetchLinkedOrg();
  }, [fetchOrganizations, fetchLinkedOrg]);

  const handleLink = async () => {
    if (!selectedOrgId || !meetingCode) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${SERVER_URL}/api/bylawyer/link-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingCode,
          organizationId: selectedOrgId
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link meeting');
      }

      await fetchLinkedOrg();
      setSelectedOrgId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!meetingCode) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${SERVER_URL}/api/bylawyer/link-meeting/${meetingCode}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unlink meeting');
      }

      setLinkedOrg({ linked: false, organization: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchOrganizations();
    fetchLinkedOrg();
  };

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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

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
            <a
              href={`http://localhost:5174/org/${linkedOrg.organization.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 text-sm mt-2"
            >
              View in Bylawyer
              <ExternalLink size={12} />
            </a>
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
              {organizations.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name}
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

          {organizations.length === 0 && !loading && (
            <p className="text-gray-500 text-sm italic">
              No organizations found. Create one in Bylawyer first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
