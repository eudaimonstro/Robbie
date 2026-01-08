import { Router, type Router as RouterType } from 'express';
import { prisma } from '../index.js';

export const meetingsRouter: RouterType = Router();

// List meetings for an organization
meetingsRouter.get('/organizations/:orgId/meetings', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const meetings = await prisma.meeting.findMany({
      where: { organizationId: req.params.orgId },
      orderBy: { scheduledDate: 'desc' }
    });

    res.json(meetings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list meetings' });
  }
});

// Create meeting
meetingsRouter.post('/organizations/:orgId/meetings', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const meeting = await prisma.meeting.create({
      data: {
        organizationId: req.params.orgId,
        title: req.body.title || 'Meeting',
        scheduledDate: new Date(req.body.scheduled_date || req.body.scheduledDate),
        meetingType: req.body.meeting_type || req.body.meetingType || 'regular',
        location: req.body.location,
        notes: req.body.notes
      }
    });

    res.status(201).json(meeting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// Get meeting by ID
meetingsRouter.get('/meetings/:id', async (req, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json(meeting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get meeting' });
  }
});

// Update meeting
meetingsRouter.put('/meetings/:id', async (req, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const updated = await prisma.meeting.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? meeting.title,
        scheduledDate: req.body.scheduled_date ? new Date(req.body.scheduled_date) :
          req.body.scheduledDate ? new Date(req.body.scheduledDate) : meeting.scheduledDate,
        meetingType: req.body.meeting_type || req.body.meetingType || meeting.meetingType,
        location: req.body.location ?? meeting.location,
        status: req.body.status ?? meeting.status,
        notes: req.body.notes ?? meeting.notes
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// Delete meeting
meetingsRouter.delete('/meetings/:id', async (req, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    await prisma.meeting.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// Record vote
meetingsRouter.post('/meetings/:id/votes', async (req, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const amendmentId = req.body.amendment_id || req.body.amendmentId;
    const amendment = await prisma.amendment.findUnique({
      where: { id: amendmentId }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'proposed') {
      return res.status(400).json({ error: 'Can only vote on proposed amendments' });
    }

    const yeaCount = req.body.yea_count ?? req.body.yeaCount ?? 0;
    const nayCount = req.body.nay_count ?? req.body.nayCount ?? 0;
    const abstainCount = req.body.abstain_count ?? req.body.abstainCount ?? 0;

    // Calculate result (simple majority)
    const passed = yeaCount > nayCount;
    const result = passed ? 'passed' : 'failed';

    const vote = await prisma.vote.create({
      data: {
        meetingId: req.params.id,
        amendmentId,
        yeaCount,
        nayCount,
        abstainCount,
        result,
        requires: req.body.requires
      }
    });

    // Update amendment status
    await prisma.amendment.update({
      where: { id: amendmentId },
      data: {
        status: result,
        decidedAt: new Date()
      }
    });

    res.status(201).json(vote);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

// Get vote by ID
meetingsRouter.get('/votes/:id', async (req, res) => {
  try {
    const vote = await prisma.vote.findUnique({
      where: { id: req.params.id }
    });

    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    res.json(vote);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get vote' });
  }
});

// Delete vote
meetingsRouter.delete('/votes/:id', async (req, res) => {
  try {
    const vote = await prisma.vote.findUnique({
      where: { id: req.params.id }
    });

    if (!vote) {
      return res.status(404).json({ error: 'Vote not found' });
    }

    await prisma.vote.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vote' });
  }
});

// List votes for meeting
meetingsRouter.get('/meetings/:id/votes', async (req, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const votes = await prisma.vote.findMany({
      where: { meetingId: req.params.id }
    });

    res.json(votes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list votes' });
  }
});

// List votes for amendment
meetingsRouter.get('/amendments/:id/votes', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    const votes = await prisma.vote.findMany({
      where: { amendmentId: req.params.id }
    });

    res.json(votes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list votes' });
  }
});
