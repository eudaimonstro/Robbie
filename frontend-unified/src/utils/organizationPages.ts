/**
 * Whether a page shows one record of the selected organization (a document or an amendment). After switching organization such a page belongs to the old one, so the
 * app leaves it; lists and settings reload for the new organization instead.
 */
export function showsOneOrganizationsRecord(pathname: string): boolean {
  return /^\/(documents|amendments)\/[^/]+/.test(pathname);
}
