import { describe, it, expect } from 'vitest';
import { browserTimeZone, timeZoneGroups, timeZoneLabel } from '../timeZones';

const values = (groups: ReturnType<typeof timeZoneGroups>) =>
  groups.flatMap((group) => group.zones.map((zone) => zone.value));

describe('time zones', () => {
  it("reads the browser's time zone", () => {
    // vitest.config.ts runs the suite in Chicago
    expect(browserTimeZone()).toBe('America/Chicago');
  });

  it('lists the common US time zones first, by the names people use', () => {
    const [us] = timeZoneGroups('America/Chicago');
    expect(us.label).toBe('United States');
    expect(us.zones).toEqual([
      { value: 'America/New_York', label: 'Eastern Time (New York)' },
      { value: 'America/Chicago', label: 'Central Time (Chicago)' },
      { value: 'America/Denver', label: 'Mountain Time (Denver)' },
      { value: 'America/Phoenix', label: 'Arizona Time (Phoenix)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
      { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii Time (Honolulu)' },
    ]);
  });

  it('names every other zone by its time and its city, in order, each once', () => {
    const groups = timeZoneGroups('America/Chicago');
    expect(groups.map((group) => group.label)).toEqual(['United States', 'Other time zones']);
    const others = groups[1].zones;
    const berlin = others.find((zone) => zone.value === 'Europe/Berlin');
    expect(berlin?.label).toMatch(/^Central European .*\(Berlin\)$/);
    expect(others.find((zone) => zone.value === 'UTC')?.label).toBe(
      'Coordinated Universal Time (UTC)',
    );
    const labels = others.map((zone) => zone.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    const all = values(groups);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((value) => value === 'America/Chicago')).toHaveLength(1);
  });

  it('uses the current names of renamed zones', () => {
    const all = values(timeZoneGroups('America/Chicago'));
    expect(all).not.toContain('Asia/Calcutta');
    expect(all).toContain('Asia/Kolkata');
    expect(all).not.toContain('America/Indianapolis');
    expect(all).toContain('America/Indiana/Indianapolis');
    expect(timeZoneLabel('America/Indianapolis')).toMatch(/\(Indianapolis, Indiana\)$/);
    expect(timeZoneLabel('Asia/Calcutta')).toMatch(/\(Kolkata\)$/);
  });

  it('keeps a zone saved under an old name selectable as it was saved', () => {
    const groups = timeZoneGroups('Asia/Calcutta');
    const all = values(groups);
    expect(all).toContain('Asia/Calcutta');
    expect(all).not.toContain('Asia/Kolkata');
    expect(groups).toHaveLength(2);
  });

  it('keeps a zone the list does not know, first', () => {
    const [first] = timeZoneGroups('Etc/Unknown');
    expect(first.label).toBe('In use');
    expect(first.zones).toEqual([{ value: 'Etc/Unknown', label: 'Etc/Unknown' }]);
  });

  it('labels a single zone the same way the list does', () => {
    expect(timeZoneLabel('America/Chicago')).toBe('Central Time (Chicago)');
    expect(timeZoneLabel('America/Phoenix')).toBe('Arizona Time (Phoenix)');
    expect(timeZoneLabel('Europe/Berlin')).toMatch(/\(Berlin\)$/);
    expect(timeZoneLabel('America/Argentina/Buenos_Aires')).toMatch(/\(Buenos Aires, Argentina\)$/);
  });
});
