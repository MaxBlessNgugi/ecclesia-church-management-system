// =============================================================================
// Ecclesia CMS — URL Utilities & Parser
// =============================================================================
//
// PURPOSE
//   Robust, centralized URL normalization, API base resolution, Socket origin
//   resolution, and hash-route deep linking parsers.
//
// GUARANTEES
//   - Normalizes missing protocols, trailing slashes, and redundant '/api' segments.
//   - Validates URLs via the standard URL constructor with graceful fallback.
//   - Dynamically resolves API and Socket URLs based on user configuration, env vars,
//     or same-origin defaults.
//   - Safely parses hash routes, decoding URI components and separating query parameters.
// =============================================================================

/**
 * Normalizes a user-supplied server URL or hostname string.
 *
 * Ensures:
 * - Trims leading and trailing whitespace.
 * - Prepends 'http://' if no protocol is specified.
 * - Strips any trailing slashes and trailing '/api' path segments so downstream
 *   code can reliably append '/api' or endpoints without producing duplicate segments.
 * - Handles malformed input gracefully using the URL Web API.
 *
 * @param rawUrl - The user input or configuration string (e.g. "localhost:5000", "http://192.168.1.100:5000/api/").
 * @returns A clean origin + path prefix without trailing slashes or /api.
 *
 * @example
 * normalizeServerUrl('192.168.1.50:5000')         // => 'http://192.168.1.50:5000'
 * normalizeServerUrl('http://localhost:5000/api/') // => 'http://localhost:5000'
 * normalizeServerUrl('https://ecclesia.local/')    // => 'https://ecclesia.local'
 */
export function normalizeServerUrl(rawUrl: string): string {
  let trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';

  // Add default protocol if omitted
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    // Strip trailing /api and trailing slashes from pathname
    let pathname = parsed.pathname.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    // Fallback regex cleanup if URL constructor throws (e.g. unescaped chars)
    return trimmed.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  }
}

/**
 * Resolves the full API base URL for REST fetch calls.
 * Ensures the resulting base URL ends with '/api' and contains no duplicate '/api/api' segments.
 *
 * Priority:
 * 1. User-configured server URL from localStorage (e.g. "http://192.168.1.50:5000" -> "http://192.168.1.50:5000/api")
 * 2. `VITE_API_BASE_URL` environment variable
 * 3. '/api' same-origin fallback
 *
 * @param savedUrl - The server URL stored in localStorage (if any).
 * @param envApiUrl - The VITE_API_BASE_URL env var (if any).
 * @returns Normalized API base URL string.
 */
export function resolveApiBaseUrl(savedUrl?: string | null, envApiUrl?: string): string {
  if (savedUrl) {
    const normalized = normalizeServerUrl(savedUrl);
    if (normalized) return `${normalized}/api`;
  }
  if (envApiUrl) {
    const trimmed = envApiUrl.trim();
    if (trimmed.endsWith('/api') || trimmed.endsWith('/api/')) {
      return trimmed.replace(/\/+$/, '');
    }
    const normalized = normalizeServerUrl(trimmed);
    if (normalized) return `${normalized}/api`;
  }
  return '/api';
}

/**
 * Resolves the root server origin for WebSocket (Socket.IO) connections.
 * Strips any '/api' sub-paths so the connection connects to the server root.
 *
 * @param savedUrl - The server URL stored in localStorage (if any).
 * @param envApiUrl - The VITE_API_BASE_URL env var (if any).
 * @param originFallback - Default origin (e.g. window.location.origin).
 * @returns Root server URL for Socket.IO.
 */
export function resolveSocketUrl(
  savedUrl?: string | null,
  envApiUrl?: string,
  originFallback?: string
): string {
  if (savedUrl) {
    const normalized = normalizeServerUrl(savedUrl);
    if (normalized) return normalized;
  }
  if (envApiUrl) {
    const normalized = normalizeServerUrl(envApiUrl);
    if (normalized) return normalized;
  }
  return originFallback || (typeof window !== 'undefined' ? window.location.origin : '');
}

/**
 * Parses client-side hash routes of the form `#tab`, `#tab/subtab`, or `#tab/subtab?key=val`.
 * Decodes URI components and isolates query parameters.
 *
 * @param hash - The `window.location.hash` string (e.g. "#christian/parishioners?q=John").
 * @returns Parsed object with `tab`, optional `subTab`, and query `params`.
 */
export function parseHashRoute(hash: string): {
  tab: string;
  subTab?: string;
  params: Record<string, string>;
} {
  const clean = (hash || '').replace(/^#/, '').trim();
  if (!clean) return { tab: '', params: {} };

  const [pathPart, queryPart] = clean.split('?');
  const segments = (pathPart || '')
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  const tab = segments[0] || '';
  const subTab = segments[1] || undefined;
  const params: Record<string, string> = {};

  if (queryPart) {
    try {
      const searchParams = new URLSearchParams(queryPart);
      searchParams.forEach((val, key) => {
        params[key] = val;
      });
    } catch {
      // Ignore query parsing errors
    }
  }

  return { tab, subTab, params };
}
