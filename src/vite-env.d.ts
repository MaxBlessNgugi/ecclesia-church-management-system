// =============================================================================
// Vite ambient type declarations
// Provides typing for import.meta.env, asset imports and CSS modules so the
// TS project compiles against Vite's client runtime.
// =============================================================================

/**
 * Triple-slash directive that imports Vite's built-in client type declarations.
 * This provides TypeScript with ambient types for:
 * - import.meta.env (VITE_* environment variables, mode, etc.)
 * - import.meta.hot (HMR API for development)
 * - Static asset imports (images, fonts, SVGs) with correct path types
 * - CSS module imports (*.module.css → Record<string, string>)
 * - Web Worker imports (new Worker(...))
 *
 * Without this directive, TypeScript would report errors on any import.meta usage
 * and Vite-specific features would lack proper type checking.
 */
/// <reference types="vite/client" />
