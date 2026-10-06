import { describe, it, expect } from 'vitest';
import { planAmendment, type PlannedChange } from '../bylawyer/services/amendmentPlan.js';

// Current version: Article I (a1) with Section 1 (s1), and Article II (a2)
const sections = [
  { id: 'a1', parentId: null },
  { id: 's1', parentId: 'a1' },
  { id: 'a2', parentId: null },
];
const change = (
  id: string,
  changeType: PlannedChange['changeType'],
  targetSectionId: string | null,
) => ({
  id,
  changeType,
  targetSectionId,
});

describe('planAmendment', () => {
  it('applies changes whose sections are in the current version', () => {
    const plan = planAmendment(sections, [
      change('c1', 'modify', 's1'),
      change('c2', 'add', 'a2'),
      change('c3', 'add', null),
      change('c4', 'delete', 'a2'),
    ]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skip.size).toBe(0);
  });

  it('reports a change to a section that is not in the current version', () => {
    // Drafted against an older version: another amendment has replaced its sections since
    const plan = planAmendment(sections, [change('c1', 'modify', 'old-section')]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatch(/not in the current version/);
  });

  it('reports a change with no target section', () => {
    expect(planAmendment(sections, [change('c1', 'modify', null)]).conflicts).toHaveLength(1);
  });

  it('skips changes to sections an earlier change deletes', () => {
    const plan = planAmendment(sections, [
      change('c1', 'delete', 'a1'),
      change('c2', 'modify', 's1'),
      change('c3', 'delete', 's1'),
    ]);
    expect(plan.conflicts).toEqual([]);
    expect([...plan.skip]).toEqual(['c2', 'c3']);
  });

  it('reports adding under a section an earlier change deletes', () => {
    const plan = planAmendment(sections, [change('c1', 'delete', 'a1'), change('c2', 'add', 's1')]);
    expect(plan.conflicts).toHaveLength(1);
  });
});
