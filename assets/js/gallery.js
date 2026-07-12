/* Gallery page — refresh hero + intro + photo grid from live data.
   Works for the existing static galleries at /<slug>/ AND for brand-new
   galleries added in the admin, served by the dynamic /photos/<slug>/ route. */
(function () {
  if (!(window.SR && window.SR.ready && window.SRender)) return;
  const main = document.querySelector('main.page');
  if (!main) return;

  const segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  let slug = null;
  if (segs[0] === 'photos' && segs[1] && segs[1] !== 'view') slug = decodeURIComponent(segs[1]);
  else if (segs.length === 1) slug = decodeURIComponent(segs[0]);   // legacy root gallery
  if (!slug) return;

  window.SR.getGallery(slug).then(g => {
    if (!g) {
      // Published→unpublished (or deleted): don't keep serving the old static
      // gallery — send the visitor back to the photo hub.
      location.replace('/photos/');
      return;
    }
    // full head meta — ONLY for galleries served by the bare /photos/view/
    // template (admin-created). Static gallery pages ship hand-crafted SEO
    // copy — never overwrite it with the plain DB name.
    const isStatic = !!document.head.querySelector('link[rel="canonical"]');
    if (!isStatic) {
      const introText = String(g.intro || g.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const gDesc = introText
        ? (introText.length > 158 ? introText.slice(0, 158).replace(/\s\S*$/, '') + '…' : introText)
        : g.name + ' — photo gallery by Štefan Šraga.';
      const hero = (g.images && g.images[0] && g.images[0].url) ? new URL(g.images[0].url, location.href).href : null;
      // legacy root galleries canonicalize to their real static URL /<slug>/
      // (vercel.json also 301s /photos/<legacy>/ there — this is the backstop)
      const LEGACY = ['football', 'icehockey', 'events', 'cars', 'rallypraguerevival', 'urbex', 'comicconprague'];
      const canonPath = (segs[0] === 'photos' && !LEGACY.includes(slug))
        ? '/photos/' + encodeURI(slug) + '/'
        : '/' + encodeURI(slug) + '/';
      if (window.SRMeta) window.SRMeta({
        title: g.name + ' | Štefan Šraga',
        desc: gDesc,
        image: hero,
        url: 'https://www.stefansraga.com' + canonPath,
      });
      else document.title = g.name + ' | Štefan Šraga';
    }
    main.innerHTML = window.SRender.galleryBody(g);
    if (window.SRTiles) window.SRTiles(main);        // orientation-aware tile spans
    if (window.SRLightbox) window.SRLightbox(main);  // re-bind click-to-zoom
  }).catch(() => {});
})();
