/**
 * Make someone a member of an organization (development data and support)
 *
 * Usage: npm run org:add-member -w backend-node -- --org <slug> --email <email> --role <role>
 */

/* eslint-disable no-console -- CLI output */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '../db/prisma.js';
import { addMemberBySlug } from '../orgs/membershipService.js';
import { ROLES, isOrgRole } from '../orgs/roles.js';

const usage = `Usage: npm run org:add-member -w backend-node -- --org <slug> --email <email> --role <${ROLES.join('|')}>`;

const { values } = parseArgs({
  options: {
    org: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string' },
  },
});
const { org, email, role } = values;

if (!org || !email || !isOrgRole(role)) {
  console.error(usage);
  process.exit(1);
}

try {
  const result = await addMemberBySlug(org, email, role);
  console.log(`${result.email} is now ${result.role} of ${result.organization}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
