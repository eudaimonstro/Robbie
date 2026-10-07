-- AlterTable
ALTER TABLE "MeetingPacket" ADD COLUMN     "chairUserId" INTEGER,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "eligibleVoters" INTEGER,
ADD COLUMN     "quorumCount" INTEGER DEFAULT 3,
ADD COLUMN     "quorumPercent" INTEGER;

-- AddForeignKey
ALTER TABLE "MeetingPacket" ADD CONSTRAINT "MeetingPacket_chairUserId_fkey" FOREIGN KEY ("chairUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
