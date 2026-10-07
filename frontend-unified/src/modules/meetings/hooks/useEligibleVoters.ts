import type { MeetingRoster } from '../../../api/client';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { eligibleCount } from '../utils/attendance';

/**
 * The meeting organization's voting members: its setting from the user's organizations list,
 * or else its roster's voting members
 */
export function useEligibleVoters(
  organizationId: string | null,
  roster: MeetingRoster | null,
): number | null {
  const { availableOrganizations } = useMeetingOrganization();
  const organization = availableOrganizations.find((o) => o.id === organizationId) ?? null;
  return eligibleCount(organization, roster);
}
