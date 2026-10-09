-- DropForeignKey
ALTER TABLE "MeetingNotice" DROP CONSTRAINT "MeetingNotice_packetId_fkey";

-- AlterTable
ALTER TABLE "MeetingNotice" ALTER COLUMN "packetId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MeetingNotice" ADD CONSTRAINT "MeetingNotice_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "MeetingPacket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
