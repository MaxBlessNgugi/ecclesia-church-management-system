// =============================================================================
// Demo data purge — `npm run db:clear:demo` (backend)
// -----------------------------------------------------------------------------
// Deletes every demo business record and the extra demo users, returning the
// database to the pristine post-install state (super admin + settings
// singletons only). Safe to run at any time; idempotent.
//
// This is how demo data is "removed" when commercialising: either run this
// once, or delete seed-demo.ts + clear-demo.ts from the repo so the demo seed
// can never be invoked on a customer's machine.
// =============================================================================
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.$transaction([
    prisma.recruitmentApplicant.deleteMany(),
    prisma.recruitment.deleteMany(),
    prisma.leave.deleteMany(),
    prisma.payroll.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.stockIssue.deleteMany(),
    prisma.stockTake.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.inventoryPriceAuditLog.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.ledgerMovement.deleteMany(),
    prisma.ledger.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.debtor.deleteMany(),
    prisma.creditor.deleteMany(),
    prisma.deposit.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.death.deleteMany(),
    prisma.billedItem.deleteMany(),
    prisma.transfer.deleteMany(),
    prisma.contribution.deleteMany(),
    prisma.christian.deleteMany(),
    prisma.user.deleteMany({ where: { role: { not: 'super_admin' } } }),
  ]);

  const total = counts.reduce((acc, c) => acc + c.count, 0);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  DEMO DATA CLEARED — ${total} record(s) removed`);
  console.log('  The super admin and system settings remain intact.');
  console.log('  The system is now in its pristine commercial state.');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
