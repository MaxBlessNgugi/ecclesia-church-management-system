// =============================================================================
// Singleton seeder — `npx tsx prisma/seed-singletons.ts`
// -----------------------------------------------------------------------------
// Creates the two default singleton rows that every install needs:
//   1. panel_permissions   (id 'default') — full panel + action access
//   2. push_payment_settings (id 'default') — empty settings row
//
// This is the "no-admin" half of prisma/seed.ts: it is used when generating
// a fresh PostgreSQL database) and by nothing else at runtime — the first-run bootstrap endpoint
// (POST /api/auth/bootstrap) also ensures these rows exist. The admin account
// itself is created interactively by the parish on first launch, so no random
// password is ever printed to an invisible console.
// =============================================================================
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  // Default panel permissions (full access) — mirrors seed.ts
  await prisma.panelPermissions.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      panels: {
        christian: true,
        activities: true,
        sacraments: true,
        finance: true,
        ledgers: true,
        inventory: true,
        reports: true,
        hr: true,
        administration: true,
      },
      actions: { view: true, edit: true, delete: true },
    },
    update: {},
  });

  // Default push payment settings (empty) — mirrors seed.ts
  await prisma.pushPaymentSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  console.log('Singletons ensured.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
