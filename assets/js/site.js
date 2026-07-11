/* Site content hydrator — lets the owner edit page texts/images from /admin.
   Editable elements carry one of:
     data-cms-text="key"   → textContent
     data-cms-html="key"   → innerHTML (for text with <span class="green"> etc.)
     data-cms-src="key"    → img src
     data-cms-mail="key"   → sets text + mailto: href
     data-cms-tel="key"    → sets text + tel: href
     data-cms-attr="attr:key" → sets an arbitrary attribute (e.g. the hero
                                typewriter's data-pairs), then re-inits the
                                typewriter so a live edit takes effect at once
   Values live in the settings table under 'cms_<key>'. Until the owner
   fills one in, the built-in static content stays (graceful fallback). */
(function () {
  if (!(window.SR && window.SR.ready && typeof window.SR.getSettings === 'function')) return;
  const nodes = document.querySelectorAll('[data-cms-text],[data-cms-html],[data-cms-src],[data-cms-mail],[data-cms-tel],[data-cms-attr]');
  if (!nodes.length) return;

  window.SR.getSettings().then(S => {
    const get = key => {
      const v = S['cms_' + key];
      if (v == null) return undefined;
      return (typeof v === 'object' && v !== null && 'v' in v) ? v.v : v;   // stored raw string or {v:…}
    };
    nodes.forEach(el => {
      let k, v;
      if ((k = el.getAttribute('data-cms-text')) != null && (v = get(k)) != null) el.textContent = v;
      if ((k = el.getAttribute('data-cms-html')) != null && (v = get(k)) != null) el.innerHTML = v;
      if ((k = el.getAttribute('data-cms-src'))  != null && (v = get(k)) != null) el.setAttribute('src', v);
      if ((k = el.getAttribute('data-cms-mail')) != null && (v = get(k)) != null) { el.textContent = v; el.setAttribute('href', 'mailto:' + v); }
      if ((k = el.getAttribute('data-cms-tel'))  != null && (v = get(k)) != null) { el.textContent = v; el.setAttribute('href', 'tel:' + String(v).replace(/\s+/g, '')); }
      if ((k = el.getAttribute('data-cms-attr')) != null) {
        const ci = k.indexOf(':');
        if (ci > 0 && (v = get(k.slice(ci + 1))) != null) {
          el.setAttribute(k.slice(0, ci), v);
          // hero phrases changed → re-run the typewriter loop with the new pairs
          if (el.hasAttribute('data-typewriter') && typeof window.SRTypewriter === 'function') window.SRTypewriter();
        }
      }
    });
  }).catch(() => {});
})();
