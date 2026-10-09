import { describe, it, expect } from 'vitest';
import { MEETING_STAGES, STAGE_ORDER, getStageLogMessage } from '../../constants/index.js';

describe('meetingStages', () => {
  describe('MEETING_STAGES', () => {
    it('should have 9 stages', () => {
      expect(MEETING_STAGES).toHaveLength(9);
    });

    it('should start with not-started and end with adjourned', () => {
      expect(MEETING_STAGES[0].stage).toBe('not-started');
      expect(MEETING_STAGES[MEETING_STAGES.length - 1].stage).toBe('adjourned');
    });

    it('should have required properties for each stage', () => {
      MEETING_STAGES.forEach((stage) => {
        expect(stage).toHaveProperty('stage');
        expect(stage).toHaveProperty('label');
        expect(stage).toHaveProperty('logMessage');
      });
    });
  });

  describe('STAGE_ORDER', () => {
    it('should contain all stage names in order', () => {
      expect(STAGE_ORDER).toEqual([
        'not-started',
        'call-to-order',
        'minutes-approval',
        'reports',
        'special-orders',
        'unfinished-business',
        'new-business',
        'announcements',
        'adjourned',
      ]);
    });
  });

  describe('getStageLogMessage', () => {
    it('should return empty string for not-started', () => {
      expect(getStageLogMessage('not-started')).toBe('');
    });

    it('should return correct message for call-to-order', () => {
      expect(getStageLogMessage('call-to-order')).toBe('Meeting called to order');
    });

    it('should return correct message for new-business', () => {
      expect(getStageLogMessage('new-business')).toBe('New business');
    });

    it('should return correct message for adjourned', () => {
      expect(getStageLogMessage('adjourned')).toBe('Meeting adjourned');
    });
  });
});
