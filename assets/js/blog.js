/* Blog list — replace the static cards with live data when the backend is on,
   plus client-side search and tag filters (diacritics-insensitive).
   NOTE: postCard is passed as a bare reference on purpose — Array.map supplies
   (post, index) and index 0 becomes the featured poster frame. */
(function () {
  if (!(window.SR && window.SR.ready && window.SRender)) return;
  const list = document.querySelector('.post-list');
  if (!list) return;

  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const plain = h => String(h || '').replace(/<[^>]+>/g, ' ');

  window.SR.getPosts().then(posts => {
    if (!(posts && posts.length)) return;

    let q = '';
    let tag = 'all';

    function render() {
      const hit = posts.filter(p => {
        const okTag = tag === 'all' || (p.tags || []).includes(tag);
        if (!okTag) return false;
        if (!q) return true;
        return fold([p.title, p.excerpt, plain(p.body), (p.tags || []).join(' ')].join(' ')).includes(q);
      });
      list.innerHTML = hit.length
        ? hit.map(window.SRender.postCard).join('\n')
        : '<p class="blog-empty mono">Nic nenalezeno.</p>';
      if (window.SRHud) window.SRHud(list);   // timecode + view count-ups on injected nodes
    }

    // search box + tag chips (only shown when live data is available)
    const tags = [...new Set(posts.flatMap(p => p.tags || []))];
    const tools = document.createElement('div');
    tools.className = 'blog-tools';
    tools.innerHTML = `
      <input class="blog-search" type="search" placeholder="Hledat v článcích…" aria-label="Hledat v článcích">
      ${tags.length ? `<button class="vid-chip active" data-tag="all">Vše</button>` +
        tags.map(t => `<button class="vid-chip" data-tag="${window.SRender.esc(t)}">${window.SRender.esc(t)}</button>`).join('') : ''}`;
    list.parentNode.insertBefore(tools, list);

    tools.querySelector('.blog-search').addEventListener('input', e => {
      q = fold(e.target.value.trim());
      render();
    });
    tools.querySelectorAll('.vid-chip').forEach(btn => btn.addEventListener('click', () => {
      tag = btn.getAttribute('data-tag');
      tools.querySelectorAll('.vid-chip').forEach(b => b.classList.toggle('active', b === btn));
      render();
    }));

    render();
  }).catch(() => {});
})();
