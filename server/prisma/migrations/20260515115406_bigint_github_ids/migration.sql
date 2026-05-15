-- AlterTable
ALTER TABLE "Developer" ALTER COLUMN "githubUserId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "PullRequest" ALTER COLUMN "githubPrId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Repository" ALTER COLUMN "githubRepoId" SET DATA TYPE BIGINT;
