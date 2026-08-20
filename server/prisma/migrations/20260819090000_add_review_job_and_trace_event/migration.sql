-- CreateTable
CREATE TABLE "ReviewJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveryId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewJob_repoId_prNumber_headSha_key" ON "ReviewJob"("repoId", "prNumber", "headSha");

-- CreateIndex
CREATE INDEX "ReviewJob_organizationId_status_idx" ON "ReviewJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ReviewJob_status_createdAt_idx" ON "ReviewJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TraceEvent_jobId_startedAt_idx" ON "TraceEvent"("jobId", "startedAt");

-- AddForeignKey
ALTER TABLE "ReviewJob" ADD CONSTRAINT "ReviewJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewJob" ADD CONSTRAINT "ReviewJob_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceEvent" ADD CONSTRAINT "TraceEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ReviewJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
