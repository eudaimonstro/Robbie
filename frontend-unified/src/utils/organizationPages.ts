/**
 * Whether a page shows one record of the selected organization (a document, an amendment or a
 * recorded meeting). After switching organization such a page belongs to the old one, so the
 * app leaves it; lists and settings reload for the new organization instead.
 */
export function showsOneOrganizationsRecord(pathname: string): boolean {
  return /^\/(documents|amendments|bylawyer-meetings)\/[^/]+/.test(pathname);
}
