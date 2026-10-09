-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "quorumCount" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrganizationInvite" ADD COLUMN     "emailed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT;
