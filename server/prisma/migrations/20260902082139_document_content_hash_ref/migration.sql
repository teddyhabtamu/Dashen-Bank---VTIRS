-- AlterTable
ALTER TABLE "VehicleDocument" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "documentRef" TEXT;

-- CreateIndex
CREATE INDEX "VehicleDocument_contentHash_idx" ON "VehicleDocument"("contentHash");

-- CreateIndex
CREATE INDEX "VehicleDocument_documentRef_idx" ON "VehicleDocument"("documentRef");
