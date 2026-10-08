-- CreateEnum
CREATE TYPE "BylawAmendmentVote" AS ENUM ('twoThirdsCast', 'majorityCast', 'majorityMembers', 'twoThirdsMembers');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "bylawAmendmentVote" "BylawAmendmentVote" NOT NULL DEFAULT 'twoThirdsCast';
