/* AEML, NTUST -- cross-origin isolation loader for GitHub Pages.
 * GitHub Pages cannot send COOP/COEP headers, so aeml-sw.js adds them.
 * Inside the Blogger iframe it adds Document-Isolation-Policy instead,
 * which lets this page be isolated even though Blogger is not.
 * SPDX-License-Identifier: GPL-2.0-or-later */
(function () {
  'use strict';
  if (window.crossOriginIsolated) return;
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  var url = new URL(location.href);
  var tried = url.searchParams.get('aemlcoi') === '1';
  function reloadOnce() {
    if (tried) {
      window.__aemlNotIsolated = true; /* bridge reports this to the shell */
      return;
    }
    url.searchParams.set('aemlcoi', '1');
    location.replace(url.toString());
  }
  navigator.serviceWorker.register('./aeml-sw.js').then(function (reg) {
    if (navigator.serviceWorker.controller) { reloadOnce(); return; }
    var sw = reg.installing || reg.waiting || reg.active;
    if (sw && sw.state === 'activated') { reloadOnce(); return; }
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    if (sw) sw.addEventListener('statechange', function () { if (sw.state === 'activated') setTimeout(reloadOnce, 50); });
  }).catch(function (e) {
    window.__aemlNotIsolated = true;
    console.warn('[AEML, NTUST] service worker registration failed', e);
  });
})();
