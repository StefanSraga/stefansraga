/* Štefan Šraga — site JS (nav, particles, typewriter, timecode, marquee, reveal, lightbox, EXIF ticker) */
(function () {
  'use strict';

  /* ---------- Wix-like proportional scaling ----------
     The original Wix site scales the whole design up on wide screens.
     Design width ~1440px; above that we zoom the page proportionally. */
  function applyZoom() {
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
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
    nav.addEventListener('click', e => { if (e.target.tagName === 'A') nav.classList.remove('open'); });
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

  /* ---------- Typewriter (hero headline): "I turn X into Y" pairs ---------- */
  const typeEl = document.querySelector('[data-typewriter]');
  if (typeEl) {
    // pairs separated by "|", first/second separated by ">"
    const pairs = (typeEl.getAttribute('data-pairs') || '')
      .split('|').map(p => p.split('>')).filter(p => p.length === 2);
    const firstSpan = typeEl.querySelector('.type-first');
    const secondSpan = typeEl.querySelector('.type-second');
    const rand = (a, b) => a + Math.random() * (b - a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function typeInto(el, target, min, max) {
      for (let i = 1; i <= target.length; i++) {
        el.textContent = target.slice(0, i);
        await sleep(rand(min, max));
      }
    }
    async function eraseBoth() {
      let a = firstSpan.textContent, b = secondSpan.textContent;
      while (a.length || b.length) {
        if (a.length) a = a.slice(0, -1);
        if (b.length) b = b.slice(0, -1);
        firstSpan.textContent = a;
        secondSpan.textContent = b;
        await sleep(rand(24, 40));
      }
    }
    async function loop() {
      let i = 0;
      for (;;) {
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
      loop();
    }
  }


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
  }
  function initLightbox(scope) {
    const grids = (scope || document).querySelectorAll('.photo-grid, .photo-grid-lb');
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
        const place = () => {
          if (!img.naturalWidth || !img.naturalHeight) return;
          const ar = img.naturalWidth / img.naturalHeight;
          if (ar < 0.85) a.classList.add('t');
          else if (ar > 1.9) a.classList.add('w');
          else if (ar > 1.15 && i % 7 === 3) a.classList.add('b');
        };
        if (img.complete && img.naturalWidth) place();
        else img.addEventListener('load', place, { once: true });
      });
    });
  }
  window.SRTiles = initTiles;
  initTiles(document);

  /* ---------- About timeline: green line fills with scroll ----------
     getBoundingClientRect() returns VISUAL (zoomed) px, but style.height is
     applied in LAYOUT px (which the body zoom multiplies again) — so measure
     in visual px and divide by the zoom before writing the height. */
  const timeline = document.querySelector('.timeline');
  if (timeline) {
    const prog = document.createElement('span');
    prog.className = 'tl-progress';
    timeline.appendChild(prog);
    const z = () => parseFloat(document.body.style.zoom) || 1;
    function updateProgress() {
      const r = timeline.getBoundingClientRect();          // visual px
      const viewMid = window.innerHeight * 0.6;            // visual px
      const filledVisual = Math.max(0, Math.min(r.height, viewMid - r.top));
      prog.style.height = (filledVisual / z()) + 'px';     // layout px
    }
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
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
