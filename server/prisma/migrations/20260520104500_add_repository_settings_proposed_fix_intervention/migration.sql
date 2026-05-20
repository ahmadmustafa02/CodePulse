-- CreateTable
CREATE TABLE "RepositorySettings" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "teamLeadEmail" TEXT,
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RepositorySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepositorySettings_repositoryId_key" ON "RepositorySettings"("repositoryId");

-- AddForeignKey
ALTER TABLE "RepositorySettings" ADD CONSTRAINT "RepositorySettings_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ProposedCodeFix" (
    "id" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "beforeCode" TEXT NOT NULL,
    "afterCode" TEXT NOT NULL,
    "lineHunk" TEXT NOT NULL,

    CONSTRAINT "ProposedCodeFix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposedCodeFix_pullRequestId_idx" ON "ProposedCodeFix"("pullRequestId");

-- AddForeignKey
ALTER TABLE "ProposedCodeFix" ADD CONSTRAINT "ProposedCodeFix_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CustomIntervention" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "targetPillar" TEXT NOT NULL,
    "lessonTitle" TEXT NOT NULL,
    "lessonMarkdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "targetSunday" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomIntervention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomIntervention_developerId_idx" ON "CustomIntervention"("developerId");

-- CreateIndex
CREATE INDEX "CustomIntervention_status_idx" ON "CustomIntervention"("status");

-- CreateIndex
CREATE INDEX "CustomIntervention_targetSunday_idx" ON "CustomIntervention"("targetSunday");

-- AddForeignKey
ALTER TABLE "CustomIntervention" ADD CONSTRAINT "CustomIntervention_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
