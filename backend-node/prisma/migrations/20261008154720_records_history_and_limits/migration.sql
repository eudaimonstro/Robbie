-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "SignInCode" ADD COLUMN     "requestedFrom" TEXT;

-- CreateTable
CREATE TABLE "MinutesRevision" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedById" INTEGER,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinutesRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" INTEGER,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MinutesRevision_minutesId_editedAt_idx" ON "MinutesRevision"("minutesId", "editedAt");

-- CreateIndex
CREATE INDEX "AuditEntry_organizationId_createdAt_idx" ON "AuditEntry"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SignInCode_requestedFrom_createdAt_idx" ON "SignInCode"("requestedFrom", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Version_documentId_versionNumber_key" ON "Version"("documentId", "versionNumber");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutesRevision" ADD CONSTRAINT "MinutesRevision_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "Minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutesRevision" ADD CONSTRAINT "MinutesRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
