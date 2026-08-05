// =============================================================================
// Database seeder — `npm run db:seed` (prisma db seed)
// -----------------------------------------------------------------------------
// Bootstraps the platform for first-run:
//   1. Creates the super_admin account (idempotent — updates name/title if the
//      email already exists, never resets the password of an existing account).
//      The password is generated randomly (or taken from SUPER_ADMIN_PASSWORD)
//      and the account is flagged to force a password change at first login.
//   2. Creates the default panel_permissions singleton (full access).
//   3. Creates the default push_payment_settings singleton (empty).
// =============================================================================
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

/** 18-char alphanumeric password with at least one of each required class. */
function randomPassword(): string {
  return crypto.randomBytes(14).toString('base64url').slice(0, 18);
}

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'maxblessngugi@ecclesia.local';
  const password = process.env.SUPER_ADMIN_PASSWORD || randomPassword();
  const name = process.env.SUPER_ADMIN_NAME || 'Max Bless Ngugi';
  const title = process.env.SUPER_ADMIN_TITLE || 'Primary Developer';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, title },
    });
    console.log(`Super admin already exists: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        title,
        role: 'super_admin',
        isActive: true,
        // The generated / temporary password must be changed at first login.
        mustChangePassword: true,
      },
    });
    console.log('═══════════════════════════════════════════════════');
    console.log('  SUPER ADMIN CREATED (full platform access)');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Name:  ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role:  ${user.role}`);
    console.log(`  Pass:  ${password}`);
    console.log('  → SHOWN ONLY ONCE. Set SUPER_ADMIN_PASSWORD in backend/.env');
    console.log('    to use a known value instead of a random one.');
    console.log('  → The account requires a password change at first sign-in.');
    console.log('═══════════════════════════════════════════════════');
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

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
