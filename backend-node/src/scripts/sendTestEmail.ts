/**
 * Send a test email through the configured provider
 *
 * Usage: npm run email:test -w backend-node -- you@example.com
 */

/* eslint-disable no-console -- CLI output */
import 'dotenv/config';
import { getEmailProvider, sendTestEmail } from '../auth/emailService.js';

const to = process.argv[2];

if (!to) {
  console.error('Usage: npm run email:test -w backend-node -- <recipient-email>');
  process.exit(1);
}

try {
  const messageId = await sendTestEmail(to);
  console.log(`Sent test email to ${to} via ${getEmailProvider()} (id: ${messageId ?? 'n/a'})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
