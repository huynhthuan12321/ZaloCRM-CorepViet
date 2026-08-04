ALTER TABLE "broadcast_jobs"
ADD COLUMN "friend_labels" TEXT[] NOT NULL DEFAULT '{}';
