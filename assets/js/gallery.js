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
    document.title = g.name + ' | Štefan Šraga';
    main.innerHTML = window.SRender.galleryBody(g);
    if (window.SRTiles) window.SRTiles(main);        // orientation-aware tile spans
    if (window.SRLightbox) window.SRLightbox(main);  // re-bind click-to-zoom
  }).catch(() => {});
})();
