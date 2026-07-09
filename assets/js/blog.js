/* Blog list — replace the static cards with live data when the backend is on. */
(function () {
  if (!(window.SR && window.SR.ready && window.SRender)) return;
  const list = document.querySelector('.post-list');
  if (!list) return;
  window.SR.getPosts().then(posts => {
    if (posts && posts.length) list.innerHTML = posts.map(window.SRender.postCard).join('\n');
  }).catch(() => {});
})();
