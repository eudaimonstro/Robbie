/*
  Warnings:

  - Added the required column `organizationId` to the `MeetingPacket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('viewer', 'member', 'secretary', 'admin', 'owner');

-- AlterTable
ALTER TABLE "Amendment" ADD COLUMN     "createdById" INTEGER;

-- Existing packets have no organization. They are development data: delete them, with their
-- agenda items and attachment records (both cascade), before adding the required column.
-- Their uploaded files stay in the uploads directory.
DELETE FROM "MeetingPacket";

-- AlterTable
ALTER TABLE "MeetingPacket" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "OrgRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "OrganizationInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "invitedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_createdAt_idx" ON "OrganizationInvite"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationInvite_email_idx" ON "OrganizationInvite"("email");

-- CreateIndex
CREATE INDEX "MeetingPacket_organizationId_idx" ON "MeetingPacket"("organizationId");

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPacket" ADD CONSTRAINT "MeetingPacket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
