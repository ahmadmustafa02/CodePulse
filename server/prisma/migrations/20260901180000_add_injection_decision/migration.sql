-- CreateTable
CREATE TABLE IF NOT EXISTS "InjectionDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewJobId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "scoreMalicious" DOUBLE PRECISION NOT NULL,
    "scoreSafe" DOUBLE PRECISION NOT NULL,
    "sources" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InjectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InjectionDecision_organizationId_createdAt_idx"
  ON "InjectionDecision"("organizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "InjectionDecision_reviewJobId_idx"
  ON "InjectionDecision"("reviewJobId");

CREATE INDEX IF NOT EXISTS "InjectionDecision_outcome_createdAt_idx"
  ON "InjectionDecision"("outcome", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "InjectionDecision"
    ADD CONSTRAINT "InjectionDecision_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InjectionDecision"
    ADD CONSTRAINT "InjectionDecision_reviewJobId_fkey"
    FOREIGN KEY ("reviewJobId") REFERENCES "ReviewJob"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
