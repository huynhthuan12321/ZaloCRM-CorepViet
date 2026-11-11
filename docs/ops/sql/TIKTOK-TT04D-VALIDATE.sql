-- TT04-D2: deliberately outside automatic migrations. Run ONLY after staged backfill,
-- backup/restore evidence and explicit migration authorization. No credentials in this file.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id
    WHERE m.org_id IS NULL OR c.id IS NULL OR m.org_id <> c.org_id) THEN
    RAISE EXCEPTION 'Message tenant backfill incomplete or inconsistent';
  END IF;
END $$;
ALTER TABLE messages VALIDATE CONSTRAINT messages_org_id_conversation_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_org_not_null CHECK (org_id IS NOT NULL) NOT VALID;
ALTER TABLE messages VALIDATE CONSTRAINT messages_org_not_null;
ALTER TABLE messages ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE messages DROP CONSTRAINT messages_org_not_null;
COMMIT;
