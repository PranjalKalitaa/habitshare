// sw.js — HabitShare Service Worker
// Provides offline support and PWA installability

const CACHE_NAME = 'habitshare-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/firebase-init.js',
  '/js/auth.js',
  '/js/app.js',
  '/manifest.json',
];

// Install: cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve from network first, then fall back to cache if offline (network-first strategy)
self.addEventListener('fetch', (event) => {
  // Don't intercept API/server/external calls — let them go to network always
  if (
    event.request.url.includes('localhost:4000') ||
    event.request.url.includes('onrender.com') ||
    event.request.url.includes('firebaseio.com') ||
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('stripe.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (
          response &&
          response.status === 200 &&
          event.request.method === 'GET'
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request);
      })
  );
});
