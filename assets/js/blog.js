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

  // reserve the tools row's space SYNCHRONOUSLY — inserting it after the
  // Supabase round-trip pushed the whole list (incl. the LCP cover) down
  const toolsSlot = document.createElement('div');
  toolsSlot.className = 'blog-tools';
  toolsSlot.style.minHeight = '46px';
  list.parentNode.insertBefore(toolsSlot, list);

  window.SR.getPosts().then(posts => {
    if (!(posts && posts.length)) { toolsSlot.remove(); return; }

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
        : '<p class="blog-empty mono">No results found.</p>';
      if (window.SRHud) window.SRHud(list);   // timecode + view count-ups on injected nodes
    }

    // search box + tag chips fill the pre-reserved slot (no layout shift)
    const tags = [...new Set(posts.flatMap(p => p.tags || []))];
    const tools = toolsSlot;
    tools.innerHTML = `
      <input class="blog-search" type="search" placeholder="Search articles…" aria-label="Search articles">
      ${tags.length ? `<button class="vid-chip active" data-tag="all">All</button>` +
        tags.map(t => `<button class="vid-chip" data-tag="${window.SRender.esc(t)}">${window.SRender.esc(t)}</button>`).join('') : ''}`;

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
