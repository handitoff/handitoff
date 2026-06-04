CREATE TABLE "account_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "device_type" TEXT,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_devices_pkey" PRIMARY KEY ("user_id", "id")
);

CREATE INDEX "account_devices_user_removed_idx" ON "account_devices"("user_id", "removed_at");
CREATE INDEX "account_devices_last_seen_at_idx" ON "account_devices"("last_seen_at" DESC);

ALTER TABLE "account_devices"
ADD CONSTRAINT "account_devices_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "account_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
