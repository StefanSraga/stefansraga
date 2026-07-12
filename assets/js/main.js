/* Štefan Šraga — site JS (nav, particles, typewriter, timecode, marquee, reveal, lightbox, EXIF ticker) */
(function () {
  'use strict';

  /* ---------- Wix-like proportional scaling ----------
     The original Wix site scales the whole design up on wide screens.
     Design width ~1440px; above that we zoom the page proportionally. */
  let lastZoomW = 0;
  function applyZoom() {
    // Mobile browsers fire resize when the URL bar collapses/expands during
    // scroll — only the HEIGHT changes. Re-writing --vph then makes the hero
    // jump mid-scroll, so on a same-width resize we keep the original value.
    if (window.innerWidth === lastZoomW) return;
    lastZoomW = window.innerWidth;
    const z = Math.min(Math.max(window.innerWidth / 1440, 1), 1.6);
    if ('zoom' in document.body.style) {
      document.body.style.zoom = z > 1.01 ? z : '';
      document.documentElement.style.setProperty('--z', z > 1.01 ? z : 1);
    }
    // exact layout height that renders to one full viewport under the current zoom
    // (svh + body zoom don't compose reliably, so compute it directly)
    const zz = (z > 1.01 && 'zoom' in document.body.style) ? z : 1;
    document.documentElement.style.setProperty('--vph', (window.innerHeight / zz) + 'px');
  }
  applyZoom();
  window.addEventListener('resize', applyZoom);

  /* ---------- Mobile nav ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    const setNav = open => {
      nav.classList.toggle('open', open);
      toggle.classList.toggle('open', open);          // hamburger ↔ X
      toggle.setAttribute('aria-expanded', open);
    };
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => setNav(!nav.classList.contains('open')));
    nav.addEventListener('click', e => { if (e.target.tagName === 'A') setNav(false); });
    // close on Escape and on a tap anywhere outside the header
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) setNav(false); });
    document.addEventListener('click', e => {
      if (nav.classList.contains('open') && !e.target.closest('.site-header')) setNav(false);
    });
  }

  /* ---------- Active nav link ---------- */
  const here = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '/') || '/';
  document.querySelectorAll('.site-nav a').forEach(a => {
    const href = new URL(a.getAttribute('href'), location.href).pathname
      .replace(/\/index\.html$/, '/').replace(/\/+$/, '/');
    if (href === here) a.classList.add('active');
  });

  /* ---------- Reveal on scroll ----------
     Robust: an IntersectionObserver for the animation, PLUS a scroll/timer
     safety net that reveals anything already inside (or above) the viewport,
     so no element can ever get stuck invisible and leave a blank gap. */
  const revealEls = [...document.querySelectorAll('.reveal')];
  if (revealEls.length) {
    const reveal = el => el.classList.add('visible');
    const sweep = () => {
      const vh = window.innerHeight;
      for (const el of revealEls) {
        if (el.classList.contains('visible')) continue;
        const top = el.getBoundingClientRect().top;
        if (top < vh * 0.92) reveal(el);
      }
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.04, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach(el => io.observe(el));
    }
    sweep();
    window.addEventListener('scroll', sweep, { passive: true });
    window.addEventListener('resize', sweep);
    window.addEventListener('load', sweep);
    // final failsafe: nothing may remain hidden after 3s
    setTimeout(() => revealEls.forEach(reveal), 3000);
  }

  /* ---------- Marquee: duplicate content so the loop is seamless ---------- */
  document.querySelectorAll('.marquee').forEach(mq => {
    const track = mq.querySelector('.marquee-track');
    if (!track) return;
    const item = track.innerHTML;
    // fill at least 2x viewport, then double for the -50% loop
    let html = item;
    while (track.scrollWidth < window.innerWidth * 1.2 && html.length < 200000) {
      html += item;
      track.innerHTML = html;
    }
    track.innerHTML = html + html;
  });

  /* ---------- Particles starfield (hero) ---------- */
  const pcanvas = document.querySelector('canvas.particles');
  if (pcanvas) {
    const ctx = pcanvas.getContext('2d');
    let W, H, stars;
    const COUNT = 110;
    function resize() {
      W = pcanvas.width = pcanvas.offsetWidth;
      H = pcanvas.height = pcanvas.offsetHeight;
    }
    function mkstar() {
      const green = Math.random() < 0.12;
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        a: Math.random() * 0.7 + 0.25,
        tw: Math.random() * 0.02 + 0.004,
        green
      };
    }
    let running = false, rafId = 0;
    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
        if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
        s.a += s.tw;
        if (s.a > 0.95 || s.a < 0.2) s.tw *= -1;
        ctx.globalAlpha = Math.max(0, Math.min(1, s.a));
        ctx.fillStyle = s.green ? '#18C118' : '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(tick);
    }
    function start() { if (!running) { running = true; rafId = requestAnimationFrame(tick); } }
    function stop() { running = false; cancelAnimationFrame(rafId); }
    resize();
    stars = Array.from({ length: COUNT }, mkstar);
    window.addEventListener('resize', resize);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // only animate while the hero is on screen — saves the CPU once you scroll past
      if ('IntersectionObserver' in window) {
        const hero = pcanvas.closest('.hero') || pcanvas;
        new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop()),
          { threshold: 0 }).observe(hero);
      } else { start(); }
      document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    }
  }

  /* ---------- Typewriter (hero headline): "I turn X into Y" pairs ----------
     Exposed as window.SRTypewriter() and restartable: a generation token lets a
     fresh call supersede any running loop, so site.js can re-run it live after a
     CMS edit changes the phrase pairs (data-pairs). */
  let typeGen = 0;
  function initTypewriter() {
    const typeEl = document.querySelector('[data-typewriter]');
    if (!typeEl) return;
    const myGen = ++typeGen;                         // any older loop now bails
    // pairs separated by "|", first/second separated by ">"
    const pairs = (typeEl.getAttribute('data-pairs') || '')
      .split('|').map(p => p.split('>')).filter(p => p.length === 2);
    const firstSpan = typeEl.querySelector('.type-first');
    const secondSpan = typeEl.querySelector('.type-second');
    if (!firstSpan || !secondSpan) return;
    const live = () => myGen === typeGen;            // false once superseded
    const rand = (a, b) => a + Math.random() * (b - a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function typeInto(el, target, min, max) {
      for (let i = 1; i <= target.length; i++) {
        if (!live()) return;
        el.textContent = target.slice(0, i);
        await sleep(rand(min, max));
      }
    }
    async function eraseBoth() {
      let a = firstSpan.textContent, b = secondSpan.textContent;
      while (a.length || b.length) {
        if (!live()) return;
        if (a.length) a = a.slice(0, -1);
        if (b.length) b = b.slice(0, -1);
        firstSpan.textContent = a;
        secondSpan.textContent = b;
        await sleep(rand(24, 40));
      }
    }
    async function loop() {
      let i = 0;
      while (live()) {
        const [x, y] = pairs[i % pairs.length];
        await typeInto(firstSpan, x, 42, 65);
        await sleep(900);
        await typeInto(secondSpan, y, 42, 65);
        await sleep(1000);
        await eraseBoth();
        await sleep(200);
        i++;
      }
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !pairs.length) {
      if (pairs.length) {
        firstSpan.textContent = pairs[0][0];
        secondSpan.textContent = pairs[0][1];
      }
    } else {
      firstSpan.textContent = '';
      secondSpan.textContent = '';
      loop();
    }
  }
  window.SRTypewriter = initTypewriter;
  initTypewriter();


  /* ---------- Camera HUD engines: timecodes + count-ups ----------
     Exposed as window.SRHud(scope) and idempotent (data-hud guard), so the
     live hydrators (blog.js / postpage.js) can re-run it on injected nodes. */
  function initHud(scope) {
    const root = scope || document;

    // random-walking timecode ("00:00:00")
    root.querySelectorAll('[data-timer]:not([data-hud])').forEach(el => {
      el.setAttribute('data-hud', '1');
      const MAX = 99 * 3600 + 59 * 60 + 59;
      let s = 0;
      const clampT = v => Math.max(0, Math.min(MAX, v));
      const rndI = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
      const fmt = t => { t = clampT(Math.floor(t)); return [t / 3600, (t % 3600) / 60, t % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); };
      function tick() {
        if (!el.isConnected) return;   // node was re-rendered away — stop this timer
        let d = rndI(-40, 60);
        if (Math.random() < 0.35) d += rndI(-60, 120);
        d = Math.max(-180, Math.min(180, d));
        s = clampT(s + d);
        el.textContent = fmt(s);
        setTimeout(tick, rndI(600, 1200));
      }
      el.textContent = fmt(s);
      setTimeout(tick, rndI(600, 1200));
    });

    // count up once on reveal (About vitals, blog view counts)
    // The element's text is already the real value, so if this never fires
    // (old browser, reduced motion) the visitor just sees the correct number.
    const counters = [...root.querySelectorAll('[data-count]:not([data-hud])')];
    if (counters.length && 'IntersectionObserver' in window &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const cio = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          cio.unobserve(en.target);
          const el = en.target;
          const target = parseInt(el.getAttribute('data-count'), 10) || 0;
          const t0 = performance.now(), dur = 900;
          (function step(now) {
            const p = Math.min(1, (now - t0) / dur);
            el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
          })(t0);
        });
      }, { threshold: 0.5 });
      counters.forEach(el => { el.setAttribute('data-hud', '1'); cio.observe(el); });
    }
  }
  window.SRHud = initHud;
  initHud(document);

  /* ---------- EXIF ticker (intro bottom bar) — cycling sets, green highlight sweep ---------- */
  const EXIF_SETS = [
    { iso: 100, f: 'f/1.4', t: '1/250', mm: '35 mm', body: 'Sony FE', prof: 'Monochrome', y: '© Š. Šraga 2025' },
    { iso: 400, f: 'f/2.0', t: '1/125', mm: '50 mm', body: 'Sony FE', prof: 'S-Cinetone', y: '© Š. Šraga 2025' },
    { iso: 800, f: 'f/1.8', t: '1/60', mm: '85 mm', body: 'Sony FE', prof: 'S-Log3', y: '© Š. Šraga 2025' },
    { iso: 160, f: 'f/4.0', t: '1/500', mm: '24 mm', body: 'Sony FE', prof: 'S-Log3', y: '© Š. Šraga 2025' },
    { iso: 200, f: 'f/2.8', t: '1/200', mm: '28 mm', body: 'Sony FE', prof: 'BW', y: '© Š. Šraga 2025' },
    { iso: 1600, f: 'f/2.0', t: '1/100', mm: '35 mm', body: 'Sony FE', prof: 'S-Cinetone', y: '© Š. Šraga 2025' },
    { iso: 320, f: 'f/5.6', t: '1/125', mm: '70 mm', body: 'Sony FE', prof: 'S-Cinetone', y: '© Š. Šraga 2025' },
    { iso: 125, f: 'f/3.5', t: '1/80', mm: '40 mm', body: 'Sony FE', prof: 'Natural', y: '© Š. Šraga 2025' },
  ];
  const exifTokens = set => [`ISO ${set.iso}`, set.f, set.t, set.mm, set.body, set.prof, set.y]
    .map(p => `<span class="token">${p}</span>`).join('<span class="dot">·</span>');
  document.querySelectorAll('.exif-ticker[data-exif]').forEach((el, n) => {
    const strip = el.querySelector('.strip');
    if (!strip) return;
    const INTERVAL = 6000;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let idx = n % EXIF_SETS.length;    // stagger the two bars so they show different values
    let paused = false, stepTimer, swapTimer;
    el.addEventListener('mouseenter', () => paused = true);
    el.addEventListener('mouseleave', () => paused = false);
    function cycle() {
      clearInterval(stepTimer); clearTimeout(swapTimer);
      strip.innerHTML = exifTokens(EXIF_SETS[idx]);
      const tokens = strip.querySelectorAll('.token');
      const steps = tokens.length;
      const stepMs = rm ? INTERVAL : Math.max(200, Math.floor(INTERVAL / (steps + 1)));
      let i = -1;
      if (!rm) {
        stepTimer = setInterval(() => {
          if (paused) return;
          i++;
          tokens.forEach(t => t.classList.remove('hl'));
          if (i < steps) tokens[i].classList.add('hl');
        }, stepMs);
      }
      swapTimer = setTimeout(() => { if (!paused) { idx = (idx + 1) % EXIF_SETS.length; cycle(); } }, stepMs * (steps + 0.8));
    }
    cycle();
  });

  /* ---------- Lightbox for photo grids ----------
     Exposed as window.SRLightbox(scope) and idempotent, so gallery.js can
     re-bind after live hydration replaces the grid. */
  let lb = null, lbImg = null, lbItems = [], lbIdx = 0;
  function lbOpen(list, i) {
    lbItems = list; lbIdx = i;
    lbImg.src = lbItems[lbIdx].href;
    const im = lbItems[lbIdx].querySelector('img');
    lbImg.alt = im ? im.alt : '';
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function lbClose() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }
  function lbShow(delta) {
    lbIdx = (lbIdx + delta + lbItems.length) % lbItems.length;
    lbImg.src = lbItems[lbIdx].href;
    // warm up the neighbours so the next swipe shows instantly (mobile 4G)
    [1, -1].forEach(d => {
      const n = lbItems[(lbIdx + d + lbItems.length) % lbItems.length];
      if (n) { const pre = new Image(); pre.src = n.href; }
    });
  }
  function initLightbox(scope) {
    const grids = (scope || document).querySelectorAll('.photo-grid, .photo-grid-lb, [data-lightbox]');
    if (!grids.length) return;
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'lightbox';
      lb.innerHTML = '<button class="lb-close" aria-label="Close">&times;</button>' +
        '<button class="lb-prev" aria-label="Previous">&#8249;</button>' +
        '<img alt="">' +
        '<button class="lb-next" aria-label="Next">&#8250;</button>';
      document.body.appendChild(lb);
      lbImg = lb.querySelector('img');
      lb.querySelector('.lb-close').addEventListener('click', lbClose);
      lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); lbShow(-1); });
      lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); lbShow(1); });
      lb.addEventListener('click', e => { if (e.target === lb || e.target === lbImg) lbClose(); });
      document.addEventListener('keydown', e => {
        if (!lb.classList.contains('open')) return;
        if (e.key === 'Escape') lbClose();
        if (e.key === 'ArrowLeft') lbShow(-1);
        if (e.key === 'ArrowRight') lbShow(1);
      });
      // touch: swipe left/right to browse, swipe down to close
      let tX = 0, tY = 0;
      lb.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        tX = e.touches[0].clientX; tY = e.touches[0].clientY;
      }, { passive: true });
      lb.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - tX;
        const dy = e.changedTouches[0].clientY - tY;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) lbShow(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) lbClose();
      }, { passive: true });
    }
    grids.forEach(grid => {
      if (grid.hasAttribute('data-lb')) return;
      grid.setAttribute('data-lb', '1');
      const links = [...grid.querySelectorAll('a')];
      links.forEach((a, i) => a.addEventListener('click', e => {
        e.preventDefault();
        lbOpen(links, i);
      }));
    });
  }
  window.SRLightbox = initLightbox;
  initLightbox(document);

  /* ---------- Gallery tiles: orientation-aware spans ----------
     Measures each photo once loaded and sizes its tile to match: portrait
     gets a tall tile (.t), panorama a wide one (.w), and an occasional
     landscape a 2×2 feature (.b). Needs no data — works the same for
     admin-uploaded photos. Exposed as window.SRTiles(scope) for hydrators. */
  function initTiles(scope) {
    (scope || document).querySelectorAll('.masonry').forEach(grid => {
      [...grid.querySelectorAll('a')].forEach((a, i) => {
        if (a.hasAttribute('data-tile')) return;
        a.setAttribute('data-tile', '1');
        const img = a.querySelector('img');
        if (!img) return;
        const place = (w, h) => {
          if (!w || !h) return;
          const ar = w / h;
          if (ar < 0.85) a.classList.add('t');
          else if (ar > 1.9) a.classList.add('w');
          else if (ar > 1.15 && i % 7 === 3) a.classList.add('b');
        };
        // width/height attrs (baked by the generator) let us place the tile
        // immediately — no waiting for the image to download (no reflow)
        const aw = parseInt(img.getAttribute('width'), 10), ah = parseInt(img.getAttribute('height'), 10);
        if (aw && ah) place(aw, ah);
        else if (img.complete && img.naturalWidth) place(img.naturalWidth, img.naturalHeight);
        else img.addEventListener('load', () => place(img.naturalWidth, img.naturalHeight), { once: true });
      });
    });
  }
  window.SRTiles = initTiles;
  initTiles(document);

  /* ---------- About story line (.tlx) ----------
     One scroll handler drives BOTH the green fill and the stop ignition, so
     the moment the glowing tip reaches a dot its content slides out — always
     in sync. Zoom gotcha: getBoundingClientRect() returns VISUAL (zoomed) px,
     but style.height applies in LAYOUT px — divide by the body zoom. */
  const tlx = document.querySelector('.tlx');
  if (tlx) {
    const fill = tlx.querySelector('.tlx-fill');
    const stops = [...tlx.querySelectorAll('.tlx-item')];
    const navDots = [...tlx.querySelectorAll('.tlx-nav-dot')];
    const z = () => parseFloat(document.body.style.zoom) || 1;
    const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // thin scroll-progress bar pinned to the top of the story page
    const prog = document.createElement('i');
    prog.className = 'scroll-prog';
    document.body.appendChild(prog);
    function updateProg() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.max(0, Math.min(1, window.pageYOffset / max)) : 0;
      prog.style.width = (p * 100) + '%';
    }

    // stop ignition: year digits roll up + the caption types itself in
    function ignite(it) {
      it.classList.add('on');
      if (noMotion) return;
      it.querySelectorAll('.tlx-num[data-y]').forEach(n => {
        const target = parseInt(n.getAttribute('data-y'), 10);
        if (!target) return;
        const from = target - 9;
        let step = 0;
        const steps = 22;                                  // ~0.75 s roll
        n.classList.add('counting');
        (function tick() {
          step++;
          const e = 1 - Math.pow(1 - step / steps, 3);     // ease-out
          n.textContent = Math.round(from + (target - from) * e);
          if (step < steps) setTimeout(tick, 34);
          else n.classList.remove('counting');
        })();
      });
    }

    function updateLine() {
      const r = tlx.getBoundingClientRect();               // visual px
      const vh = window.innerHeight;
      const tip = vh * 0.58;                               // where the tip "is" on screen
      const R = vh * 0.42;                                 // dot reaction radius
      const filledVisual = Math.max(0, Math.min(r.height, tip - r.top));
      if (fill) fill.style.height = (filledVisual / z()) + 'px';   // layout px
      let best = null, bestT = 0;
      for (const it of stops) {
        const d = it.getBoundingClientRect();
        const mid = d.top + d.height / 2;
        if (!it.classList.contains('on') && mid <= tip) ignite(it);
        // proximity 0..1: the dot swells + glows as the tip nears, shrinks as it leaves
        const t = Math.max(0, 1 - Math.abs(mid - tip) / R);
        it.style.setProperty('--t', t.toFixed(3));
        if (t > bestT) { bestT = t; best = it; }
        if (it.classList.contains('near') && it !== best) it.classList.remove('near');
      }
      // radar ping only on the stop the tip is currently visiting
      for (const it of stops) it.classList.toggle('near', it === best && bestT > 0.55);
      // side-nav marker tracks the stop the tip is closest to
      if (navDots.length && best) {
        const bi = stops.indexOf(best);
        navDots.forEach((d, i) => d.classList.toggle('active', i === bi));
      }
    }
    // smooth-scroll for the side jump-nav (falls back to native anchor jump)
    navDots.forEach(d => d.addEventListener('click', e => {
      const id = d.getAttribute('href');
      const target = id && document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: noMotion ? 'auto' : 'smooth', block: 'center' });
    }));
    function frame() { updateLine(); updateProg(); }
    frame();
    // coalesce scroll work into one rAF per frame — 18 getBoundingClientRect
    // calls per raw scroll event caused jank on mobile. resize + the initial
    // call stay direct (rAF may not tick in the preview pane's compositor).
    let tlxTick = false;
    window.addEventListener('scroll', () => {
      if (tlxTick) return;
      tlxTick = true;
      requestAnimationFrame(() => { frame(); tlxTick = false; });
    }, { passive: true });
    window.addEventListener('resize', frame);
  }

  /* ---------- Collab carousel (VlaďkySyn) ---------- */
  document.querySelectorAll('.collab').forEach(collab => {
    const track = collab.querySelector('.collab-track');
    const next = collab.querySelector('.collab-next');
    if (!track || !next) return;
    const items = track.children.length;
    const visible = 2;
    let page = 0;
    next.addEventListener('click', () => {
      page = (page + 1) % Math.ceil(items / visible);
      const item = track.children[0];
      // gBCR is in visual (zoomed) px; the transform is applied in layout px
      const zz = parseFloat(document.body.style.zoom) || 1;
      const step = item.getBoundingClientRect().width / zz + 14;
      track.style.transform = `translateX(${-page * step * visible}px)`;
    });
  });

  /* ---------- Lazy video autoplay (play when visible) ----------
     Also a bandwidth guard: force preload="none" so a heavy clip is only
     downloaded once the viewer actually scrolls near it (not on page load).
     A visitor who lands and bounces never fetches the below-the-fold videos. */
  /* ---------- Adaptive homepage video renditions ----------
     Each homepage clip ships two faststart encodes: data-src-hi (default) and
     data-src-lo (smaller, for slow / data-saver links). Pick one from the
     Network Information API and set it as the src BEFORE the first play — the
     play-on-scroll observer below then starts an already-light, quick clip.
     preload stays "none" so nothing downloads until it scrolls into view.
     Admin overrides still win: home.js hydrates src from Supabase on an async
     round-trip that resolves after this synchronous pass. */
  (function pickVideoRendition() {
    const vids = document.querySelectorAll('video[data-home-video][data-src-hi]');
    if (!vids.length) return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let lo = false;
    if (conn) {
      const et = conn.effectiveType || '';
      lo = !!conn.saveData || et === 'slow-2g' || et === '2g' || et === '3g' ||
           (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 2.5);
    }
    // phones get the small encode regardless: a 375px column gains nothing
    // from the 1280px file, and iOS Safari has no connection API at all
    // (conn === undefined there, so this is the only signal that fires)
    if (!lo && window.matchMedia('(max-width: 820px)').matches) lo = true;
    vids.forEach(v => {
      const url = v.getAttribute(lo ? 'data-src-lo' : 'data-src-hi') || v.getAttribute('data-src-hi');
      if (!url) return;
      v.preload = 'none';
      if (v.getAttribute('src') !== url) v.src = url;
      v.dataset.rendition = lo ? 'lo' : 'hi';
    });
  })();

  const lazyVids = document.querySelectorAll('video[data-autoplay]');
  if (lazyVids.length && 'IntersectionObserver' in window) {
    lazyVids.forEach(v => { v.preload = 'none'; });
    const vio = new IntersectionObserver(entries => {
      entries.forEach(en => {
        const v = en.target;
        if (en.isIntersecting) { v.play().catch(() => {}); }   // play() triggers the (deferred) download
        else { v.pause(); }
      });
    }, { threshold: 0.25, rootMargin: '200px 0px 200px 0px' });  // start a touch early so it's ready on arrival
    lazyVids.forEach(v => vio.observe(v));
  }
})();
