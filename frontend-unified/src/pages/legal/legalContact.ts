/**
 * Every name and address the legal pages give, in one place. The owner confirms each mailbox before
 * launch, and fills in the DMCA agent once it is registered with the US Copyright Office
 * (dmca.copyright.gov; docs/deploy.md, "Before launch"). Until then the agent's name, postal
 * address and phone stay empty and the Terms give only its email: never a made-up address.
 */

/**
 * Who provides Robbie: the person or company, as the owner fills it in (with the lawyer). Empty
 * until then, and the legal pages say "the operator of Robbie".
 */
export const PROVIDER_NAME = '';

/** The provider's name for the legal pages, or "the operator of Robbie" while it is empty */
export function providerName(name: string = PROVIDER_NAME): string {
  return name.trim() || 'the operator of Robbie';
}

/** Where to write about an account or its data */
export const PRIVACY_EMAIL = 'privacy@robbie.scouch.dev';

/** Where to report illegal or abusive content */
export const ABUSE_EMAIL = 'abuse@robbie.scouch.dev';

/** The agent designated to receive copyright notices (17 U.S.C. 512(c)(2)) */
export interface DmcaAgent {
  /** A person, or a title such as "Copyright Agent", as registered */
  name: string;
  /** One entry per line; empty until registered */
  postalAddress: string[];
  phone: string;
  email: string;
}

export const DMCA_AGENT: DmcaAgent = {
  name: '',
  postalAddress: [],
  phone: '',
  email: 'copyright@robbie.scouch.dev',
};
