/* Photos hub — appends a card for any NEW gallery added in the admin (one whose
   slug isn't already one of the built-in cards). Existing cards are untouched,
   so the bespoke layout stays; new galleries "just appear" and link to their
   dynamic page at /photos/<slug>/. No-op until Supabase is configured. */
(function () {
  if (!(window.SR && window.SR.ready)) return;
  const list = document.querySelector('[data-galleries]');
  if (!list) return;
  const known = (list.getAttribute('data-known') || '').split(',').map(s => s.trim()).filter(Boolean);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  window.SR.getGalleries().then(gals => {
    const fresh = (gals || []).filter(g => known.indexOf(g.slug) === -1);
    if (!fresh.length) return;
    let side = list.querySelectorAll('.card-row').length % 2; // continue the alternating rhythm
    fresh.forEach(g => {
      const reverse = side % 2 === 1; side++;
      const media = `<div class="media"><a href="/photos/${encodeURI(g.slug)}/"><img src="${esc(g.hero)}" alt="${esc(g.name)}" loading="lazy"></a></div>`;
      const text = `<div class="text"><h2><a href="/photos/${encodeURI(g.slug)}/">${esc(g.name)}</a></h2><p>${esc(plain(g.intro).slice(0, 220))}</p><span class="cta">View gallery &rarr;</span></div>`;
      const card = document.createElement('div');
      card.className = 'card-row reveal visible' + (reverse ? ' reverse' : '');
      card.innerHTML = media + text;
      list.appendChild(card);
    });
  }).catch(() => {});
})();
