/**
 * Minutes Routes
 *
 * The minutes of each scheduled meeting: drafted by the app when the meeting adjourns, edited
 * and published by a secretary, read by members once published, and approved at the next
 * meeting (see the action handler)
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { OrgRole, Prisma } from '../../generated/prisma/client.js';
import { getStorage } from '../../db/meetingStorage.js';
import { largeJson } from '../../middleware/largeJson.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../middleware/logger.js';
import { orgIdParam, uuidParam } from '../../schemas/common.js';
import { updateMinutesBody } from '../../schemas/minutes.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfMinutes, orgOfOrganization } from '../../orgs/resolvers.js';
import { atLeast } from '../../orgs/roles.js';
import {
  minutesBeforeLiveMeeting,
  minutesContext,
  writeMinutes,
} from '../services/meetingMinutes.js';

export const minutesRouter: RouterType = Router();

const byMinutes = fromParam('id', orgOfMinutes);

/** The answers when minutes can't be changed as asked */
export const MINUTES_APPROVED = 'Approved minutes are the record and cannot be changed';
export const ONLY_DRAFTS_REGENERATE = 'Only a draft can be written again from the meeting';
export const NO_MEETING_RECORD = 'The meeting has no record to write the minutes from';
export const MINUTES_BEFORE_MEETING =
  'These minutes are before a meeting; corrections are made there';

/** A minutes response: the text, its status, who did what, its meeting and organization */
const MINUTES_SELECT = {
  id: true,
  organizationId: true,
  packetId: true,
  status: true,
  body: true,
  generatedAt: true,
  updatedAt: true,
  publishedAt: true,
  approvedAt: true,
  corrections: true,
  packet: {
    select: { id: true, robbieCode: true, title: true, scheduledFor: true, location: true },
  },
  organization: { select: { id: true, name: true, timeZone: true } },
  updatedBy: { select: { id: true, name: true } },
  publishedBy: { select: { id: true, name: true } },
  approvedAtPacket: { select: { id: true, title: true, scheduledFor: true } },
} satisfies Prisma.MinutesSelect;

/** Drafts are for secretaries and above; to everyone else they don't exist */
const seesDrafts = (role: OrgRole) => atLeast(role, 'secretary');

/**
 * When a meeting was held, for ordering its minutes: its date when it has one, else when it was
 * called to order, else when its minutes were written
 */
const meetingDate = (scheduledFor: Date | null, startedAt: Date | null, generatedAt: Date) =>
  (scheduledFor ?? startedAt ?? generatedAt).getTime();

/**
 * Whether these minutes are published and before a meeting that hasn't adjourned: the meeting
 * has them as they are and makes any corrections, so the secretary's editor doesn't change them
 * (PUT refuses, and every answer with one meeting's minutes says so as `beforeMeeting`)
 */
const lockedBeforeMeeting = async (
  organizationId: string,
  minutes: { id: string; status: string },
) => minutes.status === 'published' && (await minutesBeforeLiveMeeting(organizationId, minutes.id));

/** A minutes response: the record, and whether a meeting has them before it */
const withBeforeMeeting = async <M extends { id: string; organizationId: string; status: string }>(
  minutes: M,
) => ({ ...minutes, beforeMeeting: await lockedBeforeMeeting(minutes.organizationId, minutes) });

const readMinutes = async (id: string) =>
  withBeforeMeeting(
    await prisma.minutes.findUniqueOrThrow({ where: { id }, select: MINUTES_SELECT }),
  );

/**
 * GET /api/organizations/:orgId/minutes
 * The organization's minutes, the latest meeting first (see meetingDate)
 */
minutesRouter.get(
  '/organizations/:orgId/minutes',
  validate({ params: orgIdParam }),
  requireRole('viewer', fromParam('orgId', orgOfOrganization)),
  async (req, res) => {
    try {
      const minutes = await prisma.minutes.findMany({
        where: {
          organizationId: req.org!.id,
          ...(seesDrafts(req.org!.role) ? {} : { status: { not: 'draft' as const } }),
        },
        select: {
          id: true,
          status: true,
          generatedAt: true,
          updatedAt: true,
          publishedAt: true,
          approvedAt: true,
          packet: {
            select: {
              id: true,
              robbieCode: true,
              title: true,
              scheduledFor: true,
              startedAt: true,
            },
          },
        },
        // Ties keep this order (the sort below is stable)
        orderBy: { generatedAt: 'desc' },
      });
      // Sorted here: the date may come from the packet or the minutes. One organization's
      // minutes are a short list.
      const latestFirst = minutes
        .map(({ packet: { startedAt, ...packet }, ...rest }) => ({
          summary: { ...rest, packet },
          date: meetingDate(packet.scheduledFor, startedAt, rest.generatedAt),
        }))
        .sort((a, b) => b.date - a.date)
        .map(({ summary }) => summary);
      res.json(latestFirst);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list minutes');
      res.status(500).json({ error: 'Failed to list minutes' });
    }
  },
);

