-- Task assignees become many-to-many (mixing real team members and external
-- Contacts) instead of a single nullable assigneeId/contactAssigneeId. This
-- migration creates the new join tables, COPIES existing single-assignee data
-- into them, and only then drops the old columns — no data loss.

-- CreateTable
CREATE TABLE "_TaskAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TaskContactAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Copy existing single-assignee data into the new join tables.
INSERT INTO "_TaskAssignees" ("A", "B")
SELECT "id", "assigneeId" FROM "Task" WHERE "assigneeId" IS NOT NULL;

INSERT INTO "_TaskContactAssignees" ("A", "B")
SELECT "contactAssigneeId", "id" FROM "Task" WHERE "contactAssigneeId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "_TaskAssignees_AB_unique" ON "_TaskAssignees"("A", "B");

-- CreateIndex
CREATE INDEX "_TaskAssignees_B_index" ON "_TaskAssignees"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TaskContactAssignees_AB_unique" ON "_TaskContactAssignees"("A", "B");

-- CreateIndex
CREATE INDEX "_TaskContactAssignees_B_index" ON "_TaskContactAssignees"("B");

-- AddForeignKey
ALTER TABLE "_TaskAssignees" ADD CONSTRAINT "_TaskAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskAssignees" ADD CONSTRAINT "_TaskAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskContactAssignees" ADD CONSTRAINT "_TaskContactAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskContactAssignees" ADD CONSTRAINT "_TaskContactAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Now safe to drop the old single-assignee columns.

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_contactAssigneeId_fkey";

-- DropIndex
DROP INDEX "Task_assigneeId_idx";

-- DropIndex
DROP INDEX "Task_contactAssigneeId_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "assigneeId",
DROP COLUMN "contactAssigneeId";
