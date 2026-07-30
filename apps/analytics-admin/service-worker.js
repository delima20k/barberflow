'use strict';

importScripts('./config/runtime-config.js');

const runtimeConfig = self.ANALYTICS_ADMIN_RUNTIME_CONFIG ?? {};
const buildVersion = runtimeConfig.buildVersion || 'demo-local';
const CACHE_NAME = `analytics-admin-shell-${buildVersion}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/reset.css',
  './css/variables.css',
  './css/global.css',
  './css/components.css',
  './css/responsive.css',
  './config/runtime-config.js',
  './config/admin-config.js',
  './config/event-catalog.js',
  './utils/DateRange.js',
  './utils/Formatters.js',
  './utils/SpreadsheetValueSanitizer.js',
  './utils/CsvExporter.js',
  './utils/ExcelExporter.js',
  './services/SupabaseClientFactory.js',
  './services/AuthService.js',
  './services/MockAnalyticsDataSource.js',
  './services/AnalyticsRepository.js',
  './services/MetricsService.js',
  './services/RealtimeAnalyticsService.js',
  './services/PresenceService.js',
  './services/SnapshotService.js',
  './services/ExportService.js',
  './components/FilterBar.js',
  './components/MetricGrid.js',
  './components/FunnelView.js',
  './components/SessionTable.js',
  './components/SessionTimeline.js',
  './components/ToastCenter.js',
  './components/OfflineState.js',
  './components/AppShell.js',
  './pages/LoginPage.js',
  './pages/DashboardPage.js',
  './pages/FunnelPage.js',
  './pages/SessionsPage.js',
  './js/router.js',
  './js/app.js',
  './assets/images/logo.png',
  './assets/images/login-background.webp',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
];

if (runtimeConfig.mode === 'supabase') {
  APP_SHELL.push('./assets/vendor/supabase.min.js');
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (names) => {
      for (const name of names) {
        const isOwnedPreviousVersion = (
          name.startsWith('analytics-admin-shell-')
          && name !== CACHE_NAME
        );
        if (isOwnedPreviousVersion) await caches.delete(name);
      }
    }),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = event.request.mode === 'navigate';
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => (
        (await caches.match(event.request))
        || (isDocument ? caches.match('./index.html') : Response.error())
      )),
  );
});
