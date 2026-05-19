-- CreateEnum
CREATE TYPE "DeploymentState" AS ENUM ('ACTIVE', 'QUARANTINED');

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "deploymentState" "DeploymentState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "lastIncidentPr" TEXT;

-- CreateTable
CREATE TABLE "AgentTrace" (
    "id" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTrace_repositoryId_prNumber_idx" ON "AgentTrace"("repositoryId", "prNumber");

-- CreateIndex
CREATE INDEX "AgentTrace_createdAt_idx" ON "AgentTrace"("createdAt");

-- AddForeignKey
ALTER TABLE "AgentTrace" ADD CONSTRAINT "AgentTrace_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
