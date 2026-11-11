-- RC-4: reconcile proven drift without rewriting migration history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
LOCK TABLE conversations, messages, zalo_accounts, media_assets
  IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM messages m LEFT JOIN conversations c ON c.id = m.conversation_id
    WHERE c.id IS NULL OR (m.org_id IS NOT NULL AND m.org_id <> c.org_id)
  ) THEN
    RAISE EXCEPTION 'RC-4 Message tenant is orphaned or inconsistent; investigate before retry';
  END IF;
  IF EXISTS (
    SELECT 1 FROM media_assets m LEFT JOIN zalo_accounts z ON z.id = m.source_zalo_account_id
    WHERE m.source_zalo_account_id IS NOT NULL AND (z.id IS NULL OR z.org_id <> m.org_id)
  ) THEN
    RAISE EXCEPTION 'RC-4 Media source is orphaned or cross-tenant; investigate before retry';
  END IF;
END $$;
-- Only a trusted existing conversation determines a legacy message tenant.
UPDATE messages m SET org_id = c.org_id FROM conversations c
WHERE m.conversation_id = c.id AND m.org_id IS NULL;
ALTER TABLE messages VALIDATE CONSTRAINT messages_org_id_conversation_id_fkey;
ALTER TABLE messages ALTER COLUMN org_id SET NOT NULL;
-- Change future defaults only; preserve every configured delay.
ALTER TABLE automation_triggers ALTER COLUMN welcome_delay_seconds SET DEFAULT 1;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_source_zalo_account_id_fkey
  FOREIGN KEY (source_zalo_account_id) REFERENCES zalo_accounts(id)
  ON DELETE SET NULL ON UPDATE CASCADE;
-- An ID-only FK retains SET NULL semantics but cannot enforce same tenant.
CREATE FUNCTION media_source_org_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_zalo_account_id IS NOT NULL THEN
    PERFORM 1 FROM zalo_accounts
      WHERE id = NEW.source_zalo_account_id AND org_id = NEW.org_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Media source organization mismatch' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_assets_source_org_guard
  BEFORE INSERT OR UPDATE OF source_zalo_account_id, org_id ON media_assets
  FOR EACH ROW EXECUTE FUNCTION media_source_org_guard();
CREATE FUNCTION media_source_account_org_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id AND EXISTS (
    SELECT 1 FROM media_assets WHERE source_zalo_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot move a media source to another organization' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zalo_accounts_media_source_org_guard
  BEFORE UPDATE OF org_id ON zalo_accounts
  FOR EACH ROW EXECUTE FUNCTION media_source_account_org_guard();
COMMIT;
