/**
 * The meeting notice: its preview (and the printable notice's content), and sending it to every
 * member of the organization. A secretary's, for a meeting not yet called to order.
 */

import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { heavyWriteLimiter } from '../../middleware/userLimits.js';
import { ApiError } from '../../middleware/apiError.js';
import { robbieCodeParam } from '../../schemas/packets.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfPacketCode } from '../../orgs/resolvers.js';
import { noticePreview, sendNotice } from '../services/meetingNotice.js';

export const noticesRouter: RouterType = Router();

const byPacketCode = fromParam('robbieCode', orgOfPacketCode);

const sendNoticeBody = z.object({
  // The secretary confirmed sending a notice sent before
  confirmResend: z.boolean().optional(),
});

/**
 * GET /api/packets/:robbieCode/notice
 * The notice as the signed-in secretary would send it: its content, the email's subject and
 * text, how many it goes to, when it was last sent and by whom, and whether it can be sent now
 */
noticesRouter.get(
  '/packets/:robbieCode/notice',
  validate({ params: robbieCodeParam }),
  requireRole('secretary', byPacketCode),
  async (req, res) => {
    const preview = await noticePreview(req.params.robbieCode, req.user!);
    if (!preview) throw ApiError.notFound();
    res.json(preview);
  },
);

/**
 * POST /api/packets/:robbieCode/notice { confirmResend? }
 * Email the notice to every member (see sendNotice): { sent, failed, noticeSentAt }. 409 after
 * the call to order, without a date, or when sent before without confirmResend (code
 * NOTICE_SENT_BEFORE); 429 past the organization's daily limit.
 */
noticesRouter.post(
  '/packets/:robbieCode/notice',
  validate({ params: robbieCodeParam, body: sendNoticeBody }),
  requireRole('secretary', byPacketCode),
  heavyWriteLimiter,
  async (req, res) => {
    res.json(await sendNotice(req.params.robbieCode, req.user!, req.body));
  },
);
