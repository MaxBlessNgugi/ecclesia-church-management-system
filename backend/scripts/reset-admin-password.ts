// =============================================================================
// CLI: reset an administrator password (run on the server)
// =============================================================================
// Usage:
//   npm run admin:reset -- <email>                 (native install)
//   docker compose exec app npm run admin:reset -- <email>   (Docker install)
//
// Prints a one-time temporary password. The account is forced to change it at
// next sign-in. Safe to run for any account; never deletes or creates users.
// =============================================================================

import { resetAdminPassword } from '../src/lib/adminRecovery.js';

const email = process.argv[2]?.trim();

if (!email) {
  console.error('Usage: npm run admin:reset -- <email>');
  process.exit(1);
}

resetAdminPassword(email)
  .then(({ temporaryPassword }) => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Password reset for: ${email}`);
    console.log(`  Temporary password: ${temporaryPassword}`);
    console.log('  → SHOWN ONLY ONCE. The account must change it at first sign-in.');
    console.log('═══════════════════════════════════════════════════════════════');
  })
  .catch((err) => {
    console.error(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
