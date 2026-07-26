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
  const pagerEl = document.createElement('nav');
  pagerEl.className = 'vid-pager';
  pagerEl.setAttribute('aria-label', 'Video pagination');
  if (emptyEl && emptyEl.parentNode) emptyEl.parentNode.insertBefore(pagerEl, emptyEl.nextSibling);
  else root.appendChild(pagerEl);

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
  // Photo list of an entry. Accepts every shape the data can arrive in:
  // a plain array of paths (static JSON), a jsonb array of {url} rows or of
  // strings (Supabase "images" column), or a JSON string. Anything else → [].
  function imagesOf(v) {
    let a = v && v.images;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { return []; } }
    if (!Array.isArray(a)) return [];
    return a.map(x => (typeof x === 'string' ? x : (x && (x.url || x.src)) || '')).filter(Boolean);
  }
  function kind(v) {
    if (v.video) return youtubeId(v.video) ? 'youtube' : 'file';
    if (imagesOf(v).length) return 'gallery';   // photo-only entry (e.g. a collab)
    return 'soon';
  }
  function posterFor(v) {
    if (v.poster) return asset(v.poster);
    const id = youtubeId(v.video);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;  // automatic YouTube thumbnail
    const imgs = imagesOf(v);
    if (imgs.length) return asset(imgs[0]);
    return '';
  }

  let DATA = null;
  let active = 'all';
  let page = 1;
  const PER_PAGE = parseInt(root.getAttribute('data-per-page'), 10) || 9;

  // prefer the smaller rendition on slow links, data-saver AND small screens
  // (a phone gains nothing from the 1280px encode; iOS has no connection API)
  function wantLo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const et = conn.effectiveType || '';
      if (conn.saveData || et === 'slow-2g' || et === '2g' || et === '3g' ||
          (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 2.5)) return true;
    }
    return window.matchMedia('(max-width: 820px)').matches;
  }
  // Candidate sources for a self-hosted entry, best first. Renditions are
  // derived from the path convention assets/video/opt/<id>-{hi,lo}.mp4, so
  // this works for LIVE DB rows too (they carry no videoHi/videoLo fields);
  // a missing rendition just 404s and the <source> chain falls through to
  // the original file.
  function videoSources(v) {
    const list = [];
    const pick = wantLo() ? (v.videoLo || v.videoHi) : (v.videoHi || v.videoLo);
    if (pick) list.push(pick);
    const m = String(v.video || '').match(/^(.*assets\/video\/)([^\/]+)\.mp4$/i);
    if (m && !m[2].startsWith('opt/')) list.push(`${m[1]}opt/${m[2]}-${wantLo() ? 'lo' : 'hi'}.mp4`);
    list.push(v.video);
    return [...new Set(list.filter(Boolean))];
  }

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
      // playsinline: keep playback inside the modal on iPhone (no forced fullscreen)
      stage.innerHTML = `<div class="vm-16x9"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1" title="${esc(v.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    } else if (k === 'file') {
      const srcs = videoSources(v).map(s => `<source src="${asset(s)}" type="video/mp4">`).join('');
      stage.innerHTML = `<video poster="${posterFor(v)}" controls autoplay playsinline class="${v.orientation === 'portrait' ? 'portrait' : ''}">${srcs}</video>`;
    } else if (k === 'gallery') {
      let idx = 0;
      const imgs = imagesOf(v).map(asset);
      const draw = () => {
        stage.innerHTML = `<div class="vm-gallery">
          <img src="${imgs[idx]}" alt="${esc(v.title)}">
          ${imgs.length > 1 ? `<button class="vm-gnav vm-gprev" aria-label="Previous">&#8249;</button><button class="vm-gnav vm-gnext" aria-label="Next">&#8250;</button><span class="vm-gcount">${idx + 1} / ${imgs.length}</span>` : ''}
        </div>`;
        const p = stage.querySelector('.vm-gprev'), n = stage.querySelector('.vm-gnext');
        if (p) p.onclick = e => { e.stopPropagation(); idx = (idx - 1 + imgs.length) % imgs.length; draw(); };
        if (n) n.onclick = e => { e.stopPropagation(); idx = (idx + 1) % imgs.length; draw(); };
      };
      draw();
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
        page = 1;   // new filter → back to first page
        filtersEl.querySelectorAll('.vid-chip').forEach(b => b.classList.toggle('active', b === btn));
        renderGrid();
      });
    });
  }

  function cardHTML(v, i) {
    const k = kind(v);
    const soon = k === 'soon';
    const nPhotos = k === 'gallery' ? imagesOf(v).length : 0;
    // a photo-only entry gets a photo-stack icon + shot count; a play triangle
    // there would promise a video that never plays
    const overlay = soon
      ? '<span class="vid-soon">Coming soon</span>'
      : k === 'gallery'
        ? '<span class="vid-play is-photos" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 4H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8.5 11l2.25-3 1.75 2.25 2.5-3.25L21 15h-9.5zM4 8H2v12a2 2 0 0 0 2 2h12v-2H4V8z"/></svg></span>'
        : '<span class="vid-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';
    const poster = posterFor(v);
    return `
      <article class="vid-card${soon ? ' is-soon' : ''}" data-i="${i}" style="--d:${(i % 8) * 60}ms">
        <div class="vid-thumb">
          ${poster ? `<img src="${poster}" alt="${esc(v.title)}" loading="lazy">` : ''}
          ${overlay}
          <span class="vid-tag">${esc(catLabel(v.category))}</span>
          ${nPhotos ? `<span class="vid-nphotos">${nPhotos} photo${nPhotos > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="vid-info">
          <h3>${esc(v.title)}</h3>
          <p>${esc(v.description || '')}</p>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = (DATA.videos || []).filter(v => active === 'all' || v.category === active);
    const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (page > pageCount) page = pageCount;
    if (!list.length) {
      gridEl.innerHTML = '';
      renderPager(1);
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = 'No videos in this category yet.'; }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);   // only this page's cards
    gridEl.innerHTML = slice.map((v, i) => cardHTML(v, i)).join('');
    requestAnimationFrame(() => gridEl.querySelectorAll('.vid-card').forEach(c => c.classList.add('in')));
    gridEl.querySelectorAll('.vid-card').forEach(card => {
      const v = slice[+card.getAttribute('data-i')];
      if (kind(v) === 'soon') return;
      card.addEventListener('click', () => openModal(v));
    });
    renderPager(pageCount);
  }

  // page navigation — appears only once the list overflows one page
  function renderPager(pageCount) {
    if (pageCount <= 1) { pagerEl.innerHTML = ''; return; }
    let html = `<button class="vp-btn vp-arrow" data-go="prev"${page === 1 ? ' disabled' : ''} aria-label="Previous">&#8249;</button>`;
    for (let i = 1; i <= pageCount; i++) html += `<button class="vp-btn vp-num${i === page ? ' active' : ''}" data-go="${i}">${i}</button>`;
    html += `<button class="vp-btn vp-arrow" data-go="next"${page === pageCount ? ' disabled' : ''} aria-label="Next">&#8250;</button>`;
    pagerEl.innerHTML = html;
    pagerEl.querySelectorAll('.vp-btn').forEach(b => b.addEventListener('click', () => {
      const g = b.getAttribute('data-go');
      if (g === 'prev') page = Math.max(1, page - 1);
      else if (g === 'next') page = Math.min(pageCount, page + 1);
      else page = +g;
      renderGrid();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
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

  // Safety net for photo-only entries: the DB now carries them in videos.images,
  // but until that row exists the static JSON keeps the entry on the page.
  // Matching on title as well as id is what stops it showing twice once the
  // same entry has been created in the backend (the DB row gets a fresh uuid).
  function withStaticGalleries(categories, videos) {
    return fetch(FEED, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (j && Array.isArray(j.videos)) {
          const key = s => String(s || '').trim().toLowerCase();
          const have = new Set(videos.map(v => v.id));
          const titles = new Set(videos.map(v => key(v.title)));
          j.videos
            .filter(v => imagesOf(v).length && !have.has(v.id) && !titles.has(key(v.title)))
            .forEach(v => videos.push(v));
        }
        return { categories, videos };
      })
      .catch(() => ({ categories, videos }));
  }

  if (window.SR && window.SR.ready) {
    Promise.all([window.SR.getCategories(), window.SR.getVideos()])
      .then(([categories, videos]) => withStaticGalleries(categories, videos))
      .then(boot)
      .catch(() => fromJson());   // network / RLS issue → static fallback
  } else {
    fromJson();
  }
})();
