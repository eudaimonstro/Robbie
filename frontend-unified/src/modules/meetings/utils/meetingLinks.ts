/** A code as typed or linked, in the form the server stores */
export function normalizeMeetingCode(code: string): string {
  return code.trim().toUpperCase();
}

/** A live meeting's page: going there joins it */
export function meetingPath(code: string): string {
  return `/meetings/${normalizeMeetingCode(code)}`;
}

/**
 * The link people join by, for QR codes and to read out: this app's own address, so it is right
 * in development, behind a proxy and in production alike
 */
export function joinUrl(code: string): string {
  return `${window.location.origin}${meetingPath(code)}`;
}
