-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dismissed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Notification_dismissed_idx" ON "Notification"("dismissed");
