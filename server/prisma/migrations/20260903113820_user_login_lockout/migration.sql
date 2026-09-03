-- AlterTable
-- Additive sign-in security metadata. IF NOT EXISTS keeps this safe to apply
-- on the live database out of band and to replay on fresh branches.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS     "lastFailedLoginAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "lockedUntil" TIMESTAMP(3);
