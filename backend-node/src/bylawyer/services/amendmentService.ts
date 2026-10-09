import { prisma } from '../../db/prisma.js';
import { sectionLabel } from '@robbie-bylawyer/shared/utils';
import {
  Amendment,
  AmendmentChange,
  Prisma,
  Section,
  Version,
} from '../../generated/prisma/client.js';
import { planAmendment } from './amendmentPlan.js';

export type AmendmentWithChanges = Amendment & { changes: AmendmentChange[] };

/** The amendment can't be applied to the document's current version as written */
export class AmendmentConflictError extends Error {
  constructor(conflicts: string[]) {
    super(`The amendment no longer matches the current version: ${conflicts.join('; ')}`);
    this.name = 'AmendmentConflictError';
  }
}

/** The amendment already has a resulting version */
export class AmendmentAppliedError extends Error {
  constructor() {
    super('Amendment has already been applied');
    this.name = 'AmendmentAppliedError';
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Point the changes of a document's draft and proposed amendments (but `except`, the one being
 * applied) at the sections of the version just made: `idMap` takes each section of the version
 * it replaced (`replaced`) to its new id, where it has one. A change whose section has no match
 * in the new version keeps the old id, so it no longer applies as written, and its section's
 * label if it had none (targetLabel), so the amendment can say which section is gone.
 * Every new version calls this: applying an amendment, a copy, an import.
 */
export async function remapOpenAmendments(
  tx: Tx,
  documentId: string,
  versionId: string,
  replaced: Section[],
  idMap: Record<string, string>,
  except?: string,
): Promise<void> {
  const oldOf = new Map(replaced.map((section) => [section.id, section]));
  const changes = await tx.amendmentChange.findMany({
    where: {
      targetSectionId: { in: [...oldOf.keys()] },
      amendment: {
        documentId,
        ...(except && { id: { not: except } }),
        status: { in: ['draft', 'proposed'] },
      },
    },
    select: { id: true, targetSectionId: true, targetLabel: true },
  });
  if (changes.length === 0) return;
  const remaining = new Set(
    (
      await tx.section.findMany({
        where: {
          versionId,
          id: { in: changes.map((c) => idMap[c.targetSectionId!]).filter(Boolean) },
        },
        select: { id: true },
      })
    ).map((section) => section.id),
  );
  for (const change of changes) {
    const newId = idMap[change.targetSectionId!];
    if (newId && remaining.has(newId)) {
      await tx.amendmentChange.update({
        where: { id: change.id },
        data: { targetSectionId: newId },
      });
    } else if (!change.targetLabel) {
      await tx.amendmentChange.update({
        where: { id: change.id },
        data: { targetLabel: sectionLabel(oldOf.get(change.targetSectionId!)!) },
      });
    }
  }
}

export class AmendmentService {
  async applyAmendment(amendment: AmendmentWithChanges, effectiveDate?: Date): Promise<Version> {
    if (amendment.status !== 'passed') {
      throw new Error('Can only apply passed amendments');
    }

    if (amendment.resultingVersionId) {
      throw new AmendmentAppliedError();
    }

    // All writes happen in one transaction, so a failure part way leaves no orphan version
    return prisma.$transaction(
      async (tx) => {
        // Applies to one document run one at a time, so two can't take the same version
        // number, and an apply of this amendment that waited here finds it applied. (A passed
        // amendment stays passed, so only that needs checking again.)
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${amendment.documentId} FOR UPDATE`;
        const current = await tx.amendment.findUnique({
          where: { id: amendment.id },
          select: { resultingVersionId: true },
        });
        if (current?.resultingVersionId) {
          throw new AmendmentAppliedError();
        }

        const document = await tx.document.findUnique({
          where: { id: amendment.documentId },
        });

        if (!document) {
          throw new Error('Document not found');
        }

        const oldSections = document.currentVersionId
          ? await tx.section.findMany({ where: { versionId: document.currentVersionId } })
          : [];

        // Check every change against the current version before writing anything
        const sortedChanges = [...amendment.changes].sort((a, b) => a.position - b.position);
        const plan = planAmendment(oldSections, sortedChanges);
        if (plan.conflicts.length > 0) {
          throw new AmendmentConflictError(plan.conflicts);
        }

        // Get next version number
        const lastVersion = await tx.version.findFirst({
          where: { documentId: document.id },
          orderBy: { versionNumber: 'desc' },
        });
        const versionNumber = (lastVersion?.versionNumber || 0) + 1;

        // Create new version
        const newVersion = await tx.version.create({
          data: {
            documentId: document.id,
            versionNumber,
            effectiveDate,
            notes: `Applied amendment: ${amendment.title}`,
          },
        });

        // Clone sections from current version and build ID map
        const idMap: Record<string, string> = {};

        // First pass: create all sections without parent references
        for (const section of oldSections) {
          const newSection = await tx.section.create({
            data: {
              versionId: newVersion.id,
              parentId: null,
              position: section.position,
              numberLabel: section.numberLabel,
              title: section.title,
              content: section.content,
              annotation: section.annotation,
            },
          });
          idMap[section.id] = newSection.id;
        }

        // Second pass: fix parent references
        for (const section of oldSections) {
          if (section.parentId && idMap[section.parentId]) {
            await tx.section.update({
              where: { id: idMap[section.id] },
              data: { parentId: idMap[section.parentId] },
            });
          }
        }

        // Apply each change, except those to sections an earlier change deleted
        for (const change of sortedChanges) {
          if (!plan.skip.has(change.id)) {
            await this.applyChange(tx, change, newVersion, idMap);
          }
        }

        // The document's other open amendments (drafts and proposals) were written against the
        // version this one replaces: their changes now name its sections by their new ids, so
        // they can still be previewed, moved and applied. A section this one deleted has no new
        // id, and its changes keep the old one (they no longer apply as written).
        await remapOpenAmendments(
          tx,
          amendment.documentId,
          newVersion.id,
          oldSections,
          idMap,
          amendment.id,
        );

        // Record the resulting version. The decision date stays the vote's, not the apply's.
        await tx.amendment.update({
          where: { id: amendment.id },
          data: {
            resultingVersionId: newVersion.id,
            ...(amendment.decidedAt ? {} : { decidedAt: new Date() }),
          },
        });

        // Update document's current version
        await tx.document.update({
          where: { id: document.id },
          data: { currentVersionId: newVersion.id },
        });

        return newVersion;
      },
      { timeout: 30_000 },
    );
  }

  private async applyChange(
    tx: Tx,
    change: AmendmentChange,
    version: Version,
    idMap: Record<string, string>,
  ): Promise<void> {
    switch (change.changeType) {
      case 'add':
        await this.applyAdd(tx, change, version, idMap);
        break;
      case 'modify':
        await this.applyModify(tx, change, idMap);
        break;
      case 'delete':
        await this.applyDelete(tx, change, idMap);
        break;
      case 'renumber':
        await this.applyRenumber(tx, change, idMap);
        break;
    }
  }

  private async applyAdd(
    tx: Tx,
    change: AmendmentChange,
    version: Version,
    idMap: Record<string, string>,
  ): Promise<void> {
    // Determine parent in new version
    let newParentId: string | null = null;
    if (change.targetSectionId) {
      newParentId = idMap[change.targetSectionId] || null;
    }

    // Find max position among siblings
    const siblings = await tx.section.findMany({
      where: {
        versionId: version.id,
        parentId: newParentId,
      },
    });
    const maxPosition = siblings.length > 0 ? Math.max(...siblings.map((s) => s.position)) : -1;

    await tx.section.create({
      data: {
        versionId: version.id,
        parentId: newParentId,
        position: maxPosition + 1,
        numberLabel: change.newNumberLabel,
        title: change.newTitle,
        content: change.newContent,
      },
    });
  }

  private async applyModify(
    tx: Tx,
    change: AmendmentChange,
    idMap: Record<string, string>,
  ): Promise<void> {
    if (!change.targetSectionId) return;

    const newSectionId = idMap[change.targetSectionId];
    if (!newSectionId) return;

    const updateData: Prisma.SectionUpdateInput = {};
    if (change.newContent !== null) updateData.content = change.newContent;
    if (change.newTitle !== null) updateData.title = change.newTitle;
    if (change.newNumberLabel !== null) updateData.numberLabel = change.newNumberLabel;

    if (Object.keys(updateData).length > 0) {
      await tx.section.update({
        where: { id: newSectionId },
        data: updateData,
      });
    }
  }

  private async applyDelete(
    tx: Tx,
    change: AmendmentChange,
    idMap: Record<string, string>,
  ): Promise<void> {
    if (!change.targetSectionId) return;

    const newSectionId = idMap[change.targetSectionId];
    if (!newSectionId) return;

    await tx.section.delete({ where: { id: newSectionId } });
  }

  private async applyRenumber(
    tx: Tx,
    change: AmendmentChange,
    idMap: Record<string, string>,
  ): Promise<void> {
    if (!change.targetSectionId) return;

    const newSectionId = idMap[change.targetSectionId];
    if (!newSectionId) return;

    if (change.newNumberLabel !== null) {
      await tx.section.update({
        where: { id: newSectionId },
        data: { numberLabel: change.newNumberLabel },
      });
    }
  }

  async previewAmendment(amendment: AmendmentWithChanges): Promise<any[]> {
    // Get document
    const document = await prisma.document.findUnique({
      where: { id: amendment.documentId },
    });

    if (!document || !document.currentVersionId) {
      return [];
    }

    // Get current version's sections
    const currentVersion = await prisma.version.findUnique({
      where: { id: document.currentVersionId },
      include: { sections: true },
    });

    if (!currentVersion) {
      return [];
    }

    // The text of a section before the amendment changed it
    type Previous = { numberLabel: string | null; title: string | null; content: string | null };
    const before = (s: {
      numberLabel: string | null;
      title: string | null;
      content: string | null;
    }) => ({ numberLabel: s.numberLabel, title: s.title, content: s.content }) as Previous;

    // Build a mutable copy of the section tree; `previous` is set when a change touches it
    const sectionsCopy = currentVersion.sections.map((s) => ({
      id: s.id,
      parentId: s.parentId,
      position: s.position,
      numberLabel: s.numberLabel,
      title: s.title,
      content: s.content,
      annotation: s.annotation,
      modified: false,
      added: false,
      deleted: false,
      previous: null as Previous | null,
    }));

    // Apply changes to the copy
    const sortedChanges = [...amendment.changes].sort((a, b) => a.position - b.position);

    for (const change of sortedChanges) {
      if (change.changeType === 'add') {
        const parentId = change.targetSectionId;
        const siblings = sectionsCopy.filter((s) => s.parentId === parentId && !s.deleted);
        const maxPos = siblings.length > 0 ? Math.max(...siblings.map((s) => s.position)) : -1;

        sectionsCopy.push({
          id: `new-${change.id}`,
          parentId: parentId,
          position: maxPos + 1,
          numberLabel: change.newNumberLabel,
          title: change.newTitle,
          content: change.newContent,
          annotation: null,
          modified: false,
          added: true,
          deleted: false,
          previous: null,
        });
      } else if (change.changeType === 'modify') {
        const section = sectionsCopy.find((s) => s.id === change.targetSectionId);
        if (section) {
          // Two changes to one section: the text from before is the version's
          section.previous ??= before(section);
          if (change.newContent !== null) section.content = change.newContent;
          if (change.newTitle !== null) section.title = change.newTitle;
          if (change.newNumberLabel !== null) section.numberLabel = change.newNumberLabel;
          section.modified = true;
        }
      } else if (change.changeType === 'delete') {
        const markDeleted = (sectionId: string | null) => {
          const section = sectionsCopy.find((s) => s.id === sectionId);
          if (section) {
            section.deleted = true;
            // Also delete children
            sectionsCopy
              .filter((s) => s.parentId === sectionId)
              .forEach((child) => markDeleted(child.id));
          }
        };
        markDeleted(change.targetSectionId);
      } else if (change.changeType === 'renumber') {
        const section = sectionsCopy.find((s) => s.id === change.targetSectionId);
        if (section && change.newNumberLabel !== null) {
          section.previous ??= before(section);
          section.numberLabel = change.newNumberLabel;
          section.modified = true;
        }
      }
    }

    // Build tree from flat list
    const buildTree = (parentId: string | null = null): any[] => {
      return sectionsCopy
        .filter((s) => s.parentId === parentId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          ...s,
          children: buildTree(s.id),
        }));
    };

    return buildTree();
  }
}
