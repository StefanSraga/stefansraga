/* Blog list — replace the static cards with live data when the backend is on.
   NOTE: postCard is passed as a bare reference on purpose — Array.map supplies
   (post, index) and index 0 becomes the featured poster frame. */
(function () {
  if (!(window.SR && window.SR.ready && window.SRender)) return;
  const list = document.querySelector('.post-list');
  if (!list) return;
  window.SR.getPosts().then(posts => {
    if (posts && posts.length) {
      list.innerHTML = posts.map(window.SRender.postCard).join('\n');
      if (window.SRHud) window.SRHud(list);   // start timecode + view count-ups on injected nodes
    }
  }).catch(() => {});
})();
