-- Email engagement counters on the broadcast (opened / clicked), plus the
-- per-recipient rows that back them. The public tracking routes resolve a
-- recipient row by id, which is what makes an open or click attributable.
ALTER TABLE "broadcasts" ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "broadcasts" ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "error" TEXT,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_recipients_broadcastId_address_key" ON "broadcast_recipients"("broadcastId", "address");

-- CreateIndex
CREATE INDEX "broadcast_recipients_broadcastId_idx" ON "broadcast_recipients"("broadcastId");

-- AddForeignKey
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
