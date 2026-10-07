import { describe, it, expect } from 'vitest';
import {
  MEETING_STAGES,
  DISPLAYABLE_STAGES,
  STAGE_ORDER,
  getStageLogMessage,
  getNextStage,
  isLastActiveStage,
} from '../../constants/index.js';

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

  describe('DISPLAYABLE_STAGES', () => {
    it('should exclude not-started and adjourned', () => {
      const stageNames = DISPLAYABLE_STAGES.map((s) => s.stage);
      expect(stageNames).not.toContain('not-started');
      expect(stageNames).not.toContain('adjourned');
    });

    it('should have 7 displayable stages', () => {
      expect(DISPLAYABLE_STAGES).toHaveLength(7);
    });

    it('should start with call-to-order', () => {
      expect(DISPLAYABLE_STAGES[0].stage).toBe('call-to-order');
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

  describe('getNextStage', () => {
    it('should return call-to-order from not-started', () => {
      expect(getNextStage('not-started')).toBe('call-to-order');
    });

    it('should return minutes-approval from call-to-order', () => {
      expect(getNextStage('call-to-order')).toBe('minutes-approval');
    });

    it('should return adjourned from announcements', () => {
      expect(getNextStage('announcements')).toBe('adjourned');
    });

    it('should stay at adjourned when already adjourned', () => {
      expect(getNextStage('adjourned')).toBe('adjourned');
    });

    it('should progress through all stages correctly', () => {
      let stage = getNextStage('not-started');
      expect(stage).toBe('call-to-order');

      stage = getNextStage(stage);
      expect(stage).toBe('minutes-approval');

      stage = getNextStage(stage);
      expect(stage).toBe('reports');

      stage = getNextStage(stage);
      expect(stage).toBe('special-orders');

      stage = getNextStage(stage);
      expect(stage).toBe('unfinished-business');

      stage = getNextStage(stage);
      expect(stage).toBe('new-business');

      stage = getNextStage(stage);
      expect(stage).toBe('announcements');

      stage = getNextStage(stage);
      expect(stage).toBe('adjourned');
    });
  });

  describe('isLastActiveStage', () => {
    it('should return true for announcements', () => {
      expect(isLastActiveStage('announcements')).toBe(true);
    });

    it('should return false for other stages', () => {
      expect(isLastActiveStage('not-started')).toBe(false);
      expect(isLastActiveStage('call-to-order')).toBe(false);
      expect(isLastActiveStage('new-business')).toBe(false);
      expect(isLastActiveStage('adjourned')).toBe(false);
    });
  });
});
