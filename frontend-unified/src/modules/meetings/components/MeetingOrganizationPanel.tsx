import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useMeetingOrganization } from '../context/OrganizationBridge';

interface MeetingOrganizationPanelProps {
  /** The organization the meeting belongs to (its packet's), from the meeting's state */
  organizationId: string | null;
}

/**
 * The organization a live meeting belongs to, the one whose bylaws an amendment passed in it
 * changes, with the way to its documents. A meeting code is a scheduled meeting, so there is
 * nothing to link or unlink here: a meeting is canceled from Live Meetings.
 */
export function MeetingOrganizationPanel({ organizationId }: MeetingOrganizationPanelProps) {
  const navigate = useNavigate();
  const { availableOrganizations, setCurrentOrganization } = useMeetingOrganization();
  const organization = availableOrganizations.find((org) => org.id === organizationId) ?? null;
  if (!organization) return null;

  /** Show the meeting's organization's documents, not the header's */
  const viewDocuments = () => {
    setCurrentOrganization(organization);
    navigate('/');
  };

  return (
    <section className="space-y-2" aria-labelledby="meeting-organization-heading">
      <h4 id="meeting-organization-heading" className="label-caps">
        Organization
      </h4>
      <p className="font-semibold text-ink">{organization.name}</p>
      {organization.description && (
        <p className="text-sm text-ink-muted">{organization.description}</p>
      )}
      <button
        type="button"
        onClick={viewDocuments}
        className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
      >
        View Documents
        <ExternalLink size={12} aria-hidden="true" />
      </button>
    </section>
  );
}
