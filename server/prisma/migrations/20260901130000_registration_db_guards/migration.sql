-- Enforce registration integrity at the database level:
--   1. A registration number (government plate reg no) must be globally unique.
--      The app checks this already (checkDuplicateRegNumber); the unique
--      constraint closes the race window under concurrent writes / bulk import.
--   2. At most ONE live registration per vehicle. "Live" = ACTIVE or
--      PENDING_RENEWAL (both are current/operational). This complements the
--      service-level supersede/auto-archive rule so duplicates are impossible
--      even if created outside the service.
ALTER TABLE "VehicleRegistration" ADD CONSTRAINT "VehicleRegistration_regNumber_key" UNIQUE ("regNumber");

CREATE UNIQUE INDEX "VehicleRegistration_live_per_vehicle_idx" ON "VehicleRegistration"("vehicleId") WHERE "status" IN ('ACTIVE', 'PENDING_RENEWAL');