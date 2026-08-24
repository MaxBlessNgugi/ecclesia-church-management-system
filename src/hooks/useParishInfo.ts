// =============================================================================
// Ecclesia CMS — useParishInfo
// =============================================================================
//
// PURPOSE
//   Loads the full parish identity from GET /api/parish so receipts,
//   certificates, header, footer, and the admin form all display the real
//   configured parish data. The settings singleton is created lazily by the
//   backend, so empty strings simply mean setup has not been completed yet.
//
// RELATED FILES
//   - src/services/api.ts              → parishApi.get()
//   - src/components/printables/       → consumes parish name + logo
//   - src/components/Header.tsx        → dual brand lockup
//   - src/components/Footer.tsx        → dual brand lockup
// =============================================================================
import { useEffect, useState, useCallback } from 'react';
import { parishApi } from '../services/api';
import { ParishSettings } from '../types';

/** Default (empty) parish settings used while loading or when unavailable. */
const EMPTY_PARISH: ParishSettings = {
  id: 'default',
  name: '',
  diocese: '',
  localChurch: '',
  sccLabel: 'Jumuiya',
  county: '',
  country: 'Kenya',
  address: '',
  phone: '',
  email: '',
  motto: '',
  logoData: null,
  setupCompleted: false,
  updatedAt: '',
};

/**
 * Fetches the configured parish identity once on mount.
 * Returns empty/default values while loading or when settings are unavailable,
 * so callers can apply their own neutral fallback.
 *
 * Also exposes a `refetch` callback so callers can force-reload after a save.
 */
/**
 * Event name dispatched (via CustomEvent) when parish settings are saved
 * from any component.  All useParishInfo() consumers listen for this
 * and refetch so the live brand lockup updates immediately.
 */
export const PARISH_CHANGED_EVENT = 'parish-settings-changed';

export function useParishInfo() {
  const [parish, setParish] = useState<ParishSettings>(EMPTY_PARISH);

  const fetchParish = useCallback(() => {
    let cancelled = false;
    parishApi
      .get()
      .then((settings) => {
        if (!cancelled) {
          setParish(settings);
        }
      })
      .catch(() => {
        // Settings unavailable (offline / not yet configured) — keep fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = fetchParish();
    // Listen for broadcast from ParishIdentitySection / SetupView saves
    const handler = () => fetchParish();
    window.addEventListener(PARISH_CHANGED_EVENT, handler);
    return () => {
      cleanup();
      window.removeEventListener(PARISH_CHANGED_EVENT, handler);
    };
  }, [fetchParish]);

  return {
    // Full ParishSettings fields
    ...parish,
    refetch: fetchParish,
    // Backward-compatible aliases for existing consumers
    parishName: parish.name,
  };
}
