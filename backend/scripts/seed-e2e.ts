// =============================================================================
// E2E seed — fixed test accounts for the Playwright visual tour
// -----------------------------------------------------------------------------
// The CI e2e job runs against a fresh database; the tour logs in as
// admin@ecclesia.local / Admin123! and viewer@ecclesia.local / Viewer123!.
// The main seeder (prisma/seed.ts) only creates super admins with random
// passwords, so this script provides the deterministic accounts the tests
// expect. Idempotent: safe to run repeatedly (resets the fixed passwords).
//
//   cd backend && DATABASE_URL=... npx tsx scripts/seed-e2e.ts
// =============================================================================
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const E2E_USERS = [
  { email: 'admin@ecclesia.local', password: 'Admin123!', name: 'Administrator', title: 'Administrator', role: 'admin' },
  { email: 'viewer@ecclesia.local', password: 'Viewer123!', name: 'Viewer', title: 'Viewer', role: 'viewer' },
] as const;

async function main() {
  // Mark first-run setup complete so the tour lands on the login screen
  // (a fresh database would otherwise show the setup wizard).
  await prisma.parishSettings.upsert({
    where: { id: 'default' },
    update: { setupCompleted: true },
    create: { id: 'default', setupCompleted: true },
  });

  for (const u of E2E_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, isActive: true, role: u.role },
      });
      console.log(`  ↳ Reset E2E account: ${u.email}`);
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          passwordHash,
          name: u.name,
          title: u.title,
          role: u.role,
          isActive: true,
        },
      });
      console.log(`  ✔ Created E2E account: ${u.email}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
