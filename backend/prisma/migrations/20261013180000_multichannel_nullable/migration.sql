-- TT04-D1. Review and restore-test first. No application data backfill here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM conversations
    WHERE (zalo_account_id IS NULL) = (channel_account_id IS NULL)) THEN
    RAISE EXCEPTION 'Conversation account XOR preflight failed';
  END IF;
END $$;

ALTER TABLE conversations ALTER COLUMN zalo_account_id DROP NOT NULL;
ALTER TABLE conversations ADD CONSTRAINT conversations_account_xor
  CHECK ((zalo_account_id IS NOT NULL) <> (channel_account_id IS NOT NULL)) NOT VALID;
ALTER TABLE conversations VALIDATE CONSTRAINT conversations_account_xor;

CREATE FUNCTION channel_conversation_contact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.channel_account_id IS NOT NULL AND NEW.contact_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contacts WHERE id=NEW.contact_id AND org_id=NEW.org_id) THEN
    RAISE EXCEPTION 'Channel contact organization mismatch' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conversations_channel_contact_guard BEFORE INSERT OR UPDATE OF contact_id, org_id, channel_account_id
  ON conversations FOR EACH ROW EXECUTE FUNCTION channel_conversation_contact_guard();

CREATE FUNCTION channel_contact_org_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id <> OLD.org_id AND EXISTS (
    SELECT 1 FROM conversations WHERE contact_id=OLD.id AND channel_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot move a linked channel contact to another organization' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contacts_channel_org_guard BEFORE UPDATE OF org_id ON contacts
  FOR EACH ROW EXECUTE FUNCTION channel_contact_org_guard();

-- Derive org for every writer (including old app versions, nested writes and raw SQL).
-- Reject mismatches; do not trust caller-supplied org or rewrite an existing message tenant.
CREATE FUNCTION channel_message_org_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_org text;
BEGIN
  SELECT org_id INTO expected_org FROM conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message conversation missing' USING ERRCODE = '23503';
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id <> expected_org THEN
    RAISE EXCEPTION 'Message organization mismatch' USING ERRCODE = '23503';
  END IF;
  NEW.org_id := expected_org;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_org_guard BEFORE INSERT OR UPDATE OF org_id, conversation_id
  ON messages FOR EACH ROW EXECUTE FUNCTION channel_message_org_guard();

ALTER TABLE messages ADD CONSTRAINT messages_org_id_conversation_id_fkey
  FOREIGN KEY (org_id, conversation_id) REFERENCES conversations(org_id, id)
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
-- The composite FK replaces the legacy conversation-only FK with the same delete semantics.
ALTER TABLE messages DROP CONSTRAINT messages_conversation_id_fkey;
COMMIT;
