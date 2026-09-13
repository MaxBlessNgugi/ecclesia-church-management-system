-- Recipient list for the 'Custom list' broadcast audience. Without it a
-- scheduled broadcast would have no way to resolve its recipients at dispatch
-- time (the audience selector alone cannot carry raw addresses).
ALTER TABLE "broadcasts" ADD COLUMN "customRecipients" JSONB;
