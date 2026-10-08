import { useId, useState } from 'react';
import { Globe } from 'lucide-react';
import { organizations as organizationsApi } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { timeZoneGroups, timeZoneLabel } from '../../../utils/timeZones';

/** Where the organization's meetings are held, which the minutes give their times in */
export function TimeZoneCard() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const isAdmin = useCan('admin');
  const { showToast } = useToast();
  const selectId = useId();
  const [saving, setSaving] = useState(false);
  if (!currentOrganization) return null;

  const current = currentOrganization.timeZone ?? 'America/Chicago';
  const change = async (timeZone: string) => {
    setSaving(true);
    try {
      await organizationsApi.update(currentOrganization.id, { timeZone });
      await refreshOrganizations();
      showToast('success', 'Time zone saved');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't save the time zone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="border-b border-rule px-4 py-4 sm:px-6">
        <h3 className="card-title flex items-center gap-2">
          <Globe className="h-5 w-5" aria-hidden="true" />
          Time zone
        </h3>
      </div>
      <div className="space-y-2 p-4 sm:p-6">
        {isAdmin ? (
          <>
            <label htmlFor={selectId} className="label">
              Meetings are held in
            </label>
            <select
              id={selectId}
              className="select"
              value={current}
              disabled={saving}
              onChange={(e) => void change(e.target.value)}
            >
              {timeZoneGroups(current).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map((zone) => (
                    <option key={zone.value} value={zone.value}>
                      {zone.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </>
        ) : (
          <p className="font-medium text-ink">{timeZoneLabel(current)}</p>
        )}
        <p className="text-xs text-ink-muted">
          The minutes give the times of meetings in this time zone.
        </p>
      </div>
    </div>
  );
}
