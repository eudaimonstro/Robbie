/**
 * Create the Maple Grove HOA demo (docs/mvp-roadmap.md) in the database DATABASE_URL names
 *
 * Usage: npm run seed:demo -w backend-node [-- --reset]
 */

/* eslint-disable no-console -- CLI output */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '../db/prisma.js';
import {
  DEMO_BOARD_MEETING_CODE,
  DEMO_MEETING_CODE,
  DEMO_PAST_MEETING_CODE,
  DEMO_PEOPLE,
  DEMO_SLUG,
  seedDemo,
} from '../demo/demoSeed.js';

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

try {
  const summary = await seedDemo({ reset: values.reset });
  console.log(
    `Created Maple Grove HOA (${DEMO_SLUG}): ${summary.people} people, bylaws version 1 with ${summary.sections} sections, a proposed amendment, the 2025 annual meeting with its published minutes (${DEMO_PAST_MEETING_CODE}), the packet for meeting ${DEMO_MEETING_CODE} with ${summary.agendaItems} agenda items, and the board's November meeting (${DEMO_BOARD_MEETING_CODE}).`,
  );
  console.log('');
  console.log('People (all have accepted the current terms):');
  for (const person of DEMO_PEOPLE) {
    const board = person.director ? ', on the board' : '';
    console.log(`  ${person.role.padEnd(9)} ${person.name} <${person.email}>${board}`);
  }
  console.log('');
  console.log(
    'To sign in as one of them, run the server with ENABLE_TEST_AUTH=true and use the code 000000.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
