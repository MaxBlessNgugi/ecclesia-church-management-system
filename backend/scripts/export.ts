// Parish data export: `npm run export` (tsx scripts/export.ts)
// Writes one JSON bundle (all tables, secrets stripped) plus a CSV per table
// into ./exports. This is the hand-over / exit path — the parish can import the
// JSON onto another Ecclesia install, and open any CSV in a spreadsheet.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { exportAllData, toCsv } from '../src/lib/export.js';

async function main() {
  const outDir = path.resolve(process.cwd(), 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const bundle = await exportAllData();

  const jsonPath = path.join(outDir, `ecclesia-export-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(bundle, null, 2));

  let csvCount = 0;
  for (const [table, rows] of Object.entries(bundle.tables)) {
    const csvPath = path.join(outDir, `${table}-${stamp}.csv`);
    fs.writeFileSync(csvPath, toCsv(rows));
    csvCount += 1;
  }

  console.log(`Export complete:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSVs: ${csvCount} files in ${outDir}`);
}

main()
  .catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
