import { describe, it, expect } from 'vitest';
import { findParentProblem, type SectionRef } from '../bylawyer/sectionParent.js';

// Version v1: A > B > C, and D at the root. Version v2: E.
const sections: Record<string, SectionRef> = {
  A: { id: 'A', versionId: 'v1', parentId: null },
  B: { id: 'B', versionId: 'v1', parentId: 'A' },
  C: { id: 'C', versionId: 'v1', parentId: 'B' },
  D: { id: 'D', versionId: 'v1', parentId: null },
  E: { id: 'E', versionId: 'v2', parentId: null },
};
const lookup = async (id: string) => sections[id] ?? null;

describe('findParentProblem', () => {
  it('accepts the root and a section in the same version', async () => {
    expect(
      await findParentProblem({ versionId: 'v1', sectionId: 'C', parentId: null }, lookup),
    ).toBeNull();
    expect(
      await findParentProblem({ versionId: 'v1', sectionId: 'C', parentId: 'D' }, lookup),
    ).toBeNull();
    expect(await findParentProblem({ versionId: 'v1', parentId: 'C' }, lookup)).toBeNull();
  });

  it('rejects a missing parent or one in another version', async () => {
    expect(await findParentProblem({ versionId: 'v1', parentId: 'Z' }, lookup)).toMatch(
      /not found/,
    );
    expect(await findParentProblem({ versionId: 'v1', parentId: 'E' }, lookup)).toMatch(
      /same version/,
    );
  });

  it('rejects the section itself or one of its descendants', async () => {
    expect(
      await findParentProblem({ versionId: 'v1', sectionId: 'A', parentId: 'A' }, lookup),
    ).toMatch(/own/);
    expect(
      await findParentProblem({ versionId: 'v1', sectionId: 'A', parentId: 'C' }, lookup),
    ).toMatch(/own/);
  });

  it('stops on a cycle already in the data', async () => {
    const looped: Record<string, SectionRef> = {
      X: { id: 'X', versionId: 'v1', parentId: 'Y' },
      Y: { id: 'Y', versionId: 'v1', parentId: 'X' },
    };
    const result = await findParentProblem(
      { versionId: 'v1', sectionId: 'A', parentId: 'X' },
      async (id) => looped[id] ?? null,
    );
    expect(result).toMatch(/cycle/);
  });
});
