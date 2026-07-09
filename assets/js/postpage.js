/* Blog post — refresh the article from live data (existing pages) or render a
   brand-new post from its slug (dynamic /post/view/ route). */
(function () {
  if (!(window.SR && window.SR.ready && window.SRender)) return;
  const main = document.querySelector('main.page');
  if (!main) return;
  const m = location.pathname.match(/\/post\/([^\/]+)\/?/);
  if (!m) return;
  const slug = decodeURIComponent(m[1]);
  if (slug === 'view') return;                 // the bare dynamic template, nothing to load
  window.SR.getPost(slug).then(p => {
    if (!p) {
      // Published→unpublished (or deleted): don't keep serving the old static
      // article — send the visitor back to the blog list.
      location.replace('/blogs/');
      return;
    }
    document.title = p.title;
    const art = main.querySelector('article');
    const html = window.SRender.postArticle(p);
    if (art) art.outerHTML = html;
    else main.insertAdjacentHTML('afterbegin', html);
  }).catch(() => {});
})();
