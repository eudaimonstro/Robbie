-- CreateEnum
CREATE TYPE "MinutesStatus" AS ENUM ('draft', 'published', 'approved');

-- AlterTable
ALTER TABLE "MeetingPacket" ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago';

-- CreateTable
CREATE TABLE "Minutes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "status" "MinutesStatus" NOT NULL DEFAULT 'draft',
    "body" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "approvedAtPacketId" TEXT,
    "corrections" TEXT,

    CONSTRAINT "Minutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Minutes_packetId_key" ON "Minutes"("packetId");

-- CreateIndex
CREATE INDEX "Minutes_organizationId_status_idx" ON "Minutes"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "MeetingPacket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_approvedAtPacketId_fkey" FOREIGN KEY ("approvedAtPacketId") REFERENCES "MeetingPacket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
