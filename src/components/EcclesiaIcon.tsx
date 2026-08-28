// =============================================================================
// EcclesiaIcon — canonical brand mark for ECCLESIA ChMS
// -----------------------------------------------------------------------------
// Gothic arch + stylized E, derived from the official icon (black metallic
// arch with brushed E). Used everywhere: TitleBar, Footer, Auth, Setup,
// ServerConnection, and PWA icons (public/icons/*).
// The SVG uses currentColor so the same glyph works on dark tiles (white)
// and light backgrounds (ink #1a1c1c). Keep paths in sync with
// public/icons/icon-512.svg and master SVGs in /tmp/opencode.
// =============================================================================
import React from 'react';

export const EcclesiaIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    role="img"
  >
    {/* Centered glyph — 512x512 with centre at 256,256 */}
    <g transform="translate(256 252)">
      {/* Central arch */}
      <path d="M -78 156 L -78 -47 Q -78 -97 0 -174 Q 78 -97 78 -47 L 78 156 L 56 156 L 56 -47 Q 56 -84 0 -147 Q -56 -84 -56 -47 L -56 156 Z" fill="currentColor" />
      {/* Left wing */}
      <path d="M -158 156 L -158 -17 L -128 -50 L -94 -27 L -94 156 Z M -140 140 L -140 -9 L -126 -31 L -112 -20 L -112 140 Z" fill="currentColor" fillRule="evenodd" />
      {/* Right wing */}
      <path d="M 94 156 L 94 -27 L 128 -50 L 158 -17 L 158 156 Z M 112 140 L 112 -20 L 126 -31 L 140 -9 L 140 140 Z" fill="currentColor" fillRule="evenodd" />
      {/* Stylized E — two strokes */}
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="26">
        <path d="M 62 -57 C 39 -67, -6 -62, -31 -37 C -56 -12, -56 23, -31 43 L 34 43" />
        <path d="M -31 43 C -31 68, -6 93, 29 93 C 42 93, 56 88, 64 73" />
      </g>
    </g>
  </svg>
);

export default EcclesiaIcon;
