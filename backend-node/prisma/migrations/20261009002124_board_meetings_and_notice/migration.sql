-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('members', 'board');

-- AlterTable
ALTER TABLE "MeetingPacket" ADD COLUMN     "kind" "MeetingKind" NOT NULL DEFAULT 'members',
ADD COLUMN     "noticeSentAt" TIMESTAMP(3),
ADD COLUMN     "noticeSentById" INTEGER;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "boardQuorum" INTEGER;

-- AlterTable
ALTER TABLE "OrganizationMember" ADD COLUMN     "isDirector" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MeetingNotice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "sentById" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeetingNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingNotice_organizationId_sentAt_idx" ON "MeetingNotice"("organizationId", "sentAt");

-- CreateIndex
CREATE INDEX "MeetingNotice_packetId_idx" ON "MeetingNotice"("packetId");

-- AddForeignKey
ALTER TABLE "MeetingPacket" ADD CONSTRAINT "MeetingPacket_noticeSentById_fkey" FOREIGN KEY ("noticeSentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingNotice" ADD CONSTRAINT "MeetingNotice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingNotice" ADD CONSTRAINT "MeetingNotice_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "MeetingPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingNotice" ADD CONSTRAINT "MeetingNotice_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
