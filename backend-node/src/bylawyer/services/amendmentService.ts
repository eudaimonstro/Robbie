import { prisma } from '../../db/prisma.js';
import { Amendment, AmendmentChange, Section, Version } from '@prisma/client';

export type AmendmentWithChanges = Amendment & { changes: AmendmentChange[] };

export class AmendmentService {
  async applyAmendment(amendment: AmendmentWithChanges, effectiveDate?: Date): Promise<Version> {
    if (amendment.status !== 'passed') {
      throw new Error('Can only apply passed amendments');
    }

    if (amendment.resultingVersionId) {
      throw new Error('Amendment has already been applied');
    }

    // Get the document
    const document = await prisma.document.findUnique({
      where: { id: amendment.documentId },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const oldCurrentVersionId = document.currentVersionId;

    // Get next version number
    const lastVersion = await prisma.version.findFirst({
      where: { documentId: document.id },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (lastVersion?.versionNumber || 0) + 1;

    // Create new version
    const newVersion = await prisma.version.create({
      data: {
        documentId: document.id,
        versionNumber,
        effectiveDate,
        notes: `Applied amendment: ${amendment.title}`,
      },
    });

    // Clone sections from current version and build ID map
    let idMap: Record<string, string> = {};

    if (oldCurrentVersionId) {
      const oldSections = await prisma.section.findMany({
        where: { versionId: oldCurrentVersionId },
      });

      if (oldSections.length > 0) {
        // First pass: create all sections without parent references
        for (const section of oldSections) {
          const newSection = await prisma.section.create({
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
            await prisma.section.update({
              where: { id: idMap[section.id] },
              data: { parentId: idMap[section.parentId] },
            });
          }
        }
      }
    }

    // Apply each change
    const sortedChanges = [...amendment.changes].sort((a, b) => a.position - b.position);
    for (const change of sortedChanges) {
      await this.applyChange(change, newVersion, idMap);
    }

    // Update amendment
    await prisma.amendment.update({
      where: { id: amendment.id },
      data: {
        resultingVersionId: newVersion.id,
        decidedAt: new Date(),
      },
    });

    // Update document's current version
    await prisma.document.update({
      where: { id: document.id },
      data: { currentVersionId: newVersion.id },
    });

    return newVersion;
  }

  private async applyChange(
    change: AmendmentChange,
    version: Version,
    idMap: Record<string, string>,
  ): Promise<void> {
    switch (change.changeType) {
      case 'add':
        await this.applyAdd(change, version, idMap);
        break;
      case 'modify':
        await this.applyModify(change, idMap);
        break;
      case 'delete':
        await this.applyDelete(change, idMap);
        break;
      case 'renumber':
        await this.applyRenumber(change, idMap);
        break;
    }
  }

  private async applyAdd(
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
    const siblings = await prisma.section.findMany({
      where: {
        versionId: version.id,
        parentId: newParentId,
      },
    });
    const maxPosition = siblings.length > 0 ? Math.max(...siblings.map((s) => s.position)) : -1;

    await prisma.section.create({
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

  private async applyModify(change: AmendmentChange, idMap: Record<string, string>): Promise<void> {
    if (!change.targetSectionId) return;

    const newSectionId = idMap[change.targetSectionId];
    if (!newSectionId) return;

    const updateData: any = {};
    if (change.newContent !== null) updateData.content = change.newContent;
    if (change.newTitle !== null) updateData.title = change.newTitle;
    if (change.newNumberLabel !== null) updateData.numberLabel = change.newNumberLabel;

    if (Object.keys(updateData).length > 0) {
      await prisma.section.update({
        where: { id: newSectionId },
        data: updateData,
      });
    }
  }

  private async applyDelete(change: AmendmentChange, idMap: Record<string, string>): Promise<void> {
    if (!change.targetSectionId) return;

    const newSectionId = idMap[change.targetSectionId];
    if (!newSectionId) return;

    await prisma.section.delete({ where: { id: newSectionId } });
  }

  private async applyRenumber(
    change: AmendmentChange,
    idMap: Record<string, string>,
  ): Promise<void> {
    if (!change.targetSectionId) return;

    const newSectionId = idMap[change.targetSectionId];
    if (!newSectionId) return;

    if (change.newNumberLabel !== null) {
      await prisma.section.update({
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

    // Build a mutable copy of the section tree
    const sectionsCopy = currentVersion.sections.map((s) => ({
      id: s.id,
      parent_id: s.parentId,
      position: s.position,
      number_label: s.numberLabel,
      title: s.title,
      content: s.content,
      annotation: s.annotation,
      modified: false,
      added: false,
      deleted: false,
    }));

    // Apply changes to the copy
    const sortedChanges = [...amendment.changes].sort((a, b) => a.position - b.position);

    for (const change of sortedChanges) {
      if (change.changeType === 'add') {
        const parentId = change.targetSectionId;
        const siblings = sectionsCopy.filter((s) => s.parent_id === parentId && !s.deleted);
        const maxPos = siblings.length > 0 ? Math.max(...siblings.map((s) => s.position)) : -1;

        sectionsCopy.push({
          id: `new-${change.id}`,
          parent_id: parentId,
          position: maxPos + 1,
          number_label: change.newNumberLabel,
          title: change.newTitle,
          content: change.newContent,
          annotation: null,
          modified: false,
          added: true,
          deleted: false,
        });
      } else if (change.changeType === 'modify') {
        const section = sectionsCopy.find((s) => s.id === change.targetSectionId);
        if (section) {
          if (change.newContent !== null) section.content = change.newContent;
          if (change.newTitle !== null) section.title = change.newTitle;
          if (change.newNumberLabel !== null) section.number_label = change.newNumberLabel;
          section.modified = true;
        }
      } else if (change.changeType === 'delete') {
        const markDeleted = (sectionId: string | null) => {
          const section = sectionsCopy.find((s) => s.id === sectionId);
          if (section) {
            section.deleted = true;
            // Also delete children
            sectionsCopy
              .filter((s) => s.parent_id === sectionId)
              .forEach((child) => markDeleted(child.id));
          }
        };
        markDeleted(change.targetSectionId);
      } else if (change.changeType === 'renumber') {
        const section = sectionsCopy.find((s) => s.id === change.targetSectionId);
        if (section && change.newNumberLabel !== null) {
          section.number_label = change.newNumberLabel;
          section.modified = true;
        }
      }
    }

    // Build tree from flat list
    const buildTree = (parentId: string | null = null): any[] => {
      return sectionsCopy
        .filter((s) => s.parent_id === parentId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          ...s,
          children: buildTree(s.id),
        }));
    };

    return buildTree();
  }
}
