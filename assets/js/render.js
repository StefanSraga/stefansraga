/* Shared public renderers (used by the live hydrators + dynamic templates).
   Markup mirrors the generated static HTML so the existing CSS styles it the same.
   All internal links are root-relative (work on Vercel from the domain root). */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HEART = '<svg class="heart" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.5 5.5 4.7 4.6 6.9 4 9 5 12 8c3-3 5.1-4 7.3-3.4 3.2.9 4.1 4.4 2.7 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  /* THE CONTACT SHEET card. i === 0 → the featured poster frame (position-
     driven, no data field). NOTE: blog.js relies on posts.map(postCard) passing
     the index — keep the (p, i) signature if you ever refactor. */
  function postCard(p, i) {
    const featured = i === 0;
    const wide = !featured && p.layout === 'wide';   // owner-chosen rectangular card
    const excerpt = (p.excerpt && p.excerpt.trim()) || plain(p.body).slice(0, 190);
    const rt = (p.read_time || '').trim();
    const views = parseInt(p.views, 10) || 0;
    // meta: guarded so nothing dangles when read_time is missing
    const meta = featured
      ? `<div class="meta"><span class="tc" data-timer>00:00:00</span><span class="rec">&#9679; REC</span><span>${esc(p.date)}</span>${rt ? `<span>&middot; ${esc(rt)}</span>` : ''}</div>`
      : `<div class="meta"><span>${esc(p.date)}</span>${rt ? `<span>&middot;</span><span>${esc(rt)}</span>` : ''}</div>`;
    return `<a class="post-card reveal visible${featured ? ' featured' : ''}${wide ? ' wide' : ''}" href="/post/${encodeURI(p.slug)}/">
      <div class="cover">${p.cover ? `<img src="${esc(p.cover)}" alt="${esc(p.title)}" loading="${featured ? 'eager' : 'lazy'}">` : ''}</div>
      <div class="body">
        ${meta}
        <h2>${esc(p.title)}${featured ? ' <span class="glitch">&#9646;&#9642;</span>' : ''}</h2>
        <p class="excerpt">${excerpt ? esc(excerpt) + '&hellip;' : ''}</p>
        <div class="card-foot"><span class="read">Read story</span><span class="views"><b data-count="${views}">${views}</b> zobrazen&iacute; ${HEART}</span></div>
      </div>
    </a>`;
  }

  /* Article = the poster zoomed in: viewfinder hero melting into the page,
     mono EXIF slate, drop-cap prose, camera-slate footer, related frames. */
  function postArticle(p, related) {
    const rt = (p.read_time || '').trim();
    const views = parseInt(p.views, 10) || 0;
    const kicker = `<div class="post-kicker"><span class="k-name">&#9626; &Scaron;TEFAN &Scaron;RAGA</span><span class="tc" data-timer>00:00:00</span><span>${esc(p.date)}${rt ? ' &middot; ' + esc(rt) : ''}</span></div>`;
    const inner = `${kicker}<h1>${esc(p.title)} <span class="glitch">&#9646;&#9642;</span></h1>`;
    const hero = p.cover
      ? `<header class="post-hero"><div class="post-hero-media"><img src="${esc(p.cover)}" alt="${esc(p.title)}"></div><span class="crop-tr"></span><span class="crop-bl"></span><div class="post-hero-inner">${inner}</div></header>`
      : `<header class="post-hero post-hero--nocover"><span class="crop-tr"></span><span class="crop-bl"></span><div class="post-hero-inner">${inner}</div></header>`;
    const exif = `<div class="post-exif"><span>SHOT <b>${esc(p.date)}</b></span>${rt ? `<span>&middot; ${esc(rt)}</span>` : ''}<span>&middot; <span class="views-dot">&#9679;</span> <b data-count="${views}">${views}</b> ZOBRAZEN&Iacute;</span><span>&middot; /${esc(p.slug)}</span></div>`;
    const relStrip = (related && related.length)
      ? `<aside class="recent-posts"><div class="rp-head"><strong>Nejnov&#283;j&scaron;&iacute; p&#345;&iacute;sp&#283;vky</strong> <a href="/blogs/">Zobrazit v&scaron;e</a></div><div class="rp-grid">${related.map(o =>
          `<a class="rp-card" href="/post/${encodeURI(o.slug)}/"><img src="${esc(o.cover)}" alt="${esc(o.title)}" loading="lazy"><span class="rp-title">${esc(o.title)}</span></a>`).join('')}</div></aside>`
      : '';
    return `<article>
      ${hero}
      ${exif}
      <div class="prose">
        ${p.body || ''}
        <a class="back-to-blog" href="/blogs/">&#9664; Back to blog</a>
      </div>
      <div class="frame-out">&#8976; FRAME OUT &#172;</div>
      <div class="post-foot"><span><span class="views-dot">&#9679;</span> <b data-count="${views}">${views}</b> zobrazen&iacute;</span><span>© Štefan Šraga</span></div>
    </article>${relStrip}`;
  }

  function galleryBody(g) {
    const imgs = (g.images || []);
    const grid = imgs.map(im => `<a href="${esc(im.url)}"><img src="${esc(im.url)}" alt="${esc(im.alt || '')}" loading="lazy"></a>`).join('\n');
    return `<div class="gallery-hero"><img src="${esc(g.hero)}" alt="${esc(g.name)}"></div>
      ${g.intro ? `<div class="gallery-intro reveal visible">${g.intro}</div>` : ''}
      <div class="masonry photo-grid-lb reveal visible">${grid}</div>`;
  }

  window.SRender = { postCard, postArticle, galleryBody, esc };
})();
