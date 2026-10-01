/* AEML, NTUST -- adds isolation headers that GitHub Pages cannot send.
 *  - iframe navigations (the Blogger embed): Document-Isolation-Policy
 *  - top-level navigations (opened directly): COOP + COEP
 *  - same-origin sub-resources (workers, wasm): COEP + DIP + CORP
 * SPDX-License-Identifier: GPL-2.0-or-later */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  /* the phone controller page needs no isolation; leave it untouched */
  if (/\/pad\.html$/.test(new URL(req.url).pathname)) return;
  e.respondWith(fetch(req).then(function (res) {
    if (!res || res.status === 0 || res.type === 'opaqueredirect') return res;
    var h = new Headers(res.headers);
    if (req.mode === 'navigate' && req.destination === 'iframe') {
      h.set('Document-Isolation-Policy', 'isolate-and-require-corp');
    } else if (req.mode === 'navigate') {
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    } else {
      h.set('Cross-Origin-Embedder-Policy', 'require-corp');
      h.set('Document-Isolation-Policy', 'isolate-and-require-corp');
      h.set('Cross-Origin-Resource-Policy', 'same-origin');
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }));
});
