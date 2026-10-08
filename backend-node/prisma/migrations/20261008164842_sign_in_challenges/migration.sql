-- AlterTable
ALTER TABLE "SignInCode" ADD COLUMN     "challengeHash" TEXT;

-- CreateIndex
CREATE INDEX "SignInCode_email_challengeHash_idx" ON "SignInCode"("email", "challengeHash");
