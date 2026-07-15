/* Cookie consent — a small, self-contained banner (no dependencies, works even
   if the backend is down). The site itself sets only essential/functional
   storage; the choice here is recorded so any future analytics can gate on it.

   window.SRConsent()            → 'accepted' | 'declined' | null
   window.SRopenCookieSettings() → re-open the banner so the visitor can change
                                   their mind (wired to the footer link). */
(function () {
  'use strict';
  var KEY = 'sr_cookie_consent';
  var store = {
    get: function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  };
  window.SRConsent = store.get;

  var bar = null;

  function build() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie notice');
    bar.setAttribute('aria-live', 'polite');
    // path prefix to reach /cookies/ from any depth (post/<slug>/ is 2 levels deep)
    var depth = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length;
    var prefix = depth <= 0 ? '' : new Array(depth + 1).join('../');
    bar.innerHTML =
      '<p class="cookie-text">This site uses only <strong>essential and functional</strong> cookies to work and to count content views. ' +
      'Embedded videos (YouTube) may set their own cookies when you play them. ' +
      '<a href="' + prefix + 'cookies/">Cookie&nbsp;Policy</a>.</p>' +
      '<div class="cookie-actions">' +
        '<button type="button" class="cookie-btn cookie-decline">Decline</button>' +
        '<button type="button" class="cookie-btn cookie-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(bar);
    bar.querySelector('.cookie-accept').addEventListener('click', function () { choose('accepted'); });
    bar.querySelector('.cookie-decline').addEventListener('click', function () { choose('declined'); });
    return bar;
  }

  // setTimeout (not rAF) so the slide-in also fires reliably in the preview
  // pane's compositor; 20ms lets the element paint at its start transform first
  function show() { build(); setTimeout(function () { bar.classList.add('open'); }, 20); }
  function hide() { if (bar) bar.classList.remove('open'); }

  function choose(value) {
    store.set(value);
    hide();
    // Hook for the future: only run non-essential scripts (e.g. analytics) on
    // 'accepted'. Nothing non-essential is loaded today, so this is a no-op.
    if (value === 'accepted' && typeof window.SRonConsent === 'function') {
      try { window.SRonConsent(); } catch (e) {}
    }
  }

  // let the footer "Cookie settings" link re-open the banner
  window.SRopenCookieSettings = function () { show(); };
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.cookie-settings');
    if (t) { e.preventDefault(); show(); }
  });

  // first visit (no choice stored yet) → show the banner
  if (!store.get()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  }
})();
