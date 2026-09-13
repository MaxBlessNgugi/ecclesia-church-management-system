-- One row per greeting actually sent to a member, so the Celebrations tab can
-- show \"greeted\" and avoid sending the same birthday/anniversary greeting
-- twice. Soft-deletable like every other mutable row.
CREATE TABLE "celebration_greetings" (
    "id" TEXT NOT NULL,
    "christianId" TEXT NOT NULL,
    "christianName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occasionDate" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "sentByName" TEXT NOT NULL DEFAULT '',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "celebration_greetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "celebration_greetings_christianId_kind_occasionDate_key" ON "celebration_greetings"("christianId", "kind", "occasionDate");

-- CreateIndex
CREATE INDEX "celebration_greetings_occasionDate_idx" ON "celebration_greetings"("occasionDate");
