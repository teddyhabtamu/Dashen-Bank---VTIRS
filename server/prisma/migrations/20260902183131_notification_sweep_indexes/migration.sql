-- Indexes supporting the hourly notification sweep:
--   (userId, type, link) — shouldCreate()'s findFirst dedupe lookup
--   (link)              — resolveRemindersForVehicle()'s deleteMany
--
-- Already applied out-of-band on the live database via `prisma db execute`
-- (a CONCURRENTLY build is not possible through Prisma Migrate's transactional
-- shadow DB). IF NOT EXISTS keeps this idempotent for environments that have
-- not seen it yet (e.g. fresh preview branches).

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_type_link_idx" ON "Notification"("userId", "type", "link");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_link_idx" ON "Notification"("link");
