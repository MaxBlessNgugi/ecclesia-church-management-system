import { parishApi } from '../services/api';

/**
 * Check if the parish setup wizard needs to be completed.
 * Returns { needsSetup: true } when setupCompleted is false.
 * On network error, returns { needsSetup: false } to avoid trapping
 * already-configured users in the wizard.
 */
export async function checkParishSetup(): Promise<{ needsSetup: boolean }> {
  try {
    const parish = await parishApi.get();
    return { needsSetup: !parish.setupCompleted };
  } catch {
    // Network error — proceed to the main app with placeholder data
    // rather than trapping an already-configured user in the wizard.
    return { needsSetup: false };
  }
}
