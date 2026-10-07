import type { NextFunction, Request, Response } from 'express';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';

/** The code clients look for to show the terms step */
export const TERMS_NOT_ACCEPTED = 'TERMS_NOT_ACCEPTED';
export const ACCEPT_THE_TERMS = 'Accept the terms to continue';

/** Whether a user who last accepted `version` has accepted the current terms */
export function hasAcceptedTerms(version: string | null | undefined): boolean {
  return version === TERMS_VERSION;
}

/** After authenticate: refuse a user who hasn't accepted the current terms */
export function requireTerms(req: Request, res: Response, next: NextFunction) {
  if (hasAcceptedTerms(req.termsVersion)) return next();
  res.status(403).json({ error: ACCEPT_THE_TERMS, code: TERMS_NOT_ACCEPTED });
}