/**
 * GET /api/minutes/:id
 * One meeting's minutes, with `beforeMeeting` (see lockedBeforeMeeting). A draft is not found
 * below secretary.
 */
minutesRouter.get(
  '/minutes/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byMinutes),
  async (req, res) => {
    try {
      const minutes = await prisma.minutes.findUnique({
        where: { id: req.params.id },
        select: MINUTES_SELECT,
      });
      if (!minutes || (minutes.status === 'draft' && !seesDrafts(req.org!.role))) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(await withBeforeMeeting(minutes));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get minutes');
      res.status(500).json({ error: 'Failed to get the minutes' });
    }
  },
);

/**
 * PUT /api/minutes/:id
 * The secretary's text. The last save wins, and its author is named. Approved minutes are the
 * record and stay as they are; published minutes before a meeting that hasn't adjourned stay as
 * the meeting has them, since the meeting makes any corrections.
 * Body: { body }
 */
minutesRouter.put(
  '/minutes/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byMinutes),
  // Read only now, after the role check (see largeJson)
  largeJson,
  validate({ body: updateMinutesBody }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = await prisma.minutes.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      });
      if (await lockedBeforeMeeting(req.org!.id, { id, status })) {
        return res.status(409).json({ error: MINUTES_BEFORE_MEETING });
      }
      // One statement, so minutes approved in the meantime aren't changed
      const updated = await prisma.minutes.updateMany({
        where: { id, status: { not: 'approved' } },
        data: { body: req.body.body, updatedById: req.user!.id },
      });
      if (updated.count === 0) return res.status(409).json({ error: MINUTES_APPROVED });
      res.json(await readMinutes(id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to save minutes');
      res.status(500).json({ error: 'Failed to save the minutes' });
    }
  },
);

/**
 * POST /api/minutes/:id/publish
 * Members can read them, and the next meeting is asked to approve them. Publishing published
 * minutes changes nothing.
 */
minutesRouter.post(
  '/minutes/:id/publish',
  validate({ params: uuidParam }),
  requireRole('secretary', byMinutes),
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.minutes.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'published', publishedAt: new Date(), publishedById: req.user!.id },
      });
      const minutes = await readMinutes(id);
      if (minutes.status === 'approved') return res.status(409).json({ error: MINUTES_APPROVED });
      res.json(minutes);
    } catch (error) {
      logger.error({ err: error }, 'Failed to publish minutes');
      res.status(500).json({ error: 'Failed to publish the minutes' });
    }
  },
);

/**
 * POST /api/minutes/:id/regenerate
 * Write a draft again from the meeting's live record, replacing its text (the page asks
 * first). Only a draft: published minutes are what members have read.
 */
minutesRouter.post(
  '/minutes/:id/regenerate',
  validate({ params: uuidParam }),
  requireRole('secretary', byMinutes),
  async (req, res) => {
    try {
      const { id } = req.params;
      const minutes = await prisma.minutes.findUniqueOrThrow({
        where: { id },
        select: { status: true, packetId: true, packet: { select: { robbieCode: true } } },
      });
      if (minutes.status !== 'draft') {
        return res.status(409).json({ error: ONLY_DRAFTS_REGENERATE });
      }
      const meeting = await getStorage().getMeeting(minutes.packet.robbieCode);
      const context = await minutesContext(minutes.packetId);
      if (!meeting || !context) return res.status(409).json({ error: NO_MEETING_RECORD });

      await prisma.minutes.updateMany({
        where: { id, status: 'draft' },
        data: {
          body: writeMinutes(meeting.state, context),
          generatedAt: new Date(),
          updatedById: req.user!.id,
        },
      });
      res.json(await readMinutes(id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to regenerate minutes');
      res.status(500).json({ error: 'Failed to write the minutes again' });
    }
  },
);
