-- The composer's template library inserts text into the message body; the
-- chosen template name was never recorded (every write sent an empty string),
-- so the column only implied a report the panel does not produce.
ALTER TABLE "broadcasts" DROP COLUMN IF EXISTS "template";
