// =============================================================================
// Ecclesia CMS — Service Worker (Manual Registration)
// =============================================================================
//
// PURPOSE
//   Provides offline-first caching for static assets and critical API responses.
//   Registered manually from main.tsx instead of via vite-plugin-pwa to avoid
//   build compatibility issues with the existing JSX patterns.
//
// CACHING STRATEGY
//   - Static assets (JS, CSS, fonts, icons): Cache-First
//   - Critical API responses: Network-First with 5s timeout, fallback to cache
//   - Other API responses: Stale-While-Revalidate
// =============================================================================

const CACHE_NAME = 'ecclesia-v1';
const STATIC_CACHE = 'ecclesia-static-v1';
const API_CACHE = 'ecclesia-api-v1';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// Install: pre-cache critical static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Silently fail for missing assets during development
        console.log('[SW] Some precache assets unavailable, skipping.');
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: route requests to appropriate cache strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  // API requests: Network-First with fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithTimeout(request, 5000));
    return;
  }

  // Static assets: Cache-First
  event.respondWith(cacheFirst(request));
});

// Cache-First strategy: serve from cache, fallback to network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Network-First with timeout: try network, fallback to cache if slow or failed
async function networkFirstWithTimeout(request, timeoutMs) {
  const cache = await caches.open(API_CACHE);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed or timed out — try cache
    const cached = await cache.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'Offline — data not available' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
