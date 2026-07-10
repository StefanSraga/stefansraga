/* Blog post — refresh the article from live data (existing pages) or render a
   brand-new post from its slug (dynamic /post/view/ route). Also injects the
   "related frames" strip, counts real views and shows a draft banner when a
   logged-in admin previews an unpublished post. */
(function () {
  if (!(window.SR && window.SR.ready && window.SRender)) return;
  const main = document.querySelector('main.page');
  if (!main) return;
  const m = location.pathname.match(/\/post\/([^\/]+)\/?/);
  if (!m) return;
  const slug = decodeURIComponent(m[1]);
  if (slug === 'view') return;                 // the bare dynamic template, nothing to load
  window.SR.getPost(slug).then(async p => {
    if (!p) {
      // Published→unpublished (or deleted): don't keep serving the old static
      // article — send the visitor back to the blog list.
      location.replace('/blogs/');
      return;
    }
    document.title = p.title;

    // real view counting — once per browser session per article
    const seenKey = 'viewed:' + slug;
    if (p.published && !sessionStorage.getItem(seenKey)) {
      sessionStorage.setItem(seenKey, '1');
      p.views = (p.views || 0) + 1;            // show the count including this visit
      window.SR.bumpViews(slug);
    }

    let related = [];
    try {
      const all = await window.SR.getPosts();
      related = (all || []).filter(x => x.slug !== slug).slice(0, 3);
    } catch (e) { /* strip simply doesn't render */ }
    const old = main.querySelector('.recent-posts');
    if (old) old.remove();                     // static aside — replaced by the live strip
    const art = main.querySelector('article');
    const html = window.SRender.postArticle(p, related);
    if (art) art.outerHTML = html;
    else main.insertAdjacentHTML('afterbegin', html);

    // draft preview (only a logged-in admin can ever receive an unpublished post)
    if (!p.published) {
      main.insertAdjacentHTML('afterbegin',
        '<div class="draft-banner mono">N&Aacute;HLED KONCEPTU &mdash; &#269;l&aacute;nek nen&iacute; zve&#345;ejn&#283;n&yacute;. Vid&iacute;&scaron; ho jen ty (p&#345;ihl&aacute;&scaron;en&yacute; admin).</div>');
    }

    if (window.SRHud) window.SRHud(main);      // start timecode + view count-up on injected nodes
  }).catch(() => {});
})();
