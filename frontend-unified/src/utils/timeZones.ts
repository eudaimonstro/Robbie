/** A time zone in a picker: its IANA name, which is what is saved, and how people read it */
export interface TimeZoneOption {
  value: string;
  label: string;
}

export interface TimeZoneGroup {
  label: string;
  zones: TimeZoneOption[];
}

/** The time zones most of Robbie's associations meet in, by the names people use for them */
const US_ZONES: TimeZoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time (New York)' },
  { value: 'America/Chicago', label: 'Central Time (Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (Denver)' },
  // Arizona keeps standard time all year
  { value: 'America/Phoenix', label: 'Arizona Time (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (Honolulu)' },
];

const UTC: TimeZoneOption = { value: 'UTC', label: 'Coordinated Universal Time (UTC)' };

/**
 * Old names browsers still list (their time zone data keeps them as the canonical spelling),
 * with the names the time zone database uses now
 */
const RENAMED: Record<string, string> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

/** A zone's current name: Asia/Calcutta is Asia/Kolkata */
const currentName = (zone: string) => RENAMED[zone] ?? zone;

/** A fixed day, so a zone's name doesn't change with the day the list is made */
const NAMING_DAY = new Date(Date.UTC(2026, 0, 15));

/** The zone's time as people say it ("Central European Time"), or null if the browser can't say */
function genericName(zone: string): string | null {
  for (const timeZoneName of ['longGeneric', 'long'] as const) {
    try {
      const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName })
        .formatToParts(NAMING_DAY)
        .find((part) => part.type === 'timeZoneName')?.value;
      if (name) return name;
    } catch {
      // An unknown zone, or a browser without this style: try the next, then give up
    }
  }
  return null;
}

/** The place a zone is named for: Berlin, or Knox, Indiana */
function city(zone: string): string {
  const parts = zone.split('/').map((part) => part.replace(/_/g, ' '));
  if (parts.length > 2) return `${parts[parts.length - 1]}, ${parts[parts.length - 2]}`;
  return parts[parts.length - 1];
}

/** How a zone reads: "Central Time (Chicago)", "Central European Time (Berlin)" */
export function timeZoneLabel(zone: string): string {
  const name = currentName(zone);
  const known = [...US_ZONES, UTC].find((option) => option.value === name);
  if (known) return known.label;
  const generic = genericName(name);
  return generic ? `${generic} (${city(name)})` : zone.replace(/_/g, ' ');
}

/** The zones the browser knows other than the US ones, each once, by label (made once) */
let otherZones: TimeZoneOption[] | null = null;
function listOtherZones(): TimeZoneOption[] {
  if (otherZones) return otherZones;
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const taken = new Set(US_ZONES.map((option) => option.value));
  const zones = new Set<string>();
  for (const zone of [...known.map(currentName), UTC.value]) {
    if (!taken.has(zone)) zones.add(zone);
  }
  otherZones = [...zones]
    .map((value) => ({ value, label: timeZoneLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return otherZones;
}

/** The browser's time zone (an IANA name, by its current name), or undefined if it can't say */
export function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? currentName(zone) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The time zones for a picker: the common US ones, then every other zone the browser knows.
 * The one in use is always there, as it is saved: a zone saved under an old name takes the
 * place of its current name, and one the list doesn't know comes first.
 */
export function timeZoneGroups(current: string): TimeZoneGroup[] {
  const asSaved = (option: TimeZoneOption) =>
    option.value !== current && option.value === currentName(current)
      ? { ...option, value: current }
      : option;
  const groups: TimeZoneGroup[] = [
    { label: 'United States', zones: US_ZONES.map(asSaved) },
    { label: 'Other time zones', zones: listOtherZones().map(asSaved) },
  ];
  const listed = groups.some((group) => group.zones.some((zone) => zone.value === current));
  return listed
    ? groups
    : [{ label: 'In use', zones: [{ value: current, label: timeZoneLabel(current) }] }, ...groups];
}
