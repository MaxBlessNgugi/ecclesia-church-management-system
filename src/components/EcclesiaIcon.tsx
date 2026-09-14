// =============================================================================
// EcclesiaIcon — canonical brand mark for ECCLESIA ChMS
// -----------------------------------------------------------------------------
// The gold starlight mark (public/icons/ecclesia-mark.png). className carries
// the size — the mark is 512×512, so an unsized one would blow out its layout —
// and alt="" keeps it decorative, since the ECCLESIA name is text beside it.
// =============================================================================
import React from 'react';

export const EcclesiaIcon: React.FC<{ className: string }> = ({ className }) => (
  <img src="/icons/ecclesia-mark.png" alt="" className={className} />
);
