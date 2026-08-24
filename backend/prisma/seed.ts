// =============================================================================
// Database seeder — `npm run db:seed` (prisma db seed)
// ---------------------------------------------------------------------------
// Bootstraps the platform for first-run:
//   1. Creates three fixed admin accounts (idempotent — never overwrites
//      existing passwords).
//   2. Creates the default panel_permissions singleton (full access).
//   3. Creates the default push_payment_settings singleton (empty).
//   4. Creates the ParishSettings singleton (id="default").
// =============================================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

// Fixed credential accounts for the parish installation.
// Default password: ChangeMeImmediately123!
const DEFAULT_PASSWORD = 'ChangeMeImmediately123!';
const SEED_USERS = [
  { email: 'maxblessngugi@ecclesia.local', name: 'Max Bless Ngugi', title: 'Primary Developer', role: 'super_admin' },
  { email: 'josephndung\'u@ecclesia.local', name: 'Joseph Ndung\'u', title: 'Administrator', role: 'admin' },
  { email: 'johnmusoma@ecclesia.local', name: 'John Musoma', title: 'Administrator', role: 'admin' },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  let passwordsPrinted = false;

  for (const acct of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: acct.email } });
    if (existing) {
      // Never overwrite an existing user's password or role — just update name/title.
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: acct.name, title: acct.title },
      });
      console.log(`  ↳ User already exists: ${acct.email} — skipped password creation.`);
    } else {
      await prisma.user.create({
        data: {
          email: acct.email,
          passwordHash,
          name: acct.name,
          title: acct.title,
          role: acct.role,
          isActive: true,
          mustChangePassword: true,
        },
      });
      passwordsPrinted = true;
      console.log(`  ✔ Created ${acct.role}: ${acct.email}`);
    }
  }

  if (passwordsPrinted) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SEED ACCOUNTS CREATED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Default password (all accounts): ${DEFAULT_PASSWORD}`);
    console.log('  → SHOWN ONLY ONCE. All accounts require a password change at first login.');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
  }

  // Default panel permissions (full access)
  await prisma.panelPermissions.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      panels: JSON.stringify({
        christian: true,
        activities: true,
        sacraments: true,
        finance: true,
        ledgers: true,
        inventory: true,
        reports: true,
        hr: true,
        administration: true,
      }),
      actions: JSON.stringify({ view: true, edit: true, delete: true }),
    },
    update: {},
  });

  await prisma.pushPaymentSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  // ParishSettings singleton — created on seed so GET /api/parish always has a row
  await prisma.parishSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
