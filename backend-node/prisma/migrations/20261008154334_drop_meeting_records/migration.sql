/*
  Warnings:

  - You are about to drop the `Meeting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Vote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_amendmentId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_meetingId_fkey";

-- DropTable
DROP TABLE "Meeting";

-- DropTable
DROP TABLE "Vote";

-- DropEnum
DROP TYPE "MeetingStatus";

-- DropEnum
DROP TYPE "MeetingType";

-- DropEnum
DROP TYPE "VoteResult";
