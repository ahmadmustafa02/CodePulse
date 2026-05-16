-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "githubUserId" BIGINT NOT NULL,
    "avatarUrl" TEXT,
    "email" TEXT,
    "installationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubLogin_key" ON "User"("githubLogin");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubUserId_key" ON "User"("githubUserId");
