// =============================================================================
// Ecclesia CMS — useParishInfo
// =============================================================================
//
// PURPOSE
//   Loads the parish identity (parishName + diocese) from GET /api/settings so
//   receipts and certificates print the REAL configured parish instead of a
//   hardcoded placeholder. The settings singleton is created lazily by the
//   backend, so an empty string simply means setup has not been completed yet.
//
// RELATED FILES
//   - src/services/api.ts              → settingsApi.get()
//   - src/components/printables/ContributionReceipt.tsx → consumes parishName
//   - src/components/views/ActivitiesView.tsx / SacramentsView.tsx → consumers
// =============================================================================
import { useEffect, useState } from 'react';
import { settingsApi } from '../services/api';

export interface ParishInfo {
  /** Configured parish name ('' until the setup wizard is completed). */
  parishName: string;
  /** Configured diocese ('' until configured). */
  diocese: string;
}

/**
 * Fetches the configured parish identity once on mount.
 * Returns empty strings while loading or when settings are unavailable, so
 * callers can apply their own neutral fallback.
 */
export function useParishInfo(): ParishInfo {
  const [parish, setParish] = useState<ParishInfo>({ parishName: '', diocese: '' });

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .get()
      .then((settings) => {
        if (!cancelled) {
          setParish({ parishName: settings.parishName ?? '', diocese: settings.diocese ?? '' });
        }
      })
      .catch(() => {
        // Settings unavailable (offline / not yet configured) — keep fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return parish;
}
