-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_taskId_key" ON "SatisfactionSurvey"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_token_key" ON "SatisfactionSurvey"("token");

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_respondedAt_idx" ON "SatisfactionSurvey"("respondedAt");

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

