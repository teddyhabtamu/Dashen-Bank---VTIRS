-- CreateTable
CREATE TABLE "VehicleInsuranceHistory" (
    "id" TEXT NOT NULL,
    "insuranceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "prevStatus" TEXT,
    "newStatus" TEXT,
    "prevStartDate" TIMESTAMP(3),
    "newStartDate" TIMESTAMP(3),
    "prevEndDate" TIMESTAMP(3),
    "newEndDate" TIMESTAMP(3),
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleInsuranceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleInsuranceHistory_vehicleId_idx" ON "VehicleInsuranceHistory"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleInsuranceHistory_insuranceId_idx" ON "VehicleInsuranceHistory"("insuranceId");

-- AddForeignKey
ALTER TABLE "VehicleInsuranceHistory" ADD CONSTRAINT "VehicleInsuranceHistory_insuranceId_fkey" FOREIGN KEY ("insuranceId") REFERENCES "VehicleInsurance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
