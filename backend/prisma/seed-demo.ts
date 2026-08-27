// =============================================================================
// DEMO DATABASE SEEDER — `npm run db:seed:demo` (backend)
// -----------------------------------------------------------------------------
// Loads realistic sample data into the current database so the app can be
// pitched with a believable, fully-populated parish. Run it ONLY on a demo/dev
// machine:
//
//     npm run db:seed:demo
//
// COMMERCIAL INSTALLS ARE UNAFFECTED:
//   - The standard `npm run setup` / `db:seed` flow (see seed.ts) never touches
//     this file — it only creates the super admin + settings singletons.
//   - To return the database to its pristine, post-install state before going
//     live, run:
//
//         npm run db:clear:demo
//
//     which deletes every business record AND the extra demo users, keeping the
//     super admin and the panel-permission/push-payment singletons intact.
//     For a truly clean commercial box you can simply delete seed-demo.ts and
//     clear-demo.ts from the repository.
//
// The script is idempotent: it wipes prior demo data before re-seeding so you
// can run it repeatedly without duplicates.
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

const DIOCESE = 'Nairobi Archdiocese';
const PARISH = 'Our Lady of Mercy Parish';
const CHURCHES = ['Main Parish Cathedral', 'St. Monica Chapel', 'St. Joseph Outstation'];
const SCCS = ['St. Jude SCC', 'St. Monica SCC', 'St. Anne SCC', 'St. Peter SCC'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const NAMES: [string, string, string][] = [
  ['Peter', 'Kamau', 'Mwangi'],
  ['Mary', 'Wanjiru', 'Njeri'],
  ['John', 'Otieno', 'Ochieng'],
  ['Grace', 'Achieng', 'Onyango'],
  ['Joseph', 'Kipchoge', 'Korir'],
  ['Elizabeth', 'Chebet', 'Kiptoo'],
  ['Stephen', 'Mutua', 'Ndungu'],
  ['Catherine', 'Wambui', 'Kamande'],
  ['David', 'Omondi', 'Odero'],
  ['Sarah', 'Akinyi', 'Odhiambo'],
  ['Daniel', 'Kiplagat', 'Rono'],
  ['Ruth', 'Jerop', 'Kemboi'],
  ['Samuel', 'Njoroge', 'Gichuru'],
  ['Esther', 'Wairimu', 'Maina'],
  ['James', 'Kariuki', 'Ndegwa'],
  ['Agnes', 'Nyambura', 'Wanjiku'],
  ['Michael', 'Okoth', 'Opiyo'],
  ['Dorothy', 'Atieno', 'Auma'],
  ['Patrick', 'Mureithi', 'Karanja'],
  ['Monica', 'Njoki', 'Waweru'],
  ['Charles', 'Wafula', 'Wechuli'],
  ['Veronica', 'Nasimiyu', 'Wanyama'],
  ['Francis', 'Maina', 'Kimani'],
  ['Teresa', 'Wangari', 'Chege'],
  ['Antony', 'Kiprotich', 'Kosgei'],
  ['Cecilia', 'Chemutai', 'Bett'],
  ['George', 'Oduor', 'Achieng'],
  ['Jane', 'Nyatichi', 'Morara'],
  ['Paul', 'Kibet', 'Kipkemoi'],
  ['Florence', 'Muthoni', 'Wairimu'],
];

/** Create a Date object for a given year/month/day (UTC midnight). */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/** Format a Date as ISO date string for sacrament JSON (kept as string inside JSON). */
function isoDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sacrament(date: string): string {
  return JSON.stringify({ date, minister: 'Fr. Joseph Mwangi', place: PARISH });
}

async function main() {
  // ── 0. Reset prior demo data (idempotent) ────────────────────────────────
  // Deletes demo users (all users except the seeded super admin) and every
  // business record so re-running produces exactly one copy of the demo set.
  await prisma.$transaction([
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
  ]);
  const superAdmin = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (superAdmin) {
    await prisma.user.deleteMany({ where: { role: { not: 'super_admin' } } });
  } else {
    // No super admin yet (fresh scratch DB): remove just the demo users so a
    // re-run never collides on their unique emails.
    await prisma.user.deleteMany({
      where: { email: { in: ['admin@demo.ecclesia.local', 'cashier@demo.ecclesia.local', 'viewer@demo.ecclesia.local'] } },
    });
  }

  // ── 1. Demo users (admin, staff, viewer, cashier) ────────────────────────
  const demoUsers: { name: string; email: string; role: string; password: string }[] = [
    { name: 'Sr. Agnes Wanjiru', email: 'admin@demo.ecclesia.local', role: 'admin', password: 'AdminDemo123!' },
    { name: 'John Otieno', email: 'cashier@demo.ecclesia.local', role: 'staff', password: 'CashierDemo123!' },
    { name: 'Mary Wanjiru', email: 'viewer@demo.ecclesia.local', role: 'viewer', password: 'ViewerDemo123!' },
  ];
  const fullPanels = {
    christian: true,
    activities: true,
    sacraments: true,
    finance: true,
    ledgers: true,
    inventory: true,
    reports: true,
    hr: true,
    administration: true,
  };
  const fullActions = { view: true, edit: true, delete: true };

  const createdUsers = new Map<string, string>();
  for (const u of demoUsers) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        name: u.name,
        title: 'Demo Account',
        role: u.role,
        isActive: true,
        panels: JSON.stringify(fullPanels),
        actions: JSON.stringify(fullActions),
        mustChangePassword: false,
      },
    });
    createdUsers.set(u.email, user.id);
  }

  // ── 2. Christians (30 members) ───────────────────────────────────────────
  const christians: { id: string; regNo: string }[] = [];
  const startRegNo = 1043;
  for (let i = 0; i < NAMES.length; i++) {
    const [baptismalName, secondName, sirName] = NAMES[i];
    const regNo = `REG-${new Date().getFullYear()}-${String(startRegNo + i).padStart(6, '0')}`;
    const church = CHURCHES[i % CHURCHES.length];
    const scc = SCCS[i % SCCS.length];
    const baptismYear = 1990 + ((i * 7) % 25);
    const created = await prisma.christian.create({
      data: {
        regNo,
        nationalId: String(22000000 + i * 1379),
        baptismalName,
        secondName,
        sirName,
        phone: `07${String((i * 37) % 100000000).padStart(8, '0')}`,
        diocese: DIOCESE,
        parish: PARISH,
        localChurch: church,
        scc,
        status: i % 27 === 0 ? 'Transferred' : i % 29 === 0 ? 'Deceased' : 'Active',
        baptism: sacrament(isoDateStr(baptismYear, (i % 12) + 1, (i % 28) + 1)),
        eucharist: sacrament(isoDateStr(baptismYear + 9, (i % 12) + 1, (i % 28) + 1)),
        confirmation: sacrament(isoDateStr(baptismYear + 15, (i % 12) + 1, (i % 28) + 1)),
        marriage: i % 2 === 0 ? sacrament(isoDateStr(baptismYear + 24, (i % 12) + 1, (i % 28) + 1)) : null,
      },
    });
    christians.push({ id: created.id, regNo });
  }

  // ── 3. Contributions (tithing/jumuiya/diocesan/project with monthly trackers) ──
  const categoriesList = ['Tithing', 'Jumuiya Contribution', 'Diocesan Support', 'Parish Project'];
  const thisMonth = MONTHS[new Date().getMonth()];
  const lastMonth = MONTHS[(new Date().getMonth() + 11) % 12];
  for (let i = 0; i < christians.length; i++) {
    const c = christians[i];
    const paidThisMonth = i % 5 !== 0; // ~80% paid this month
    const paidLastMonth = i % 4 !== 0;
    const tracker: Record<string, boolean> = {};
    for (const m of MONTHS) {
      if (m === thisMonth) tracker[m] = paidThisMonth;
      else if (m === lastMonth) tracker[m] = paidLastMonth;
      else tracker[m] = i % 7 === 0;
    }
    const amountKES = 200 + (i % 8) * 100;
    await prisma.contribution.create({
      data: {
        christianId: c.id,
        memberName: `${NAMES[i][0]} ${NAMES[i][2]}`,
        regNo: c.regNo,
        categories: JSON.stringify(categoriesList.slice(0, (i % 3) + 1)),
        otherCategory: null,
        monthlyTracker: JSON.stringify(tracker),
        amountKES,
        date: utcDate(new Date().getFullYear(), new Date().getMonth() + 1, (i % 27) + 1),
      },
    });
  }

  // ── 4. Transfers, billed items, deaths ───────────────────────────────────
  await prisma.transfer.create({
    data: {
      christianId: christians[0].id,
      memberName: `${NAMES[0][0]} ${NAMES[0][2]}`,
      diocese: 'Mombasa Archdiocese',
      parish: 'St. John the Baptist',
      localChurch: 'St. Teresa Chapel',
      scc: 'St. Joseph SCC',
      date: utcDate(2025, 11, 14),
    },
  });

  const billedDefs: { item: string; category: string; unitFee: number; qty: number; walkIn: boolean }[] = [
    { item: 'Baptism Registration', category: 'Sacramental Services', unitFee: 1000, qty: 1, walkIn: false },
    { item: 'Marriage Banns', category: 'Sacramental Services', unitFee: 2500, qty: 1, walkIn: false },
    { item: 'Sung Mass Intention', category: 'Mass Intentions', unitFee: 1500, qty: 1, walkIn: true },
    { item: 'Memorial Card', category: 'Memorial Services', unitFee: 800, qty: 2, walkIn: true },
  ];
  for (let i = 0; i < billedDefs.length; i++) {
    const b = billedDefs[i];
    await prisma.billedItem.create({
      data: {
        christianId: b.walkIn ? null : christians[(i + 2) % christians.length].id,
        memberName: b.walkIn ? 'Walk-in Guest' : `${NAMES[(i + 2) % NAMES.length][0]} ${NAMES[(i + 2) % NAMES.length][2]}`,
        isWalkIn: b.walkIn,
        category: b.category,
        item: b.item,
        unitFee: b.unitFee,
        quantity: b.qty,
        totalAmount: b.unitFee * b.qty,
        date: utcDate(2026, 6, 10 + i),
      },
    });
  }

  await prisma.death.create({
    data: {
      christianId: christians[29].id,
      memberName: `${NAMES[29][0]} ${NAMES[29][2]}`,
      placeOfDeath: 'Nairobi, Kenya',
      dateOfDeath: utcDate(2025, 9, 2),
      dateOfBurial: utcDate(2025, 9, 12),
      ministerName: 'Fr. Joseph Mwangi',
      remarks: 'Rest in peace. Funeral service held at the Cathedral.',
    },
  });

  // ── 5. Finance: deposits, creditors, debtors, expenses ───────────────────
  const banks = ['KCB Bank', 'Equity Bank', 'Co-operative Bank', 'NCBA Bank'];
  for (let i = 0; i < 6; i++) {
    await prisma.deposit.create({
      data: {
        date: utcDate(2026, 6, 1 + i),
        amount: 15000 + i * 7500,
        bankName: banks[i % banks.length],
        accountNo: `0110${String(2200 + i * 113)}`,
        sourceOfCash: i % 2 === 0 ? 'Sunday Collections' : 'Tithing Remittances',
        refNo: `DEP-${String(i + 1).padStart(5, '0')}`,
        depositedBy: 'Sr. Agnes Wanjiru',
      },
    });
  }

  await prisma.creditor.create({
    data: {
      vendor: 'Catholic Supply House Ltd',
      description: 'Altar candles and liturgical vestments',
      invoiceNo: 'INV-8841',
      amountOwed: 48000,
      dueDate: utcDate(2026, 9, 15),
      status: 'Pending',
    },
  });
  await prisma.creditor.create({
    data: {
      vendor: 'Premium Printers',
      description: 'Parish bulletin printing (July)',
      invoiceNo: 'INV-8892',
      amountOwed: 12000,
      dueDate: utcDate(2026, 8, 30),
      status: 'Scheduled',
    },
  });

  await prisma.debtor.create({
    data: { memberName: 'Stephen Mutua', contributionType: 'Tithing', amount: 4500, status: 'Outstanding' },
  });
  await prisma.debtor.create({
    data: { memberName: 'Grace Achieng', contributionType: 'Jumuiya Contribution', amount: 2000, status: 'Partially Paid' },
  });

  const expenseDefs: [Date, string, string, number, string][] = [
    [utcDate(2026, 6, 5), 'Utilities', 'Electricity bill — June', 8500, 'MPESA'],
    [utcDate(2026, 6, 12), 'Maintenance', 'Roof repair over the sacristy', 22500, 'Cash'],
    [utcDate(2026, 6, 20), 'Transport', 'Outstation pastoral visits', 4200, 'Cash'],
    [utcDate(2026, 7, 1), 'Office Supplies', 'Printer toner and stationery', 6800, 'MPESA'],
    [utcDate(2026, 7, 8), 'Programmes', 'Seminarian training support', 15000, 'Bank Transfer'],
  ];
  for (let i = 0; i < expenseDefs.length; i++) {
    const [date, category, description, amount, method] = expenseDefs[i];
    await prisma.expense.create({
      data: {
        date,
        category,
        description,
        amount,
        paymentMethod: method,
        voucherNo: `EXP-${String(i + 1).padStart(5, '0')}`,
      },
    });
  }

  // ── 6. Ledgers + movements ───────────────────────────────────────────────
  const ledgerDefs: [string, string, string, number][] = [
    ['Parish Main Account', 'LED-001', 'cashier', 'Sr. Agnes Wanjiru', 184500],
    ['Construction Fund', 'LED-002', 'fund', 'Parish Council', 96000],
    ['Youth Ministry', 'LED-003', 'fund', 'Fr. Joseph Mwangi', 21000],
  ];
  const ledgerIds: string[] = [];
  for (const [name, code, type, cashier, balance] of ledgerDefs) {
    const l = await prisma.ledger.create({ data: { name, code, type, cashier, balance } });
    ledgerIds.push(l.id);
  }
  await prisma.ledgerMovement.create({
    data: {
      amount: 12000,
      time: new Date(),
      from: ledgerDefs[0][0],
      to: ledgerDefs[1][0],
      notes: 'Transfer to Construction Fund — July remittance',
    },
  });

  // ── 7. Inventory: items, delivery, sales, stock take, issue ──────────────
  const itemDefs: [string, string, string, number, number, number, number][] = [
    ['Altar Candles (Large)', 'CND-001', 'Liturgical', 220, 350, 60, 20],
    ['Mass Wine (750ml)', 'WIN-002', 'Liturgical', 650, 900, 24, 8],
    ['Communion Wafers', 'WFR-003', 'Liturgical', 120, 200, 150, 40],
    ['Rosary (Beaded)', 'ROS-004', 'Religious Articles', 150, 300, 80, 15],
    ['Catholic Catechism Book', 'CAT-005', 'Books & Media', 280, 450, 35, 12],
    ['Parish Bulletin (Weekly)', 'BUL-006', 'Printing', 40, 50, 400, 100],
  ];
  for (const [name, sku, category, cost, price, stock, reorder] of itemDefs) {
    await prisma.inventoryItem.create({ data: { name, sku, category, cost, price, stock, reorder } });
  }

  await prisma.delivery.create({
    data: { supplier: 'Catholic Supply House Ltd', inv: 'DEL-2026-041', date: utcDate(2026, 6, 18), units: 120, cat: 'Liturgical', total: 48500 },
  });
  await prisma.delivery.create({
    data: { supplier: 'Premium Printers', inv: 'DEL-2026-052', date: utcDate(2026, 7, 2), units: 500, cat: 'Printing', total: 20000 },
  });

  const saleDefs: [string, number][] = [
    ['Altar Candles (Large)', 8],
    ['Rosary (Beaded)', 12],
    ['Catholic Catechism Book', 5],
    ['Mass Wine (750ml)', 4],
    ['Communion Wafers', 20],
    ['Parish Bulletin (Weekly)', 150],
  ];
  for (let i = 0; i < saleDefs.length; i++) {
    const [item, qty] = saleDefs[i];
    const price = itemDefs.find((d) => d[0] === item)![4];
    await prisma.sale.create({
      data: { item, time: new Date(Date.UTC(2026, 6, 5 + i, 10 + i, 30, 0)), amount: qty * price },
    });
  }

  await prisma.stockTake.create({
    data: { name: 'Altar Candles (Large)', sku: 'CND-001', system: 60, physical: 58, notes: '2 damaged during transport' },
  });

  await prisma.stockIssue.create({
    data: { item: 'Communion Wafers', dest: 'To: St. Monica Chapel • Sunday Mass use' },
  });

  // ── 8. HR: employees, payroll, leave, recruitment ────────────────────────
  const employeeDefs: [string, string, string, string, string][] = [
    ['EMP-001', 'Sr. Agnes Wanjiru', 'Parish Administrator', '0722000111', 'admin@demo.ecclesia.local'],
    ['EMP-002', 'Mr. Samuel Kariuki', 'Accountant', '0722000222', 'samuel.kariuki@demo.ecclesia.local'],
    ['EMP-003', 'Ms. Ruth Kiptoo', 'Secretary', '0722000333', 'ruth.kiptoo@demo.ecclesia.local'],
    ['EMP-004', 'Mr. George Oduor', 'Maintenance Officer', '0722000444', 'george.oduor@demo.ecclesia.local'],
  ];
  const empIds: string[] = [];
  for (const [code, name, role, phone, email] of employeeDefs) {
    const e = await prisma.employee.create({
      data: { code, name, role, phone, email, hireDate: utcDate(2019, 1, 10) },
    });
    empIds.push(e.id);
  }
  const period = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const payrollDefs: [number, number, number, number][] = [
    [45000, 5000, 3500, 1],
    [52000, 6000, 4000, 1],
    [28000, 2000, 1500, 1],
    [32000, 3000, 2000, 1],
  ];
  for (let i = 0; i < empIds.length; i++) {
    const [basic, allowances, deductions] = payrollDefs[i];
    await prisma.payroll.create({
      data: {
        employeeId: empIds[i],
        period,
        basicSalary: basic,
        allowances,
        deductions,
        netPay: basic + allowances - deductions,
        status: i === 0 ? 'Paid' : 'Approved',
        notes: 'Monthly payroll — demo period',
      },
    });
  }

  await prisma.leave.create({
    data: {
      employeeId: empIds[1],
      type: 'Annual Leave',
      startDate: utcDate(2026, 8, 10),
      endDate: utcDate(2026, 8, 21),
      days: 10,
      reason: 'Family vacation',
      status: 'Approved',
      approvedBy: 'Sr. Agnes Wanjiru',
    },
  });
  await prisma.leave.create({
    data: {
      employeeId: empIds[3],
      type: 'Sick Leave',
      startDate: utcDate(2026, 7, 6),
      endDate: utcDate(2026, 7, 7),
      days: 2,
      reason: 'Medical appointment',
      status: 'Pending',
    },
  });

  const rec = await prisma.recruitment.create({
    data: {
      position: 'Catechist (Primary Level)',
      department: 'Catechesis',
      description: 'Teach the faith to young parishioners and prepare them for the sacraments.',
      requirements: 'Certificate in Catechesis; at least 2 years experience',
      status: 'Open',
      datePosted: utcDate(2026, 7, 1),
      closingDate: utcDate(2026, 8, 30),
    },
  });
  await prisma.recruitmentApplicant.create({
    data: {
      recruitmentId: rec.id,
      name: 'Joyce Wambui',
      email: 'joyce.wambui@example.com',
      phone: '0711000999',
      cvSummary: 'Certified catechist, 3 years at St. Jude SCC.',
      status: 'Pending',
    },
  });

  // ── 9. Summary ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DEMO DATA SEEDED — full parish dataset for pitching');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Christians:        ${christians.length}`);
  console.log(`  Contributions:     ${christians.length}`);
  console.log(`  Ledgers:           ${ledgerIds.length}`);
  console.log(`  Inventory items:   ${itemDefs.length}`);
  console.log(`  Employees:         ${employeeDefs.length}`);
  console.log('');
  console.log('  Demo logins (password change already done):');
  console.log(`    admin   -> admin@demo.ecclesia.local / AdminDemo123!`);
  console.log(`    cashier -> cashier@demo.ecclesia.local / CashierDemo123!`);
  console.log(`    viewer  -> viewer@demo.ecclesia.local / ViewerDemo123!`);
  console.log(`    super   -> use SUPER_ADMIN_EMAIL/PASSWORD from backend/.env`);
  console.log('');
  console.log('  Remove all demo data before going live:');
  console.log('    npm run db:clear:demo');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
