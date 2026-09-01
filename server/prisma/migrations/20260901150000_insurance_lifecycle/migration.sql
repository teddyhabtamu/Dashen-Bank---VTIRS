-- Enforce insurance integrity at the database level:
--   1. A policy number is globally unique (the app checks this too; the unique
--      constraint closes the race window under concurrent writes / bulk import).
--   2. At most ONE in-force (ACTIVE) policy per vehicle at a time. The service
--      level already cancels (supersedes) an existing ACTIVE policy when a new
--      one is confirmed; this index makes it impossible to have two ACTIVE
--      policies for the same vehicle even outside the service.
--
-- Stage 1: add the status column (default ACTIVE, matching all existing rows).
ALTER TABLE "VehicleInsurance" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- Stage 2: normalize existing data before constraints are added.
--   - anything already past expiry is EXPIRED;
--   - where a vehicle has more than one ACTIVE policy, keep only the latest
--     (max endDate) and mark the older ones CANCELLED (superseded).
UPDATE "VehicleInsurance" SET "status" = 'EXPIRED' WHERE "endDate" < now();

UPDATE "VehicleInsurance" SET "status" = 'CANCELLED'
WHERE id IN (
  SELECT i.id FROM "VehicleInsurance" i
  INNER JOIN (
    SELECT "vehicleId", max("endDate") AS m
    FROM "VehicleInsurance"
    WHERE "status" = 'ACTIVE'
    GROUP BY "vehicleId"
    HAVING count(*) > 1
  ) d ON d."vehicleId" = i."vehicleId"
  WHERE i."status" = 'ACTIVE' AND i."endDate" < d.m
);

-- Stage 3: constraints (only after backfill so existing data satisfies them).
ALTER TABLE "VehicleInsurance" ADD CONSTRAINT "VehicleInsurance_policyNo_key" UNIQUE ("policyNo");

CREATE UNIQUE INDEX "VehicleInsurance_active_per_vehicle_idx" ON "VehicleInsurance"("vehicleId") WHERE "status" = 'ACTIVE';