/**
 * Bylawyer Routes Index
 *
 * Exports all Bylawyer API routes for mounting in the main server.
 */

export { organizationsRouter } from './organizations.js';
export { documentsRouter } from './documents.js';
export { versionsRouter } from './versions.js';
export { sectionsRouter } from './sections.js';
export { amendmentsRouter } from './amendments.js';
export { meetingsRouter } from './meetings.js';
export { publicRouter } from './public.js';
export { robbieRouter } from './robbie.js';

// Meeting packet and agenda routes
export { packetsRouter } from './packets.js';
export { attachmentsRouter } from './attachments.js';
export { agendaItemsRouter } from './agenda-items.js';
