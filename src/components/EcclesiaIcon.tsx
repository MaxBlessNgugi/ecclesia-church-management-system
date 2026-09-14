// =============================================================================
// EcclesiaIcon — canonical brand mark for ECCLESIA ChMS
// -----------------------------------------------------------------------------
// The gold starlight mark, cropped from the official logo artwork and exported
// at 512×512 (public/icons/ecclesia-mark.png — the same crop the PWA icons are
// built from). Shown wherever the product brand appears: TitleBar, Footer,
// AuthView, SetupView and ServerConnection.
// =============================================================================
import React from 'react';

export const EcclesiaIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => (
  <img
    src="/icons/ecclesia-mark.png"
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    className={className}
  />
);

export default EcclesiaIcon;
