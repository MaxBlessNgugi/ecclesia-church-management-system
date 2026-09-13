-- Both were written on every send but never read: the Celebrations tab matches a
-- greeting to its member and occasion by (christianId, kind, occasionDate), so it
-- resolves the name from the occasion entry, and nothing reports who sent one.
ALTER TABLE "celebration_greetings" DROP COLUMN IF EXISTS "christianName";
ALTER TABLE "celebration_greetings" DROP COLUMN IF EXISTS "sentByName";
