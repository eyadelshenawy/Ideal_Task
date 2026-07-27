-- Rename enum value (true rename, preserves existing rows — e.g. the
-- bootstrap admin's role='ADMIN' becomes role='SUPER_ADMIN' automatically).
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "ProjectAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAdmin_userId_projectId_key" ON "ProjectAdmin"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "ProjectAdmin" ADD CONSTRAINT "ProjectAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAdmin" ADD CONSTRAINT "ProjectAdmin_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "contactAssigneeId" TEXT;

-- CreateIndex
CREATE INDEX "Task_contactAssigneeId_idx" ON "Task"("contactAssigneeId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactAssigneeId_fkey" FOREIGN KEY ("contactAssigneeId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
