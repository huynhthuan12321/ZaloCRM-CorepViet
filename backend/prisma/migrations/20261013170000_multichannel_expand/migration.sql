-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channel_account_id" TEXT,
ADD COLUMN     "thread_kind" TEXT NOT NULL DEFAULT 'dm';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "channel_send_state" TEXT,
ADD COLUMN     "external_message_id" TEXT,
ADD COLUMN     "observed_at" TIMESTAMP(3),
ADD COLUMN     "org_id" TEXT;

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_account_id" TEXT,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "inbound_enabled" BOOLEAN NOT NULL DEFAULT false,
    "outbound_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_account_access" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_account_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_session_refs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "profile_ref" TEXT NOT NULL,
    "epoch" BIGINT NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "browser_session_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_identities" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "epoch" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_commands" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_account_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "epoch" BIGINT,
    "external_message_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_accounts_org_id_owner_user_id_idx" ON "channel_accounts"("org_id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_org_id_id_key" ON "channel_accounts"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_org_id_provider_external_account_id_key" ON "channel_accounts"("org_id", "provider", "external_account_id");

-- CreateIndex
CREATE INDEX "channel_account_access_org_id_user_id_idx" ON "channel_account_access"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_account_access_channel_account_id_user_id_key" ON "channel_account_access"("channel_account_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "browser_session_refs_channel_account_id_key" ON "browser_session_refs"("channel_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "browser_session_refs_org_id_channel_account_id_key" ON "browser_session_refs"("org_id", "channel_account_id");

-- CreateIndex
CREATE INDEX "contact_identities_org_id_contact_id_idx" ON "contact_identities"("org_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_identities_channel_account_id_external_user_id_key" ON "contact_identities"("channel_account_id", "external_user_id");

-- CreateIndex
CREATE INDEX "channel_events_org_id_status_created_at_idx" ON "channel_events"("org_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_events_channel_account_id_event_key_key" ON "channel_events"("channel_account_id", "event_key");

-- CreateIndex
CREATE INDEX "outbound_commands_org_id_status_created_at_idx" ON "outbound_commands"("org_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_commands_channel_account_id_idempotency_key_key" ON "outbound_commands"("channel_account_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_id_key" ON "users"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_org_id_id_key" ON "contacts"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_org_id_id_key" ON "conversations"("org_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_channel_account_id_external_thread_id_key" ON "conversations"("channel_account_id", "external_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_org_id_channel_account_id_id_key" ON "conversations"("org_id", "channel_account_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_external_message_id_key" ON "messages"("conversation_id", "external_message_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_channel_account_id_fkey" FOREIGN KEY ("org_id", "channel_account_id") REFERENCES "channel_accounts"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_org_id_owner_user_id_fkey" FOREIGN KEY ("org_id", "owner_user_id") REFERENCES "users"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_account_access" ADD CONSTRAINT "channel_account_access_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_account_access" ADD CONSTRAINT "channel_account_access_org_id_channel_account_id_fkey" FOREIGN KEY ("org_id", "channel_account_id") REFERENCES "channel_accounts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_account_access" ADD CONSTRAINT "channel_account_access_org_id_user_id_fkey" FOREIGN KEY ("org_id", "user_id") REFERENCES "users"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_session_refs" ADD CONSTRAINT "browser_session_refs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_session_refs" ADD CONSTRAINT "browser_session_refs_org_id_channel_account_id_fkey" FOREIGN KEY ("org_id", "channel_account_id") REFERENCES "channel_accounts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_org_id_channel_account_id_fkey" FOREIGN KEY ("org_id", "channel_account_id") REFERENCES "channel_accounts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_org_id_contact_id_fkey" FOREIGN KEY ("org_id", "contact_id") REFERENCES "contacts"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_org_id_channel_account_id_fkey" FOREIGN KEY ("org_id", "channel_account_id") REFERENCES "channel_accounts"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_commands" ADD CONSTRAINT "outbound_commands_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_commands" ADD CONSTRAINT "outbound_commands_org_id_channel_account_id_fkey" FOREIGN KEY ("org_id", "channel_account_id") REFERENCES "channel_accounts"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_commands" ADD CONSTRAINT "outbound_commands_org_id_channel_account_id_conversation_i_fkey" FOREIGN KEY ("org_id", "channel_account_id", "conversation_id") REFERENCES "conversations"("org_id", "channel_account_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_commands" ADD CONSTRAINT "outbound_commands_org_id_requested_by_user_id_fkey" FOREIGN KEY ("org_id", "requested_by_user_id") REFERENCES "users"("org_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
