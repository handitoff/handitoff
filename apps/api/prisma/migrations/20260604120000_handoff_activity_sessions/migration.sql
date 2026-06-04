CREATE TABLE "handoff_sessions" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT,
  "public_code" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'standard',
  "tier" TEXT NOT NULL DEFAULT 'free',
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "pairing_expires_at" TIMESTAMPTZ(6),
  "active_expires_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  "end_reason" TEXT,
  "participant_count" INTEGER NOT NULL DEFAULT 1,
  "connected_device_count" INTEGER NOT NULL DEFAULT 1,
  "transfer_count" INTEGER NOT NULL DEFAULT 0,
  "file_count" INTEGER NOT NULL DEFAULT 0,
  "total_size" BIGINT NOT NULL DEFAULT 0,
  "connection_type" TEXT,
  "success" BOOLEAN,
  "failure_reason" TEXT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "handoff_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "handoff_participants" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "user_id" TEXT,
  "device_id" TEXT NOT NULL,
  "device_label" TEXT NOT NULL,
  "device_type" TEXT,
  "browser" TEXT,
  "operating_system" TEXT,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "joined_at" TIMESTAMPTZ(6) NOT NULL,
  "approved_at" TIMESTAMPTZ(6),
  "disconnected_at" TIMESTAMPTZ(6),
  "left_at" TIMESTAMPTZ(6),
  CONSTRAINT "handoff_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "handoff_transfers" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "sender_participant_id" TEXT,
  "receiver_participant_id" TEXT,
  "status" TEXT NOT NULL,
  "file_count" INTEGER NOT NULL DEFAULT 0,
  "total_size" BIGINT NOT NULL DEFAULT 0,
  "size_bucket" TEXT,
  "connection_type" TEXT,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "failure_stage" TEXT,
  "duration_ms" INTEGER,
  CONSTRAINT "handoff_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "handoff_activity" (
  "id" BIGSERIAL NOT NULL,
  "user_id" TEXT,
  "session_id" TEXT NOT NULL,
  "transfer_id" TEXT,
  "event_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "file_count" INTEGER,
  "total_size" BIGINT,
  "size_bucket" TEXT,
  "device_label" TEXT,
  "peer_label" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoff_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "handoff_sessions_owner_updated_idx" ON "handoff_sessions"("owner_user_id", "updated_at" DESC);
CREATE INDEX "handoff_sessions_status_idx" ON "handoff_sessions"("status");
CREATE UNIQUE INDEX "handoff_participants_session_device_key" ON "handoff_participants"("session_id", "device_id");
CREATE INDEX "handoff_participants_user_id_idx" ON "handoff_participants"("user_id");
CREATE INDEX "handoff_transfers_session_id_idx" ON "handoff_transfers"("session_id");
CREATE INDEX "handoff_activity_user_created_idx" ON "handoff_activity"("user_id", "created_at" DESC);
CREATE INDEX "handoff_activity_session_id_idx" ON "handoff_activity"("session_id");

ALTER TABLE "handoff_sessions" ADD CONSTRAINT "handoff_sessions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "account_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "handoff_participants" ADD CONSTRAINT "handoff_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "handoff_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "handoff_participants" ADD CONSTRAINT "handoff_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "handoff_transfers" ADD CONSTRAINT "handoff_transfers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "handoff_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "handoff_activity" ADD CONSTRAINT "handoff_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "handoff_activity" ADD CONSTRAINT "handoff_activity_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "handoff_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
