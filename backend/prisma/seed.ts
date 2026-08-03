import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'maxblessngugi@ecclesia.local';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMeImmediately123!';
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
      },
    });
    console.log('═══════════════════════════════════════════════════');
    console.log('  SUPER ADMIN CREATED (full platform access)');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Name:  ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role:  ${user.role}`);
    console.log(`  Pass:  ${password}`);
    console.log('  → Change this password after first login!');
    console.log('  → Only this account can register new users.');
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
