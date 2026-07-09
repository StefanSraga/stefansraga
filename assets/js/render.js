/* Shared public renderers (used by the live hydrators + dynamic templates).
   Markup mirrors the generated static HTML so the existing CSS styles it the same.
   All internal links are root-relative (work on Vercel from the domain root). */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HEART = '<svg class="heart" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.5 5.5 4.7 4.6 6.9 4 9 5 12 8c3-3 5.1-4 7.3-3.4 3.2.9 4.1 4.4 2.7 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  function postCard(p) {
    const excerpt = (p.excerpt && p.excerpt.trim()) || plain(p.body).slice(0, 190);
    return `<a class="post-card reveal visible" href="/post/${encodeURI(p.slug)}/">
      <div class="cover"><img src="${esc(p.cover)}" alt="${esc(p.title)}" loading="lazy"></div>
      <div class="body">
        <div class="meta"><span>${esc(p.date)}</span><span>·</span><span>${esc(p.read_time || '')}</span></div>
        <h2>${esc(p.title)}</h2>
        <p class="excerpt">${esc(excerpt)}&hellip;</p>
        <div class="card-foot"><span>${esc((p.views || 0) + ' zobrazení')}</span>${HEART}</div>
      </div>
    </a>`;
  }

  function postArticle(p) {
    return `<article>
      <div class="post-header">
        <div class="meta"><span>${esc(p.date)}</span><span>·</span><span>${esc(p.read_time || '')}</span></div>
        <h1>${esc(p.title)}</h1>
      </div>
      <div class="prose">
        ${p.body || ''}
        <a class="back-to-blog" href="/blogs/">&larr; Back to blog</a>
      </div>
      <div class="post-foot"><span>${esc((p.views || 0) + ' zobrazení')}</span><span>© Štefan Šraga</span></div>
    </article>`;
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
