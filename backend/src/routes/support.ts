// =============================================================================
// Support bundle route — /api/support/bundle (require JWT + admin role)
// -----------------------------------------------------------------------------
//   GET /bundle — creates a ZIP archive containing diagnostics + sanitized data
//   and streams it to the client as a downloadable file.
//
// The bundle includes:
//   • diagnostics.json — health, row counts, versions (no secrets)
//   • export.json — full data export (password hashes / API keys stripped)
//
// Uses `archiver` for streaming ZIP generation so memory stays flat even for
// large databases.
// =============================================================================
import { Router } from 'express';
// @ts-ignore -- archiver 8.x ships no types; use the shim in src/types/shims.d.ts
import { ZipArchive as archiver } from 'archiver';
import { collectDiagnostics } from '../lib/diagnostics.js';
import { exportAllData } from '../lib/export.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/support/bundle
 * Generates a ZIP containing diagnostics + sanitized export data, streamed
 * directly to the client.
 */
router.get('/bundle', async (_req, res, next) => {
  try {
    const diagnostics = await collectDiagnostics();
    const exportData = await exportAllData();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=ecclesia-support-bundle.zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res as any);

    archive.append(JSON.stringify(diagnostics, null, 2), { name: 'diagnostics.json' });
    archive.append(JSON.stringify(exportData, null, 2), { name: 'export.json' });

    await archive.finalize();
  } catch (e) {
    next(e);
  }
});

export default router;
