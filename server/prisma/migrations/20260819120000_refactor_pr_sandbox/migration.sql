-- AlterTable
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "refactorPrEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "refactorPrPerPrCap" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "refactorPrDailyCap" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RefactorAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewJobId" TEXT NOT NULL,
    "sourcePrNumber" INTEGER NOT NULL,
    "sourceHeadSha" TEXT NOT NULL,
    "findingKey" TEXT NOT NULL,
    "findingCategory" TEXT NOT NULL,
    "findingTitle" TEXT NOT NULL,
    "findingFile" TEXT NOT NULL,
    "findingLine" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "refactorPrNumber" INTEGER,
    "refactorPrUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefactorAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RefactorAttempt_organizationId_sourcePrNumber_sourceHeadSha_findingKey_key"
  ON "RefactorAttempt"("organizationId", "sourcePrNumber", "sourceHeadSha", "findingKey");

CREATE INDEX IF NOT EXISTS "RefactorAttempt_organizationId_createdAt_idx"
  ON "RefactorAttempt"("organizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "RefactorAttempt_reviewJobId_idx"
  ON "RefactorAttempt"("reviewJobId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "RefactorAttempt"
    ADD CONSTRAINT "RefactorAttempt_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
