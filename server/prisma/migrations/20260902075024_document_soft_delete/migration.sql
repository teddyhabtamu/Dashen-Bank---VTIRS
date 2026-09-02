-- AlterTable
ALTER TABLE "VehicleDocument" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "VehicleImage" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;
