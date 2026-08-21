-- AlterTable
ALTER TABLE "TraceEvent" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT '';

-- Backfill from parent ReviewJob
UPDATE "TraceEvent" AS t
SET "organizationId" = r."organizationId"
FROM "ReviewJob" AS r
WHERE t."jobId" = r."id";

-- Drop default after backfill (new rows must set organizationId explicitly)
ALTER TABLE "TraceEvent" ALTER COLUMN "organizationId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "TraceEvent_organizationId_startedAt_idx" ON "TraceEvent"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "TraceEvent_jobId_step_status_idx" ON "TraceEvent"("jobId", "step", "status");
