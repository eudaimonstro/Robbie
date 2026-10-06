-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('bylaws', 'standing_rules', 'policy', 'minutes');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('uploaded_file', 'bylawyer_document');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('draft', 'proposed', 'passed', 'failed', 'tabled', 'withdrawn');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('add', 'modify', 'delete', 'renumber');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('regular', 'special', 'annual', 'emergency');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "VoteResult" AS ENUM ('passed', 'failed', 'tabled');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "docType" "DocType" NOT NULL DEFAULT 'bylaws',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareToken" TEXT,
    "shareEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "adoptedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "numberLabel" TEXT,
    "title" TEXT,
    "content" TEXT,
    "annotation" TEXT,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amendment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'draft',
    "proposedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "resultingVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "robbieMeetingCode" TEXT,
    "robbieMotionId" INTEGER,
    "robbieVoteData" JSONB,

    CONSTRAINT "Amendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmendmentChange" (
    "id" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "targetSectionId" TEXT,
    "newContent" TEXT,
    "newNumberLabel" TEXT,
    "newTitle" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AmendmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Meeting',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "meetingType" "MeetingType" NOT NULL DEFAULT 'regular',
    "location" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "yeaCount" INTEGER NOT NULL DEFAULT 0,
    "nayCount" INTEGER NOT NULL DEFAULT 0,
    "abstainCount" INTEGER NOT NULL DEFAULT 0,
    "result" "VoteResult" NOT NULL,
    "requires" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingPacket" (
    "id" TEXT NOT NULL,
    "robbieCode" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedMinutes" INTEGER,
    "presenter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storagePath" TEXT,
    "documentId" TEXT,
    "versionId" TEXT,
    "meetingPacketId" TEXT,
    "agendaItemId" TEXT,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Document_shareToken_key" ON "Document"("shareToken");

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");

-- CreateIndex
CREATE INDEX "Version_documentId_effectiveDate_idx" ON "Version"("documentId", "effectiveDate");

-- CreateIndex
CREATE INDEX "Section_versionId_parentId_position_idx" ON "Section"("versionId", "parentId", "position");

-- CreateIndex
CREATE INDEX "Amendment_documentId_status_idx" ON "Amendment"("documentId", "status");

-- CreateIndex
CREATE INDEX "Amendment_robbieMeetingCode_idx" ON "Amendment"("robbieMeetingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Amendment_robbieMeetingCode_robbieMotionId_key" ON "Amendment"("robbieMeetingCode", "robbieMotionId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingPacket_robbieCode_key" ON "MeetingPacket"("robbieCode");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_packetId_position_idx" ON "MeetingAgendaItem"("packetId", "position");

-- CreateIndex
CREATE INDEX "Attachment_meetingPacketId_idx" ON "Attachment"("meetingPacketId");

-- CreateIndex
CREATE INDEX "Attachment_agendaItemId_idx" ON "Attachment"("agendaItemId");

-- CreateIndex
CREATE INDEX "Attachment_documentId_idx" ON "Attachment"("documentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmendmentChange" ADD CONSTRAINT "AmendmentChange_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "Amendment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "Amendment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "MeetingPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_meetingPacketId_fkey" FOREIGN KEY ("meetingPacketId") REFERENCES "MeetingPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
