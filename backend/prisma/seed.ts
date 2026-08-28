// =============================================================================
// Database seeder — `npm run db:seed` (prisma db seed)
// ---------------------------------------------------------------------------
// Bootstraps the platform for first-run:
//   1. Creates three fixed super_admin accounts (idempotent — never overwrites
//      existing passwords).
//   2. Creates the default panel_permissions singleton (full access).
//   3. Creates the default push_payment_settings singleton (empty).
//   4. Creates the ParishSettings singleton (id="default").
// =============================================================================
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import 'dotenv/config';

const prisma = new PrismaClient();

const SEED_USERS = [
  { email: 'maxblessngugi@ecclesia.local', name: 'Max Bless Ngugi', title: 'Primary Developer', role: 'super_admin' },
  { email: 'josephndung\'u@ecclesia.local', name: 'Joseph Ndung\'u', title: 'Administrator', role: 'super_admin' },
  { email: 'anko@ecclesia.local', name: 'Anko', title: 'Administrator', role: 'super_admin' },
] as const;

function generateRandomPassword(length = 16): string {
  // Generate a secure random password with alphanumeric + special chars
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

async function main() {
  const createdAccounts: Array<{ email: string; password: string; role: string }> = [];

  for (const acct of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: acct.email } });
    if (existing) {
      // Never overwrite an existing user's password — but sync name, title, and role
      // so seed changes (e.g. promoting to super_admin) take effect on existing installs.
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: acct.name, title: acct.title, role: acct.role },
      });
      console.log(`  ↳ User already exists: ${acct.email} — skipped password creation.`);
    } else {
      // Use SUPER_ADMIN_PASSWORD for the super_admin if set; otherwise generate random per user.
      let password: string;
      if (acct.role === 'super_admin' && process.env.SUPER_ADMIN_PASSWORD) {
        password = process.env.SUPER_ADMIN_PASSWORD;
      } else {
        password = generateRandomPassword();
      }
      const passwordHash = await bcrypt.hash(password, 12);

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
      createdAccounts.push({ email: acct.email, password, role: acct.role });
      console.log(`  ✔ Created ${acct.role}: ${acct.email}`);
    }
  }

  if (createdAccounts.length > 0) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SEED ACCOUNTS CREATED');
    console.log('═══════════════════════════════════════════════════════════════');
    for (const acct of createdAccounts) {
      const source = acct.role === 'super_admin' && process.env.SUPER_ADMIN_PASSWORD
        ? ' (from SUPER_ADMIN_PASSWORD)'
        : ' (random, shown once)';
      console.log(`  ${acct.role}: ${acct.email}`);
      console.log(`  Password${source}: ${acct.password}`);
    }
    console.log('  → SHOWN ONLY ONCE. All accounts require a password change at first login.');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
  }

  // Default panel permissions (full access)
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
