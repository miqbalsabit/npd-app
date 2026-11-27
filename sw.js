/* NPD service worker – caches the static app shell only (code, styles, icons). Never touches data:
 * business data lives in the device database (IndexedDB) and on api.github.com, which this worker ignores. */
const BUILD = 'b11271530';
const CACHE = 'npd-shell-' + BUILD;
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'img/brand/badge.png', 'img/brand/reclub.png',
  ...['util', 'store', 'engine', 'router', 'ops', 'fin', 'credits', 'loyalty', 'matchmaker', 'reports', 'seed', 'sync'].map(f => 'js/backend/' + f + '.js'),
  ...['core', 'forms', 'loyalty_card', 'pages_ops', 'pages_match', 'pages_fin', 'main'].map(f => 'js/app/' + f + '.js')];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => undefined)); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('npd-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;           // GitHub API & fonts: browser handles them
  if (url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./', cp)); return r; }).catch(() => caches.match('./').then(h => h || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => { const hit = await c.match(req); const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; }));
});
