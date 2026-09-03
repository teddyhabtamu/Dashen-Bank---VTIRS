-- AlterTable
-- Additive nullable column for driver license expiry tracking. IF NOT EXISTS
-- keeps this safe to apply on the live database out of band and to replay on
-- fresh branches.
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS     "licenseExpiry" TIMESTAMP(3);
