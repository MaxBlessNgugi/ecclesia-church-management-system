-- Communications panel: announcements, bulk broadcasts, events + RSVPs, and
-- prayer requests. All mutable rows follow the soft-delete convention
-- (isDeleted / deletedAt) used by the rest of the schema.
--
-- Also adds Christian.dateOfBirth, which the registry never captured but the
-- birthday-greetings sub-tab needs. Nullable, so existing rows are unaffected
-- and the panel prompts staff to fill it in where it is missing.

-- AlterTable: nullable date of birth for birthday greetings
ALTER TABLE "christians" ADD COLUMN "dateOfBirth" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "christians_dateOfBirth_idx" ON "christians"("dateOfBirth");

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "audience" TEXT NOT NULL DEFAULT 'Everyone',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "authorName" TEXT NOT NULL DEFAULT '',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_isDeleted_status_idx" ON "announcements"("isDeleted", "status");

-- CreateIndex
CREATE INDEX "announcements_publishAt_idx" ON "announcements"("publishAt");

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'All members',
    "template" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcasts_isDeleted_status_idx" ON "broadcasts"("isDeleted", "status");

-- CreateTable
CREATE TABLE "church_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Service',
    "ministry" TEXT NOT NULL DEFAULT '',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#c65d3b',
    "rsvpRequired" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "church_events_isDeleted_startAt_idx" ON "church_events"("isDeleted", "startAt");

-- CreateTable
CREATE TABLE "event_rsvps" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Going',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_rsvps_eventId_idx" ON "event_rsvps"("eventId");

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "church_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "prayer_requests" (
    "id" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "privacy" TEXT NOT NULL DEFAULT 'Public',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "answeredAt" TIMESTAMP(3),
    "praiseReport" TEXT,
    "prayCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prayer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prayer_requests_isDeleted_status_idx" ON "prayer_requests"("isDeleted", "status");
