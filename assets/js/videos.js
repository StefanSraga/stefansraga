/* Videos page — renders a category-filterable grid from assets/data/videos.json.
   The data file is the single source of truth: a future backend/CMS can serve the
   same JSON from an API (point data-feed at it), and the owner can edit the file.

   Each video has one field "video":
     - a YouTube link  -> thumbnail + player are derived automatically (paste & done)
     - a path to .mp4  -> self-hosted clip (uses the entry's "poster")
     - "" (empty)      -> a "Coming soon" card
*/
(function () {
  'use strict';

  const root = document.querySelector('[data-videos]');
  if (!root) return;

  const BASE = root.getAttribute('data-base') || '';
  const FEED = root.getAttribute('data-feed') || (BASE + 'assets/data/videos.json');
  const filtersEl = root.querySelector('.vid-filters');
  const gridEl = root.querySelector('.vid-grid');
  const emptyEl = root.querySelector('.vid-empty');

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const asset = p => (/^https?:|^\//.test(p) ? p : BASE + p);

  // pull the 11-char video id out of any YouTube link (or a bare id)
  function youtubeId(v) {
    if (!v) return null;
    const s = String(v).trim();
    const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;      // a bare id
    return null;
  }
  function kind(v) {
    if (!v.video) return 'soon';
    if (youtubeId(v.video)) return 'youtube';
    return 'file';
  }
  function posterFor(v) {
    if (v.poster) return asset(v.poster);
    const id = youtubeId(v.video);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;  // automatic YouTube thumbnail
    return '';
  }

  let DATA = null;
  let active = 'all';

  /* ---------- modal player ---------- */
  const modal = document.createElement('div');
  modal.className = 'vid-modal';
  modal.innerHTML = '<button class="vm-close" aria-label="Close">&times;</button><div class="vm-stage"></div>';
  document.body.appendChild(modal);
  const stage = modal.querySelector('.vm-stage');
  function closeModal() {
    modal.classList.remove('open');
    stage.innerHTML = '';
    document.body.style.overflow = '';
  }
  function openModal(v) {
    const k = kind(v);
    if (k === 'youtube') {
      const id = youtubeId(v.video);
      stage.innerHTML = `<div class="vm-16x9"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    } else if (k === 'file') {
      stage.innerHTML = `<video src="${asset(v.video)}" poster="${posterFor(v)}" controls autoplay playsinline class="${v.orientation === 'portrait' ? 'portrait' : ''}"></video>`;
    } else { return; }
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  modal.querySelector('.vm-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  /* ---------- rendering ---------- */
  function catLabel(id) {
    const c = (DATA.categories || []).find(c => c.id === id);
    return c ? c.label : id;
  }

  function renderFilters() {
    const chips = [{ id: 'all', label: 'All' }, ...(DATA.categories || [])];
    filtersEl.innerHTML = chips.map(c =>
      `<button class="vid-chip${c.id === active ? ' active' : ''}" data-cat="${esc(c.id)}">${esc(c.label)}</button>`
    ).join('');
    filtersEl.querySelectorAll('.vid-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        active = btn.getAttribute('data-cat');
        filtersEl.querySelectorAll('.vid-chip').forEach(b => b.classList.toggle('active', b === btn));
        renderGrid();
      });
    });
  }

  function cardHTML(v, i) {
    const soon = kind(v) === 'soon';
    const overlay = soon
      ? '<span class="vid-soon">Coming soon</span>'
      : '<span class="vid-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
    const poster = posterFor(v);
    return `
      <article class="vid-card${soon ? ' is-soon' : ''}" data-i="${i}" style="--d:${(i % 8) * 60}ms">
        <div class="vid-thumb">
          ${poster ? `<img src="${poster}" alt="${esc(v.title)}" loading="lazy">` : ''}
          ${overlay}
          <span class="vid-tag">${esc(catLabel(v.category))}</span>
        </div>
        <div class="vid-info">
          <h3>${esc(v.title)}</h3>
          <p>${esc(v.description || '')}</p>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = (DATA.videos || []).filter(v => active === 'all' || v.category === active);
    if (!list.length) {
      gridEl.innerHTML = '';
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'No videos in this category yet.'; }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    gridEl.innerHTML = list.map((v, i) => cardHTML(v, i)).join('');
    requestAnimationFrame(() => gridEl.querySelectorAll('.vid-card').forEach(c => c.classList.add('in')));
    gridEl.querySelectorAll('.vid-card').forEach(card => {
      const v = list[+card.getAttribute('data-i')];
      if (kind(v) === 'soon') return;
      card.addEventListener('click', () => openModal(v));
    });
  }

  /* ---------- load ----------
     Prefer the live backend (Supabase) when it's configured; otherwise
     fall back to the static assets/data/videos.json so the page always works. */
  function boot(data) { DATA = data; renderFilters(); renderGrid(); }

  function fromJson() {
    fetch(FEED, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(boot)
      .catch(err => {
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = 'Video feed could not be loaded (run the site from a web server, not file://).';
        }
        console.error('videos feed load failed:', err);
      });
  }

  if (window.SR && window.SR.ready) {
    Promise.all([window.SR.getCategories(), window.SR.getVideos()])
      .then(([categories, videos]) => boot({ categories, videos }))
      .catch(() => fromJson());   // network / RLS issue → static fallback
  } else {
    fromJson();
  }
})();
