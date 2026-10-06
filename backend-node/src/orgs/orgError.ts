/** A refused organization or membership change, with the HTTP status to answer with */
export class OrgError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OrgError';
  }
}
