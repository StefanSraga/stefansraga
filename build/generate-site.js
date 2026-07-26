// Generate all remaining pages of the static stefansraga.com rebuild.
const fs = require('fs');
const path = require('path');

const SC = __dirname;
const C = path.join(SC, 'content');
// Site root = the repo root (this script lives in <repo>/build/). Never hardcode
// a machine path: the generator now also runs on Vercel during deploy.
const ROOT = path.resolve(SC, '..');
const LOGO = '942fb7_f440d18845994b398622711be15ec0db.png';
const PIN = '942fb7_b609eb71b4c742d8a5d37b739c62d6c0.png'; // green pixel arrow

const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const img = (id, p) => p + 'assets/img/' + id.replace('~mv2', '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- SEO ---------- */
const SITE = 'https://www.stefansraga.com';           // canonical production domain (480× in the Wix scrape)
const absU = p => SITE + p;
// "11. 3. 2026" (czech) → "2026-03-11" (ISO, for sitemap lastmod + JSON-LD datePublished)
const isoDate = cz => {
  const m = String(cz).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
// meta description: cut at a word boundary, never mid-word
const metaDesc = (text, max = 158) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
};
// generic WebPage JSON-LD for pages without a richer block
const webPageLd = (name, desc, urlPath) => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'WebPage',
  name, description: desc, url: absU(urlPath),
  about: { '@id': SITE + '/#person' }, inLanguage: 'en',
});
// sitemap entries collected as pages are written; sitemap.xml emitted at the end
const SITEMAP = [];
const smAdd = (urlPath, { priority = 0.6, changefreq = 'monthly', lastmod = null, images = null } = {}) =>
  SITEMAP.push({ urlPath, priority, changefreq, lastmod, images });
// filled from the SEO copywriter agents — key: URL path / post slug
let SEO_PAGES = {};   // { '/photos/': {title, description}, … }
let SEO_POSTS = {};   // { '<slug>': {title, description, lang}, … }
let JSONLD = {};      // { home, about, postTemplate, blogsIndex, photosHub, galleryTemplate, videos }
try {
  const seoData = rd(path.join(SC, 'seo-data.json'));
  SEO_PAGES = seoData.pages || {};
  SEO_POSTS = seoData.posts || {};
  JSONLD = seoData.jsonld || {};
} catch (e) { console.warn('seo-data.json missing — building with fallback meta only'); }

/* ---------- owner's SEO edits (from /admin → Supabase) ----------
   fetch-seo.js writes seo-overrides.json before this script runs. Keys look
   like  seo_<id>_title | seo_<id>_desc | seo_<id>_og  (pages) and
   seo_post_<slug>_title | seo_post_<slug>_desc  (articles).
   Anything the owner left blank simply keeps the built-in default, so the
   site can never end up with empty meta. */
const SEO_OG = {};    // { '/photos/': '/assets/img/…' }
let OVERRIDES = {};
try { OVERRIDES = rd(path.join(SC, 'seo-overrides.json')); } catch (e) { /* first run / offline */ }
// page id → URL path ('home' is the root)
const seoIdToPath = id => (id === 'home' ? '/' : `/${id}/`);
{
  let applied = 0;
  for (const [key, val] of Object.entries(OVERRIDES)) {
    if (!val) continue;
    let m;
    if ((m = key.match(/^seo_post_(.+)_(title|desc)$/))) {
      const slug = m[1];
      SEO_POSTS[slug] = SEO_POSTS[slug] || {};
      SEO_POSTS[slug][m[2] === 'title' ? 'title' : 'description'] = val;
      applied++;
    } else if ((m = key.match(/^seo_(.+)_(title|desc|og)$/))) {
      const p = seoIdToPath(m[1]);
      if (m[2] === 'og') { SEO_OG[p] = val; applied++; continue; }
      SEO_PAGES[p] = SEO_PAGES[p] || {};
      SEO_PAGES[p][m[2] === 'title' ? 'title' : 'description'] = val;
      applied++;
    }
  }
  if (applied) console.log(`[seo] applied ${applied} owner override(s) from the admin`);
}

function write(rel, html) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html, 'utf8');
  console.log('wrote', rel);
}

/* Clean Wix rich-text html: keep structure, map green + bold, strip wix classes */
function richClean(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  // green spans
  s = s.replace(/<span style="color:\s*#18C118;?"[^>]*>/gi, '<span class="green">');
  // bold spans: drop styling (green class already renders semi-bold) to keep tags balanced
  s = s.replace(/<span style="font-weight:\s*bold;?"[^>]*>/gi, '<span>');
  // close-tag bookkeeping: crude but effective for wix output — replace remaining spans with markers
  s = s.replace(/<span(?![^>]*class="green")[^>]*>/gi, '<span>');
  // strip classes/attrs from common tags
  s = s.replace(/<(p|h1|h2|h3|h4|h5|h6|ul|ol|li|a|blockquote)([^>]*)>/gi, (m, tag, attrs) => {
    if (tag.toLowerCase() === 'a') {
      const href = (attrs.match(/href="([^"]*)"/i) || [])[1] || '#';
      return `<a href="${href}">`;
    }
    return `<${tag.toLowerCase()}>`;
  });
  // spans that were bold got turned into <strong> but their closers are </span>; balance:
  // count: convert every "</span>" following a <strong> naive approach — instead just map ALL bold spans
  return s;
}

/* strip to plain text */
const plain = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- image helpers (mobile perf) ---------- */
// 640px-wide thumbnail if one was pre-generated (assets/img/thumb/<id>) —
// masonry tiles render at 168-300px, shipping the full 1-2560px JPG is waste.
// PNG photos (blog covers, Platinum) have JPG thumbs named <base>.jpg.
const thumbFor = id => {
  const clean = id.replace('~mv2', '');
  if (fs.existsSync(path.join(ROOT, 'assets/img/thumb', clean))) return 'assets/img/thumb/' + clean;
  const asJpg = clean.replace(/\.(png|webp)$/i, '.jpg');
  if (asJpg !== clean && fs.existsSync(path.join(ROOT, 'assets/img/thumb', asJpg))) return 'assets/img/thumb/' + asJpg;
  return null;
};
/* Image dimensions — pure JS, no ffprobe.
   The generator now also runs on Vercel during deploy, where ffprobe does not
   exist. Reading the headers ourselves keeps width/height attrs (and therefore
   zero layout shift) working in every environment. */
function pngDims(b) {
  // PNG signature + IHDR is always the first chunk
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function webpDims(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fmt = b.toString('ascii', 12, 16);
  if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const n = b.readUInt32LE(21);
    return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  return null;
}
function imgDims(file) {
  try {
    const b = fs.readFileSync(file);
    return jpegDimsBuf(b) || pngDims(b) || webpDims(b);
  } catch (e) { return null; }
}

// read JPEG dimensions from the SOF marker (for width/height attrs → no CLS)
function jpegDimsBuf(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i < b.length - 8) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/* ---------- shared shell ---------- */
function shell({ title, desc, prefix, body, extraCss = '', bodyClass = '', cms = false,
                 path: urlPath = null, ogImage = null, ogType = 'website', jsonld = null, lang = 'en',
                 noindex = false, articlePublished = null }) {
  // owner's share image (set in /admin) wins over the page's built-in one
  const chosenOg = (urlPath && SEO_OG[urlPath]) || ogImage;
  const ogImg = chosenOg ? (chosenOg.startsWith('http') ? chosenOg : absU(chosenOg)) : absU('/assets/img/og-cover.jpg');
  const isDefaultOg = !chosenOg;
  const ldBlocks = [].concat(jsonld || []).filter(Boolean)
    .map(j => `<script type="application/ld+json">${j}</script>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="author" content="Štefan Šraga">
  <meta name="theme-color" content="#030303">${noindex ? `
  <meta name="robots" content="noindex">` : ''}${urlPath ? `
  <link rel="canonical" href="${absU(urlPath)}">` : ''}
  <meta property="og:type" content="${ogType}">${ogType === 'article' && articlePublished ? `
  <meta property="article:published_time" content="${articlePublished}">
  <meta property="article:author" content="Štefan Šraga">` : ''}
  <meta property="og:site_name" content="Štefan Šraga">
  <meta property="og:locale" content="${lang === 'cs' ? 'cs_CZ' : 'en_US'}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">${urlPath ? `
  <meta property="og:url" content="${absU(urlPath)}">` : ''}
  <meta property="og:image" content="${ogImg}">${isDefaultOg ? `
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${ogImg}">
  <link rel="icon" type="image/png" href="${prefix}assets/img/${LOGO}">
  <link rel="preconnect" href="https://pvfzbgvhtlrapdujiert.supabase.co" crossorigin>
  <link rel="stylesheet" href="${prefix}assets/css/fonts.css?v=46">
  <link rel="stylesheet" href="${prefix}assets/css/style.css?v=46">${extraCss ? `\n  <style>${extraCss}</style>` : ''}${ldBlocks ? `\n  ${ldBlocks}` : ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>

<header class="site-header">
  <a class="logo" href="${prefix}"><img src="${prefix}assets/img/${LOGO}" alt="Štefan Šraga logo" width="1063" height="1086"></a>
  <button class="nav-toggle" aria-label="Menu"><span></span><span></span><span></span></button>
  <nav class="site-nav">
    <a href="${prefix}">Home</a>
    <a href="${prefix}photos/">Photos</a>
    <a href="${prefix}videos/">Videos</a>
    <a href="${prefix}marketing/">Marketing</a>
    <a href="${prefix}about-me/">About Me</a>
    <a href="${prefix}blogs/">Blog</a>
  </nav>
  <div class="header-right">
    <span class="since" data-cms-text="home_since">SINCE 2015</span>
    <span class="socials">
      <a class="linkedin-link" href="https://www.linkedin.com/in/stefansraga/" target="_blank" rel="noopener" aria-label="LinkedIn">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z"/></svg>
      </a>
      <a class="linkedin-link" href="https://www.instagram.com/sraga.s/" target="_blank" rel="noopener" aria-label="Instagram">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.13 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.66.66 1.34 1.07 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.31 1.46-.72 2.13-1.38.66-.66 1.07-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.31-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.94 19.86.63 19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4zm6.4-11.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44z"/></svg>
      </a>
      <a class="sragi-link" href="https://www.sragicards.cz/" target="_blank" rel="noopener" aria-label="Šragi-Cards"><img src="${prefix}assets/img/sragi_logo_green.png" alt="Šragi-Cards" width="1236" height="333"></a>
    </span>
  </div>
</header>

<main class="page">
${body}
</main>

<footer class="site-footer">
  <div class="footer-grid">
    <span class="footer-label">Info</span>
    <div class="footer-info">
      <a href="https://www.google.com/maps/search/?api=1&amp;query=Petra+Jilemnick%C3%A9ho+2451%2F2%2C+434+01+Most" target="_blank" rel="noopener" data-cms-html="footer_address">
        Petra Jilemnického 2451/2,<br>434 01, Most, IČO: 19151578
      </a>
    </div>
    <span class="footer-label">Contact</span>
    <div class="footer-info">
      <a href="mailto:info@stefansraga.cz" data-cms-mail="footer_email">info@stefansraga.cz</a><br>
      <a href="tel:+420737419707" data-cms-tel="footer_phone">+420 737 419 707</a>
    </div>
  </div>
  <div class="footer-legal">
    <span>
      <a href="${prefix}accessibility-statement/">ACCESSIBILITY STATEMENT</a> &nbsp;&middot;&nbsp;
      <a href="${prefix}privacy-policy/">PRIVACY POLICY</a> &nbsp;&middot;&nbsp;
      <a href="${prefix}cookies/">COOKIE POLICY</a> &nbsp;&middot;&nbsp;
      <a href="#" class="cookie-settings">COOKIE SETTINGS</a>
    </span>
    <span class="footer-copy">© Štefan Šraga</span>
  </div>
</footer>

<script src="${prefix}assets/js/main.js?v=46"></script>
<script src="${prefix}assets/js/consent.js?v=46" defer></script>${cms ? cmsBase(prefix) : ''}
</body>
</html>
`;
}

function titleBar(name, cmsKey) {
  const label = cmsKey ? `<span data-cms-text="${cmsKey}">${esc(name)}</span>` : esc(name);
  return `
  <div class="section-title-bar">
    <span class="crop" aria-hidden="true"></span>
    <h1 class="section-title">${label} <span class="glitch">▮▪</span></h1>
    <span class="rgb-tag mono">(0,1,255)</span>
  </div>`;
}

// CMS scripts (live hydration from Supabase; no-op until backend is configured)
function cmsScripts(P, hydrator) {
  return `
  <script src="${P}assets/js/vendor/supabase.js"></script>
  <script src="${P}assets/js/config.js?v=46"></script>
  <script src="${P}assets/js/cms.js?v=46"></script>
  <script src="${P}assets/js/render.js?v=46"></script>
  <script src="${P}assets/js/${hydrator}?v=46"></script>
  <script src="${P}assets/js/site.js?v=46"></script>`;
}
// Base CMS stack for pages WITHOUT a data hydrator (marketing/about/legal) —
// still lets site.js hydrate editable texts + the footer.
function cmsBase(P) {
  return `
  <script src="${P}assets/js/vendor/supabase.js"></script>
  <script src="${P}assets/js/config.js?v=46"></script>
  <script src="${P}assets/js/cms.js?v=46"></script>
  <script src="${P}assets/js/site.js?v=46"></script>`;
}

function redirect(rel, target) {
  write(rel, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${target}">
  <title>Redirecting…</title>
  <link rel="canonical" href="${target}">
</head>
<body style="background:#030303;color:#fff;font-family:monospace;padding:40px">
  <p>Redirecting… <a style="color:#18C118" href="${target}">continue</a></p>
</body>
</html>
`);
}

const JUNK = [
  'SINCE 2015', '(0,1,255)', 'SNOW BLK', 'BUILT ON WIX', 'ACCESSIBILITY STATEMENT',
  'PRIVACY POLICY', 'Made with love', 'Mobile version', '© Štefan', 'INFO@MYSITE',
  '123-456-7890', 'TERRY FRANCINE',
];
const isJunk = t => JUNK.some(j => t.includes(j));

/* ============================================================
   GALLERY PAGES
   ============================================================ */
const GALLERIES = [
  { slug: 'events', name: 'Events', gj: 'gallery-events.json', pj: 'events.json' },
  { slug: 'cars', name: 'Cars', gj: 'gallery-cars.json', pj: 'cars.json' },
  { slug: 'urbex', name: 'Urbex', gj: 'gallery-urbex.json', pj: 'urbex.json' },
  { slug: 'football', name: 'Football', gj: 'gallery-football.json', pj: 'football.json' },
  { slug: 'icehockey', name: 'Ice Hockey', gj: 'gallery-icehockey.json', pj: 'icehockey.json' },
  { slug: 'comicconprague', name: 'Comic-Con Prague', gj: 'gallery-comiccon.json', pj: 'comicconprague.json' },
  { slug: 'rallypraguerevival', name: 'Rally Prague Revival', gj: 'gallery-rally.json', pj: 'rallypraguerevival.json' },
];

for (const g of GALLERIES) {
  const gal = rd(path.join(C, g.gj));
  const page = rd(path.join(C, g.pj));
  const P = '../';

  // collect images in DOM order, skip logo/pin/posters
  const ids = [];
  for (const sec of gal.sections) {
    for (const im of sec.images || []) {
      const id = typeof im === 'string' ? im : im.id;
      if (!id) continue;
      if (id.includes('f440d188') || id.includes('b609eb71')) continue;
      if (/f00[03]\.jpg$/.test(id)) continue;
      if (!ids.find(x => x.id === id)) ids.push({ id, alt: (im.alt || '').replace(/\.(jpg|jpeg|png|webp)$/i, '') });
    }
  }
  const hero = ids[0];
  const grid = ids.slice(1);

  // intro: find SSR rich text (font_2 heading with real length)
  let intro = '';
  for (const s of page.sections) {
    if (s.html && s.text && s.text.length > 120 && !isJunk(s.text) && /font_2|font_7|font_8/.test(s.html)) {
      intro = richClean(s.html).replace(/<h2>/g, '<div>').replace(/<\/h2>/g, '</div>');
      break;
    }
  }

  const seo = SEO_PAGES[`/${g.slug}/`] || {};
  const gTitle = seo.title || `${g.name} | Štefan Šraga – Photo & Video Production`;
  const gDesc = seo.description || metaDesc(plain(intro)) || `${g.name} photography by Štefan Šraga`;
  const gImg = `/assets/img/${hero.id.replace('~mv2', '')}`;

  // descriptive alt: keep a real caption, replace empty / camera-file names
  // (DSC01723, IMG_0042…) — a photographer's portfolio should exist for
  // Google Images, and alt="" makes it invisible there
  const goodAlt = a => (a && !/^(dsc|img|_?\d|p10|screen|photo\d)/i.test(a.trim())) ? a.trim() : '';
  const altFor = (x, i) => goodAlt(x.alt) || `${g.name} — photography by Štefan Šraga (photo ${i + 1})`;
  const heroAlt = goodAlt(hero.alt) || `${g.name} — photography by Štefan Šraga`;

  const heroDims = imgDims(path.join(ROOT, 'assets/img', hero.id.replace('~mv2', '')));
  const body = `
  <h1 class="sr-only">${esc(gTitle.replace(/\s*\|.*$/, ''))}</h1>
  <div class="gallery-hero">
    <img src="${img(hero.id, P)}" alt="${esc(heroAlt)}" fetchpriority="high"${heroDims ? ` width="${heroDims.w}" height="${heroDims.h}"` : ''}>
  </div>
  ${intro ? `<div class="gallery-intro reveal">${intro}</div>` : titleBar(g.name)}
  <div class="masonry photo-grid-lb reveal">
    ${grid.map((x, i) => {
      // tile ships the 640px thumb (lightbox href keeps the full image);
      // width/height attrs from the actual file → zero layout shift
      const t = thumbFor(x.id);
      const srcRel = t || ('assets/img/' + x.id.replace('~mv2', ''));
      const dims = imgDims(path.join(ROOT, srcRel));
      const wh = dims ? ` width="${dims.w}" height="${dims.h}"` : '';
      return `<a href="${img(x.id, P)}"><img src="${P}${srcRel}" alt="${esc(altFor(x, i))}"${wh} loading="lazy"></a>`;
    }).join('\n    ')}
  </div>
  ${cmsScripts(P, 'gallery.js')}`;

  const gLd = (JSONLD.galleryTemplate || '')
    .replace(/__NAME__/g, g.name).replace(/__DESC__/g, gDesc.replace(/"/g, ''))
    .replace(/__URL__/g, absU(`/${g.slug}/`)).replace(/__IMAGE__/g, absU(gImg));
  // image-sitemap payload: hero + every grid photo (Google Images discovery)
  smAdd(`/${g.slug}/`, {
    priority: 0.6, changefreq: 'monthly',
    images: [hero, ...grid].map(x => absU(`/assets/img/${x.id.replace('~mv2', '')}`)),
  });
  write(`${g.slug}/index.html`,
    shell({
      title: gTitle,
      desc: gDesc,
      prefix: P,
      body,
      extraCss: `.photo-grid-lb a{cursor:zoom-in}`,
      path: `/${g.slug}/`,
      ogImage: gImg,
      jsonld: gLd || null,
    }));
}

/* ============================================================
   POSTS
   ============================================================ */
const POSTS = [
  { json: 'post-macbookm5max.json', slug: 'macbookm5max', date: '11. 3. 2026', views: '3 views' },
  { json: 'post-iem-2025.json', slug: 'intel-extreme-masters-2025-counter-strike-katowice', date: '15. 1. 2026', views: '4 views' },
  { json: 'post-worlds-2024.json', slug: 'worlds-2024-league-of-legends-londýn-the-o2-aréna-1', date: '7. 11. 2025', views: '20 views' },
  { json: 'post-gamescom.json', slug: 'gamescom-největší-herní-veletrh-v-evropě-kolín-nad-rýnem', date: '6. 11. 2025', views: '6 views', layout: 'wide' },
  { json: 'post-e3-expo.json', slug: 'e3-expo-2018-los-angeles-usa', date: '5. 11. 2025', views: '6 views' },
  { json: 'post-iem-2022.json', slug: 'intel-extreme-masters-2022-katowice', date: '4. 11. 2025', views: '6 views' },
  { json: 'post-esl-one-2019.json', slug: 'esl-one-2019-kolín-nad-rýnem', date: '1. 11. 2025', views: '12 views', layout: 'wide' },
  { json: 'post-apple-studio-display.json', slug: 'apple-studio-display-recenze-produktu', date: '31. 10. 2025', views: '6 views' },
  { json: 'post-sparta-pardubice.json', slug: 'hc-sparta-praha-vs-hc-dynamo-pardubice-02-arena-praha', date: '15. 10. 2025', views: '6 views' },
  { json: 'post-why-apple.json', slug: 'proč-zrovna-apple-produkty-které-mou-práci-ovlivňují-každý-den', date: '6. 10. 2025', views: '11 views' },
];

const postsData = POSTS.map(p => {
  const j = rd(path.join(C, 'posts', p.json));
  const coverId = (j.cover.match(/media\/([A-Za-z0-9_~]+\.\w+)/) || [])[1] || '';
  // the Wix scrape stores read time in Czech ("Minut čtení: 4") — the public
  // site is English, so normalise it to "4 min read"
  const readTime = String(j.readTime || '').replace(/Minut\s*čten[íi]\s*:\s*(\d+)/i, '$1 min read').trim();
  return { ...p, title: j.title.replace(/\s+/g, ' ').trim(), readTime, body: j.bodyHtml, coverId };
});

for (const p of postsData) {
  const P = '../../';
  // rewrite body image urls to local
  let body = p.body.replace(/https:\/\/static\.wixstatic\.com\/media\/([A-Za-z0-9_~]+\.(?:png|jpg|jpeg|gif|webp))[^"']*/gi,
    (m, id) => img(id, P));
  // restore spaces lost at inline-tag boundaries during serialization
  body = body
    .replace(/([\wěščřžýáíéúůóťďň:;,.!?)])(<(?:strong|em|a )[^>]*>)/gi, '$1 $2')
    .replace(/(<\/(?:strong|em|a)>)([\wěščřžýáíéúůóťďň(])/gi, '$1 $2');
  // width/height on inline article images (1920×2560 portraits expanding to
  // ~450px mid-read caused a huge layout shift on phones)
  body = body.replace(/<img([^>]*?)src="([^"]*assets\/img\/([^"]+))"([^>]*?)>/gi, (m, pre, src, file, post) => {
    if (/width=/.test(m)) return m;
    const dims = imgDims(path.join(ROOT, 'assets/img', decodeURIComponent(file)));
    return dims ? `<img${pre}src="${src}"${post} width="${dims.w}" height="${dims.h}">` : m;
  });
  const others = postsData.filter(x => x.slug !== p.slug).slice(0, 3);

  // THE CONTACT SHEET article — mirrors render.js postArticle(p, related)
  const views = parseInt(p.views, 10) || 0;
  const rt = (p.readTime || '').trim();
  const kicker = `<div class="post-kicker"><span class="k-name">&#9626; &Scaron;TEFAN &Scaron;RAGA</span><span class="tc" data-timer>00:00:00</span><span>${esc(p.date)}${rt ? ' &middot; ' + esc(rt) : ''}</span></div>`;
  const html = `
  <article>
    <header class="post-hero">
      <div class="post-hero-media"><img src="${img(p.coverId, P)}" alt="${esc(p.title)}"></div>
      <span class="crop-tr"></span><span class="crop-bl"></span>
      <div class="post-hero-inner">${kicker}<h1>${esc(p.title)} <span class="glitch">&#9646;&#9642;</span></h1></div>
    </header>
    <div class="post-exif"><span>SHOT <b>${esc(p.date)}</b></span>${rt ? `<span>&middot; ${esc(rt)}</span>` : ''}<span>&middot; <span class="views-dot">&#9679;</span> <b data-count="${views}">${views}</b> VIEWS</span><span>&middot; /${esc(p.slug)}</span></div>
    <div class="prose">
      ${body}
      <a class="back-to-blog" href="${P}blogs/">&#9664; Back to blog</a>
    </div>
    <div class="frame-out">&#8976; FRAME OUT &#172;</div>
    <div class="post-foot"><span><span class="views-dot">&#9679;</span> <b data-count="${views}">${views}</b> views</span><span>© Štefan Šraga</span></div>
  </article>
  <aside class="recent-posts">
    <div class="rp-head"><strong>Latest posts</strong> <a href="${P}blogs/">View all</a></div>
    <div class="rp-grid">
      ${others.map(o => `<a class="rp-card" href="${P}post/${encodeURI(o.slug)}/">
        <img src="${img(o.coverId, P)}" alt="${esc(o.title)}" loading="lazy">
        <span class="rp-title">${esc(o.title)}</span>
      </a>`).join('\n      ')}
    </div>
  </aside>`;

  const seo = SEO_POSTS[p.slug] || {};
  const pTitle = seo.title || p.title;
  const pDesc = seo.description || metaDesc(plain(p.body));
  const pLang = seo.lang || (/[ěščřžýáíéúůťď]/i.test(p.title + plain(p.body).slice(0, 400)) ? 'cs' : 'en');
  const pPath = `/post/${encodeURI(p.slug)}/`;
  const pImg = `/assets/img/${p.coverId.replace('~mv2', '')}`;
  const pIso = isoDate(p.date);
  const pLd = (JSONLD.postTemplate || '')
    .replace(/__TITLE__/g, p.title.replace(/"/g, ''))
    .replace(/__DESC__/g, pDesc.replace(/"/g, ''))
    .replace(/__URL__/g, absU(pPath))
    .replace(/__IMAGE__/g, absU(pImg))
    .replace(/__DATE_ISO__/g, pIso || '')
    .replace(/__LANG__/g, pLang);
  smAdd(pPath, { priority: 0.7, changefreq: 'yearly', lastmod: pIso });
  write(`post/${p.slug}/index.html`,
    shell({
      title: pTitle,
      desc: pDesc,
      prefix: P,
      body: html + '\n' + cmsScripts(P, 'postpage.js'),
      path: pPath,
      ogImage: pImg,
      ogType: 'article',
      articlePublished: pIso,
      jsonld: pLd || null,
      lang: pLang,
    }));
}

// dynamic post template — serves brand-new posts (added in the admin) that have
// no static file yet; Vercel rewrites /post/<slug> here and postpage.js renders it.
{
  const P = '../../';
  write('post/view/index.html', shell({
    title: 'Article — Štefan Šraga',
    desc: 'Stories from behind the camera — esports events, tech reviews and photography notes by Štefan Šraga.',
    prefix: P,
    body: `<article><div class="prose"><p style="opacity:.6">Loading…</p></div></article>\n${cmsScripts(P, 'postpage.js')}`,
  }));
}

/* ============================================================
   BLOG INDEX (+ redirects)
   ============================================================ */
{
  const P = '../';
  const HEART_SVG = '<svg class="heart" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.5 5.5 4.7 4.6 6.9 4 9 5 12 8c3-3 5.1-4 7.3-3.4 3.2.9 4.1 4.4 2.7 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  // THE CONTACT SHEET — mirrors render.js postCard(p, i): first post = featured poster frame
  const cards = postsData.map((p, i) => {
    const featured = i === 0;
    const wide = !featured && p.layout === 'wide';
    const excerpt = plain(p.body).slice(0, 190);
    const views = parseInt(p.views, 10) || 0;
    const rt = (p.readTime || '').trim();
    const meta = featured
      ? `<div class="meta"><span class="tc" data-timer>00:00:00</span><span class="rec">&#9679; REC</span><span>${esc(p.date)}</span>${rt ? `<span>&middot; ${esc(rt)}</span>` : ''}</div>`
      : `<div class="meta"><span>${esc(p.date)}</span>${rt ? `<span>&middot;</span><span>${esc(rt)}</span>` : ''}</div>`;
    // list covers render ≤640px — ship the JPG thumb (heavy photo-PNGs shrink ~10×);
    // the featured poster spans the page, so it keeps the full image
    const coverSrc = !featured && thumbFor(p.coverId) ? P + thumbFor(p.coverId) : img(p.coverId, P);
    return `
    <a class="post-card reveal${featured ? ' featured' : ''}${wide ? ' wide' : ''}" href="${P}post/${encodeURI(p.slug)}/">
      <div class="cover"><img src="${coverSrc}" alt="${esc(p.title)}" loading="${featured ? 'eager' : 'lazy'}"></div>
      <div class="body">
        ${meta}
        <h2>${esc(p.title)}${featured ? ' <span class="glitch">&#9646;&#9642;</span>' : ''}</h2>
        <p class="excerpt">${esc(excerpt)}&hellip;</p>
        <div class="card-foot"><span class="read">Read story</span><span class="views"><b data-count="${views}">${views}</b> views ${HEART_SVG}</span></div>
      </div>
    </a>`;
  }).join('\n');

  const seo = SEO_PAGES['/blogs/'] || {};
  smAdd('/blogs/', { priority: 0.8, changefreq: 'weekly' });
  write('blogs/index.html', shell({
    title: seo.title || 'BLOG | Štefan Šraga – Photo & Video Production',
    desc: seo.description || 'Blog — events, esports, tech and photography stories by Štefan Šraga.',
    prefix: P,
    body: `${titleBar('Blog')}\n<div class="post-list">${cards}\n</div>\n${cmsScripts(P, 'blog.js')}`,
    path: '/blogs/',
    jsonld: JSONLD.blogsIndex || null,
  }));

  redirect('blog/index.html', '../blogs/');
  redirect('blank/index.html', '../rallypraguerevival/');
}

/* ============================================================
   LEGAL PAGES
   ============================================================ */
for (const [slug, name, jf] of [
  ['privacy-policy', 'Privacy Policy', 'privacy-policy.json'],
  ['accessibility-statement', 'Accessibility Statement', 'accessibility-statement.json'],
]) {
  const j = rd(path.join(C, jf));
  const P = '../';
  const seen = new Set();
  const frags = [];
  for (const s of j.sections) {
    if (!s.text || s.text.length < 3 || isJunk(s.text)) continue;
    if (s.text.trim().toUpperCase() === name.toUpperCase()) continue;
    if (seen.has(s.text)) continue;
    seen.add(s.text);
    frags.push(s.html ? richClean(s.html) : `<p>${esc(s.text)}</p>`);
  }
  const seo = SEO_PAGES[`/${slug}/`] || {};
  const lTitle = seo.title || `${name.toUpperCase()} | Štefan Šraga – Photo & Video Production`;
  const lDesc = seo.description || `${name} — Štefan Šraga, photo & video production.`;
  smAdd(`/${slug}/`, { priority: 0.3, changefreq: 'yearly' });
  write(`${slug}/index.html`, shell({
    title: lTitle,
    desc: lDesc,
    prefix: P,
    body: `${titleBar(name)}\n<div class="prose">${frags.join('\n')}</div>`,
    cms: true,
    path: `/${slug}/`,
    jsonld: webPageLd(name, lDesc, `/${slug}/`),
  }));
}

/* Cookie Policy — hand-written to match what the site actually stores (kept
   honest + minimal; the consent banner records the visitor's choice). */
{
  const P = '../';
  const cookiesBody = `
  <h2>What are cookies?</h2>
  <p>Cookies are small text files a website stores on your device. Similar technologies (local and session storage) work the same way. This page explains what this site uses and why.</p>

  <h2>What we use</h2>
  <p><strong>Essential &amp; functional only.</strong> This website keeps things working and remembers a couple of small preferences. Specifically:</p>
  <ul>
    <li><strong>Your cookie choice</strong> — so this banner does not keep asking (stored locally as <em>sr_cookie_consent</em>).</li>
    <li><strong>View counting</strong> — a per-visit marker so a single visit is not counted twice; it does not identify you.</li>
    <li><strong>Admin login</strong> — the private administration area (<em>/admin</em>) uses a sign-in cookie for the site owner only. Regular visitors never receive it.</li>
  </ul>

  <h2>Embedded content (third party)</h2>
  <p>Some pages include videos hosted on YouTube. When you press play, YouTube may set its own cookies. We embed videos through <em>youtube-nocookie.com</em> (YouTube's privacy-enhanced mode) to reduce this, but their cookies are governed by Google's own policies.</p>

  <h2>What we do NOT use</h2>
  <p>No advertising cookies, no cross-site tracking, and no third-party marketing profiling. There is currently no web analytics running on the public site.</p>

  <h2>Your choices</h2>
  <p>You can <strong>Accept</strong> or <strong>Decline</strong> in the banner shown on your first visit. You can change your decision anytime via <a href="#" class="cookie-settings">Cookie&nbsp;settings</a> in the footer. You can also block or delete cookies in your browser settings — essential features may stop working if you do.</p>

  <h2>Contact</h2>
  <p>Questions about this policy? Write to <a href="mailto:info@stefansraga.cz">info@stefansraga.cz</a>. See also our <a href="${P}privacy-policy/">Privacy Policy</a>.</p>`;
  const cDesc = 'How stefansraga.com uses cookies: essential and functional only, plus third-party YouTube cookies when you play an embedded video. No advertising or tracking cookies.';
  smAdd('/cookies/', { priority: 0.3, changefreq: 'yearly' });
  write('cookies/index.html', shell({
    title: 'COOKIE POLICY | Štefan Šraga',
    desc: cDesc,
    prefix: P,
    body: `${titleBar('Cookie Policy')}\n<div class="prose">${cookiesBody}</div>`,
    cms: true,
    path: '/cookies/',
    jsonld: webPageLd('Cookie Policy', cDesc, '/cookies/'),
  }));
}

/* ============================================================
   MARKETING
   ============================================================ */
{
  const P = '../';
  // Marketing — clean editorial ledger: big statement, four service rows
  // (original copy), green CTA. No gimmicks.
  const SERVICES = [
    ['SEO', 'We can help with the integration and activation of services such as Google Analytics 4, Google Tag Manager, product comparison platforms with effective bidding, high-quality XML feeds, Mergado, and more.'],
    ['PPC', 'Comprehensive strategy, in-depth analysis, and full creation of PPC campaigns. We focus on targeted advertising, smart remarketing, and efficient budget management to maximize your return on investment.'],
    ['Data Analysis', 'We use advanced tools like Google Analytics, Power BI, Clarity, Google Ads, and Looker Studio to analyze data, optimize performance, and improve ad efficiency while reducing costs.'],
    ['E-mail Marketing', 'We create email campaigns that boost engagement, increase sales, and build loyalty through smart segmentation, personalization, and performance tracking.'],
  ];
  const rows = SERVICES.map(([name, text], i) => `
    <li class="mkh-ch reveal">
      <h3 class="mkh-ch-name" data-cms-text="mkt_s${i + 1}_n">${esc(name)}</h3>
      <p class="mkh-ch-text" data-cms-html="mkt_s${i + 1}_t">${esc(text)}</p>
    </li>`).join('\n');

  const body = `
  ${titleBar('Marketing')}

  <section class="mkh-intro reveal">
    <h2 class="mkh-statement" data-cms-html="mkt_statement">Strategy shapes <em>visibility</em></h2>
    <p class="mkh-lede" data-cms-html="mkt_lede">I help brands grow through thoughtful digital marketing such as email campaigns, branding and content with functional websites and e-shops designed to convert, from idea to launch.</p>
  </section>

  <section class="mkh-console">
    <ul class="mkh-channels">
${rows}
    </ul>
  </section>

  <section class="mkh-cta reveal">
    <h2 class="mkh-cta-title" data-cms-text="mkt_cta_t">From idea to launch.</h2>
    <p class="mkh-cta-sub" data-cms-html="mkt_cta_s">Tell me what you&rsquo;re building and I&rsquo;ll bring the strategy, the numbers and the camera.</p>
    <div class="mkh-cta-actions">
      <a class="mkh-btn solid" href="mailto:info@stefansraga.cz"><span data-cms-mail="footer_email">info@stefansraga.cz</span> <span class="arr">&rarr;</span></a>
      <a class="mkh-btn" href="tel:+420737419707" data-cms-tel="footer_phone">+420 737 419 707</a>
    </div>
  </section>`;

  const seo = SEO_PAGES['/marketing/'] || {};
  const mDesc = seo.description || 'Marketing services — SEO, PPC, data analysis and e-mail marketing.';
  smAdd('/marketing/', { priority: 0.8, changefreq: 'monthly' });
  write('marketing/index.html', shell({
    title: seo.title || 'MARKETING | Štefan Šraga – Photo & Video Production',
    desc: mDesc,
    prefix: P,
    body,
    cms: true,
    path: '/marketing/',
    jsonld: webPageLd('Marketing', mDesc, '/marketing/'),
  }));
}

/* ============================================================
   PHOTOS HUB
   ============================================================ */
{
  const P = '../';
  const pj = rd(path.join(C, 'photos.json'));
  const T = i => pj.sections[i].text;
  const cards = [
    { t: 'INTEL COLOGNE MAJOR 26', d: T(4), img: '491946_1c3d862deb5f4245b88608470045ede5~mv2.jpg', link: null, side: 'left' },
    { t: 'FOOTBALL', d: T(8), img: '491946_c5bd8212f79f4eecafe0249aa4341906~mv2.jpg', link: 'football/', side: 'right' },
    { t: 'ICE HOCKEY', d: T(10), img: '491946_bd4d7dd8bab7418f9964f21603cdff73~mv2.jpg', link: 'icehockey/', side: 'left' },
    { t: 'EVENT EXPERIENCE', d: T(14), img: '491946_27f07bd2a26b4c06b3e28e1ac600be10~mv2.jpg', link: 'events/', side: 'right' },
    { t: 'POWER PERFORMANCE', d: T(16), img: '491946_d0c2f009b6be41a7a4344414b9578806~mv2.jpg', link: 'cars/', side: 'left' },
    { t: 'RALLY PRAGUE REVIVAL', d: T(20), img: '942fb7_2d56ef376c5446ffb196a11d191f42a4~mv2.webp', link: 'rallypraguerevival/', side: 'right' },
    { t: 'URBEX', d: T(22), img: '491946_4a6d5d34e00c4bb0b5300c534b144534~mv2.jpg', link: 'urbex/', side: 'left' },
    { t: 'Comic-Con 2024', d: T(26), img: '942fb7_5c5a4126addd49acbfc05e99aa975e44~mv2.webp', link: 'comicconprague/', side: 'right' },
  ];
  const rows = cards.map((c, i) => {
    const n = i + 1;   // per-card CMS keys photos_cardN_{t,d,img}
    // width/height reserve the box before the photo loads — without them the
    // media area collapsed to 0px on mobile and cards visually ran together
    const dims = imgDims(path.join(ROOT, 'assets/img', c.img.replace('~mv2', '')));
    const wh = dims ? ` width="${dims.w}" height="${dims.h}"` : '';
    const media = `<div class="media">${c.link ? `<a href="${P}${c.link}">` : ''}<img src="${img(c.img, P)}" alt="${esc(c.t)}"${wh} loading="lazy" data-cms-src="photos_card${n}_img">${c.link ? '</a>' : ''}</div>`;
    const title = c.link
      ? `<h2><a href="${P}${c.link}" data-cms-text="photos_card${n}_t">${esc(c.t)}</a></h2>`
      : `<h2 data-cms-text="photos_card${n}_t">${esc(c.t)}</h2>`;
    const text = `<div class="text">
      ${title}
      <p data-cms-html="photos_card${n}_d">${esc(c.d)}</p>
      ${c.link ? '<span class="cta">View gallery &rarr;</span>' : ''}
    </div>`;
    // .reverse flips visual order via direction:rtl — keep DOM order media,text
    return `<div class="card-row reveal${c.side === 'right' ? ' reverse' : ''}">${media}${text}</div>`;
  }).join('\n');

  // slugs already covered by the built-in cards above — photoshub.js appends
  // a card only for galleries NOT in this list (i.e. new ones added in the admin)
  const knownSlugs = 'football,icehockey,events,cars,rallypraguerevival,urbex,comicconprague';
  const seo = SEO_PAGES['/photos/'] || {};
  smAdd('/photos/', { priority: 0.8, changefreq: 'monthly' });
  write('photos/index.html', shell({
    title: seo.title || 'PHOTOS | Štefan Šraga – Photo & Video Production',
    desc: seo.description || 'Photography portfolio — esports, football, ice hockey, events, cars, rally, urbex and Comic-Con.',
    prefix: P,
    body: `${titleBar('Photography', 'photos_title')}\n<div class="photos-list" data-galleries data-known="${knownSlugs}" style="padding:0 4vw 60px">${rows}</div>\n${cmsScripts(P, 'photoshub.js')}`,
    path: '/photos/',
    jsonld: JSONLD.photosHub || null,
  }));

  // dynamic gallery template — serves brand-new galleries added in the admin
  // (Vercel rewrites /photos/<slug> here; gallery.js renders it from Supabase)
  write('photos/view/index.html', shell({
    title: 'Gallery — Štefan Šraga',
    desc: 'Browse full-size photo sets by Štefan Šraga — galleries from esports arenas, sports matches, events and shoots.',
    prefix: '../../',
    body: `<div class="gallery-hero"></div>\n${cmsScripts('../../', 'gallery.js')}`,
  }));
}

/* ============================================================
   VIDEOS
   ============================================================ */
{
  const P = '../';
  const vj = rd(path.join(C, 'videos-page-full.json'));
  const vssr = rd(path.join(C, 'videos.json'));
  // description lookup: rich html section that follows the exact title section (keeps green highlights)
  function descFor(title) {
    const secs = vssr.sections;
    for (let i = 0; i < secs.length; i++) {
      const t = (secs[i].text || '').replace(/​/g, '').trim().toLowerCase();
      if (t === title.toLowerCase()) {
        for (let k = i + 1; k < Math.min(i + 3, secs.length); k++) {
          if ((secs[k].text || '').replace(/​/g, '').trim().length > 60) {
            return secs[k].html ? richClean(secs[k].html) : `<p>${esc(secs[k].text)}</p>`;
          }
        }
      }
    }
    // fallback: live-extracted plain paras
    for (const s of vj.sections) {
      const i = s.paras.findIndex(x => x.replace(/​/g, '').trim().toLowerCase() === title.toLowerCase());
      if (i >= 0 && s.paras[i + 1]) return `<p>${esc(s.paras[i + 1].replace(/​/g, '').trim())}</p>`;
    }
    return '';
  }
  const BLOCKS = [
    { t: 'IEM COLOGNE MAJOR 26', vid: '491946_ed08a9e242134ce6be6327cce400fe43', portrait: true, posterId: '491946_1c3d862deb5f4245b88608470045ede5~mv2.jpg' },
    { t: 'Clash of the Stars 16', vid: '491946_38cbb1a761ff434393be653ede613d8b', portrait: true },
    { t: 'IEM KRAKÓW 26', vid: '491946_59ca5df2ca994335963810a4df30b39d', portrait: true },
    { t: 'IEM KATOWICE - Hall of Heroes', yt: '-dhOdup2cMo' },
    { t: 'STARLADDER MAJOR 2025 Budapest', img: '491946_0140edccc5f2419cad6cf620468af4b8~mv2.jpg' },
    { t: 'CLASH OF THE STARS Baba Jaga Promo', vid: '491946_5af9a881fb9242159f4ec99cbac0daea', portrait: true },
    { collab: true },
    { t: 'RAMSON BARBER promo spot', yt: 'nJ0PC8LIzBY' },
    { t: 'Speed, power and pure passion', yt: 'Ny3ixBGOGvc' },
    { t: 'Born to Rule the Game', yt: 'faNMqMeDQJU' },
    { t: 'Where Every Paw Matters', yt: 'w1fNC0BB5nE' },
    { t: 'HC Teplice Huskies', yt: 'U87QbqV7utk' },
    { t: 'Awaken Your Inner Hero', yt: 'EdbCakDebd8' },
    { t: 'Chasing Glory on Ice', yt: 'C0gvJ_RZ91g' },
    { t: 'STRONGHOLD SUPERHORSE', yt: '4fWiDfy8pbA' },
    { t: 'CRAFTMAKER ROLLER X-Stand', yt: '8-vdxbzLN7U' },
    { t: 'craftmaker work table T200', yt: 'DIVrad6YN_k' },
    { t: 'STRONGBOLD S1', yt: 'EyyFuxZps90' },
    { t: 'craftmaker foldstation s20', yt: 'g0YFdihJJhE' },
    { t: 'strongbold superhorse H800', yt: 'Hjy3RObUdpg' },
  ];
  const collabImgs = [
    '491946_1befe98eb999420ebaa6c848508f806ef003.jpg',
    '491946_255006e7f03f48f48e9a4cadfbdef2fcf003.jpg',
    '491946_12191d3418514f45af4c658d78af8e08f003.jpg',
    '491946_d81cea3784b440e699aabb041418e83cf003.jpg',
  ];

  let side = 0;
  const blocks = BLOCKS.map(b => {
    if (b.collab) {
      return `
  <section class="collab reveal">
    <h2>Vla&#271;kySyn<br>Collaboration</h2>
    <div class="collab-viewport">
      <div class="collab-track">
        ${collabImgs.map(id => `<a href="${img(id, P)}"><img src="${img(id, P)}" alt="VlaďkySyn collaboration" loading="lazy"></a>`).join('\n        ')}
      </div>
    </div>
    <button class="collab-next" aria-label="Next">&#8250;</button>
  </section>`;
    }
    const d = descFor(b.t);
    let media;
    if (b.vid) {
      // always give native videos a poster frame (extracted from the mp4) so the box is never black
      const poster = `poster/${b.vid}.jpg`;
      const hasPoster = fs.existsSync(path.join(ROOT, 'assets/img', poster));
      media = `<video controls preload="metadata"${hasPoster ? ` poster="${P}assets/img/${poster}"` : ''} src="${P}assets/video/${b.vid}.mp4"${b.portrait ? ' class="portrait"' : ''}></video>`;
    } else if (b.yt) {
      // local YouTube thumbnail as the box background, so it shows content even before the iframe loads
      const thumb = `poster/yt-${b.yt}.jpg`;
      const hasThumb = fs.existsSync(path.join(ROOT, 'assets/img', thumb));
      const bg = hasThumb ? ` style="background-image:url(${P}assets/img/${thumb})"` : '';
      media = `<div class="yt-embed"${bg}><iframe src="https://www.youtube-nocookie.com/embed/${b.yt}" title="${esc(b.t)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    } else {
      media = `<img src="${img(b.img, P)}" alt="${esc(b.t)}" loading="lazy" style="border-radius:var(--radius-media)">`;
    }
    const rev = side++ % 2 === 1;
    const text = `<div class="text"><h2>${esc(b.t)}</h2>${d}</div>`;
    const mediaDiv = `<div class="media">${media}</div>`;
    return `
  <section class="video-block reveal${rev ? ' reverse' : ''}">
    ${mediaDiv}${text}
  </section>`;
  }).join('\n');

  // Data-driven category grid — rendered at runtime from assets/data/videos.json
  // (single source of truth; a future backend/CMS serves the same shape, the owner edits the file).
  void blocks; // legacy alternating-block markup kept above for reference, no longer emitted
  const collab = `
  <section class="collab reveal">
    <h2>Vla&#271;kySyn<br>Collaboration</h2>
    <div class="collab-viewport">
      <div class="collab-track">
        ${collabImgs.map(id => `<a href="${img(id, P)}"><img src="${img(id, P)}" alt="VlaďkySyn collaboration" loading="lazy"></a>`).join('\n        ')}
      </div>
    </div>
    <button class="collab-next" aria-label="Next">&#8250;</button>
  </section>`;
  void collab; // VlaďkySyn collab section hidden per client request
  const body = `
  ${titleBar('Videos', 'videos_title')}
  <div class="videos-page" data-videos data-per-page="9" data-base="${P}" data-feed="${P}assets/data/videos.json">
    <div class="vid-filters"></div>
    <div class="vid-grid"></div>
    <p class="vid-empty" hidden>Loading videos&hellip;</p>
  </div>
  <script src="${P}assets/js/vendor/supabase.js"></script>
  <script src="${P}assets/js/config.js?v=46"></script>
  <script src="${P}assets/js/cms.js?v=46"></script>
  <script src="${P}assets/js/videos.js?v=46"></script>
  <script src="${P}assets/js/site.js?v=46"></script>`;
  const seo = SEO_PAGES['/videos/'] || {};
  smAdd('/videos/', { priority: 0.8, changefreq: 'weekly' });
  write('videos/index.html', shell({
    title: seo.title || 'VIDEOS | Štefan Šraga – Photo & Video Production',
    desc: seo.description || 'Video portfolio — esports aftermovies, promo spots and commercial work by Štefan Šraga.',
    prefix: P,
    body,
    path: '/videos/',
    jsonld: JSONLD.videos || null,
  }));
}

/* ============================================================
   ABOUT ME — original Wix layout (photo left · caption right-
   aligned by the glowing green line at ~72% · big Anton years
   right of the line), lightly polished.
   ============================================================ */
{
  const P = '../';
  const aj = rd(path.join(C, 'about-me.json'));
  // bio: section with html + green spans (original styling)
  let bio = '';
  for (const s of aj.sections) {
    if (s.text && s.text.startsWith('I’ve always wanted') && s.html) { bio = richClean(s.html); break; }
  }
  const TL = [
    { y: '2015', c: 'Game Retail Sales Specialist', img: '942fb7_3a453581e13c4f2fb27674e191719976~mv2.jpg' },
    { y: '2016|2018', c: 'Manager of a Newly Opened Game Store', img: '942fb7_1921057dc071449797c8a84a57803f05~mv2.jpg' },
    { y: '2016', c: 'First visit to Gamescom', img: '942fb7_2e534c3585614e619a87473e76c20dd2~mv2.jpg' },
    { y: '2017|2018', c: 'Social media specialist in game retail', img: null },
    { y: '2018', c: 'Obtaining accreditation for the largest gaming trade show, E3, in Los Angeles', img: '942fb7_1d8435a0489f41e1b5250c6904ed30a1~mv2.jpg' },
    { y: '2018', c: 'Founding the esports organization Nessus Gaming', img: '942fb7_e05bc6008958446496ca5ff56c952a47~mv2.jpg' },
    { y: '2019', c: 'Linking the esports organization with the first-league football club FK Teplice', img: '942fb7_08a0321d57ac40faac086dea06233683~mv2.jpg' },
    { y: '2019', c: 'Second visit to E3 in Los Angeles', img: '4a2b8d_72796dd0dabe4c0d983cbdafa65538cc~mv2.jpg' },
    { y: '2019', c: 'ESL Events – Intel Extreme Masters + ESL One (Guest Badge)', img: '4a2b8d_1b0bcf6c2351425f9f5bc504c42c6e22~mv2.jpg' },
    { y: '2019|2023', c: 'Marketing specialist in game retail', img: '4a2b8d_cbb237c79c7e41fba2ae3bc37473f63e~mv2.jpg' },
    { y: '2019|present', c: 'Ongoing partnership with FK Teplice', img: '4a2b8d_ed451d34335742758a939fd611a1f38a~mv2.jpg' },
    { y: '2021|2023', c: 'Retail Manager in game retail', img: null },
    { y: '2023', c: 'Self-employed PHOTO / VIDEO / MARKETING', img: '4a2b8d_86a444e6203e495f880893951a3b8d9d~mv2.jpg' },
    { y: '2023', c: 'Video Production / E-mailing / Data Analytics Regals.cz', img: null },
    { y: '2023|present', c: 'Head of Marketing Platinum Natural', img: '942fb7_25289f5032e2481d93ef05149dd02caf~mv2.png' },
    { y: '2025', c: 'Web/Brand Redesign', img: '4a2b8d_6c9bd929dcd04534b3fd977afb1dcbc7~mv2.jpg' },
    { y: '2025|2026', c: 'One year since opening Šragi-Cards', img: 'sragi_logo_green.png', logo: true },
  ];
  // THE STORY LINE — center green line that fills as you scroll; each stop
  // ignites when the glowing tip reaches its dot: year+caption slide out to
  // one side, the photo to the other, alternating sides stop by stop.
  const rows = TL.map((e, i) => {
    const years = e.y.split('|');
    // four-digit years get a data-y so the engine can roll the digits up
    const wrapY = s => /^\d{4}$/.test(s) ? `<b class="tlx-num" data-y="${s}">${s}</b>` : esc(s);
    const yearHtml = years.length === 2
      ? `${wrapY(years[0])}<span class="tlx-range" aria-hidden="true"><i></i></span>${wrapY(years[1])}`   /* fill between the two years */
      : wrapY(years[0]);
    let media = '';
    if (e.logo) {
      media = `<figure class="tlx-media logo"><img src="${img(e.img, P)}" alt="${esc(e.c)}" loading="lazy"></figure>`;
    } else if (e.img) {
      // tile ships the 640px thumb (2MB Platinum PNG → ~60KB JPG); the
      // lightbox href keeps the full image. width/height attrs → no CLS.
      const t = thumbFor(e.img);
      const srcRel = t || ('assets/img/' + e.img.replace('~mv2', ''));
      const dims = imgDims(path.join(ROOT, srcRel));
      const wh = dims ? ` width="${dims.w}" height="${dims.h}"` : '';
      media = `<figure class="tlx-media"><a class="tlx-photo" href="${img(e.img, P)}"><img src="${P}${srcRel}" alt="${esc(e.c)}"${wh} loading="lazy"></a></figure>`;
    }
    return `
    <li class="tlx-item${e.img || e.logo ? '' : ' noimg'}" id="tl-${i}">
      <span class="tlx-dot" aria-hidden="true"></span>
      <div class="tlx-info">
        <span class="tlx-year">${yearHtml}</span>
        <p class="tlx-cap">${esc(e.c)}</p>
      </div>
      ${media}
    </li>`;
  }).join('\n');

  // side jump-nav — one marker per stop, active syncs with the line, click scrolls
  const nav = `<nav class="tlx-nav" aria-label="Story navigation">${TL.map((e, i) =>
    `<a class="tlx-nav-dot" href="#tl-${i}" data-i="${i}"><span class="tlx-nav-yr">${esc(e.y.split('|')[0])}</span></a>`).join('')}</nav>`;

  const body = `
  ${titleBar('About Me', 'about_title')}
  <div class="about-hero">
    <div class="about-intro">
      <p class="about-kicker" data-cms-text="about_subtitle">CREATIVE MARKETER &amp; PHOTOGRAPHER</p>
      <h1 class="about-statement" data-cms-text="about_name">Štefan Šraga</h1>
      <div class="bio about-lede reveal" data-cms-html="about_bio">${bio}</div>
    </div>
    <div class="portrait reveal">
      <img src="${img('942fb7_7ef2a323100d40eab72d39866cbb0491~mv2.jpg', P)}" alt="Štefan Šraga portrait" data-cms-src="about_portrait">
    </div>
  </div>
  <h2 class="story-heading" data-cms-text="about_story_heading">This is my Story</h2>
  <section class="tlx">
    <div class="tlx-track" aria-hidden="true"><i class="tlx-fill"></i></div>
    <ol class="tlx-list" data-lightbox>
${rows}
    </ol>
    ${nav}
  </section>`;

  const seo = SEO_PAGES['/about-me/'] || {};
  smAdd('/about-me/', { priority: 0.8, changefreq: 'monthly' });
  write('about-me/index.html', shell({
    title: seo.title || 'ABOUT ME | Štefan Šraga – Photo & Video Production',
    desc: seo.description || 'Creative marketer & photographer — the story of Štefan Šraga.',
    prefix: P,
    body,
    cms: true,
    path: '/about-me/',
    ogImage: '/assets/img/942fb7_7ef2a323100d40eab72d39866cbb0491.jpg',
    jsonld: JSONLD.about || null,
    // smooth jumps for the side nav; stops land nicely centred on the tip
    extraCss: 'html{scroll-behavior:smooth}.tlx-item{scroll-margin-top:40vh}',
  }));
}

/* ============================================================
   404 — Vercel serves /404.html for any missing path, so every
   link must be ABSOLUTE (prefix '/'). Keeps site chrome + nav.
   ============================================================ */
write('404.html', shell({
  title: '404 — Frame Not Found | Štefan Šraga',
  desc: 'This page does not exist. Browse photos, videos or the blog instead.',
  prefix: '/',
  noindex: true,
  body: `
  <section class="nf" style="min-height:52vh;display:grid;place-items:center;text-align:center;padding:60px 5vw">
    <div>
      <p class="mono" style="color:var(--accent);letter-spacing:.2em;margin:0 0 14px">// ERROR 404</p>
      <h1 style="font-family:var(--font-display);font-size:clamp(42px,7vw,96px);margin:0 0 10px;text-transform:uppercase">Frame not found</h1>
      <p style="color:var(--fg-muted);max-width:46ch;margin:0 auto 30px">This shot never made it to the contact sheet — the page you are looking for does not exist or has moved.</p>
      <p style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:0">
        <a class="mkh-btn solid" href="/">Home <span class="arr">&rarr;</span></a>
        <a class="mkh-btn" href="/photos/">Photos</a>
        <a class="mkh-btn" href="/blogs/">Blog</a>
      </p>
    </div>
  </section>`,
}));

/* ============================================================
   HOMEPAGE SEO PATCH
   index.html is hand-written (it never goes through shell()), but it is the
   single most important page for search. So the owner's admin edits are
   patched straight into its <head> at build time. With no overrides the file
   is left byte-identical, so a local build never dirties the repo.
   ============================================================ */
{
  const t = OVERRIDES.seo_home_title;
  const d = OVERRIDES.seo_home_desc;
  const og = OVERRIDES.seo_home_og;
  if (t || d || og) {
    const f = path.join(ROOT, 'index.html');
    let h = fs.readFileSync(f, 'utf8');
    const before = h;
    const set = (re, val) => { if (val) h = h.replace(re, val); };
    if (t) {
      set(/<title>[\s\S]*?<\/title>/, `<title>${esc(t)}</title>`);
      set(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(t)}$2`);
      set(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(t)}$2`);
    }
    if (d) {
      set(/(<meta name="description" content=")[^"]*(")/, `$1${esc(d)}$2`);
      set(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(d)}$2`);
      set(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(d)}$2`);
    }
    if (og) {
      const abs = og.startsWith('http') ? og : absU(og);
      set(/(<meta property="og:image" content=")[^"]*(")/, `$1${abs}$2`);
      set(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${abs}$2`);
      // a custom share image has unknown dimensions — stale hints would mis-crop
      h = h.replace(/\s*<meta property="og:image:(width|height)" content="\d+">/g, '');
    }
    if (h !== before) { fs.writeFileSync(f, h, 'utf8'); console.log('wrote index.html (homepage SEO patched)'); }
  }
}

/* ============================================================
   SITEMAP + ROBOTS
   Homepage is hand-written (index.html) so it is added here, not
   at a write() site. Redirect pages (blog/, blank/) and the dynamic
   templates (post/view/, photos/view/) are deliberately NOT listed.
   ============================================================ */
{
  smAdd('/', { priority: 1.0, changefreq: 'weekly' });
  const today = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP
    .sort((a, b) => b.priority - a.priority || a.urlPath.localeCompare(b.urlPath))
    .map(u => `  <url>
    <loc>${absU(u.urlPath)}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(1)}</priority>${u.images ? '\n' + u.images.map(im => `    <image:image><image:loc>${im}</image:loc></image:image>`).join('\n') : ''}
  </url>`).join('\n');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`);
  write('robots.txt', `# All crawlers welcome — including AI assistants (GEO).
User-agent: *
Allow: /
Disallow: /admin/

# Explicit welcome for AI / LLM crawlers
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Meta-ExternalAgent
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

  /* llms.txt — GEO: a concise, factual, markdown site guide for AI assistants
     (llmstxt.org convention). Built from the same SEO copy as the pages, so it
     never drifts from what the site actually says. */
  const lp = (p, fallback) => (SEO_PAGES[p] && SEO_PAGES[p].description) || fallback;
  const galleryLines = GALLERIES.map(g =>
    `- [${g.name}](${absU(`/${g.slug}/`)}): ${lp(`/${g.slug}/`, `${g.name} photo gallery`)}`).join('\n');
  const postLines = postsData.map(p => {
    const s = SEO_POSTS[p.slug] || {};
    return `- [${p.title}](${absU(`/post/${encodeURI(p.slug)}/`)}) (${isoDate(p.date) || p.date}): ${s.description || metaDesc(plain(p.body), 120)}`;
  }).join('\n');
  write('llms.txt', `# Štefan Šraga — Photography, Video & Creative Marketing

> ${lp('/', 'Photo and video creator and marketing strategist from Most, Czech Republic. Esports, sports and event coverage plus brand campaigns since 2015.')}

Štefan Šraga (Stefan Sraga) is a photographer and creative marketer based in Most, Czech Republic, active since 2015. He covers esports events (Intel Extreme Masters, ESL One, Gamescom, E3, League of Legends Worlds), football (long-term partnership with FK Teplice), ice hockey, cars and rally, urbex and Comic-Con Prague. He also runs the trading-card project Šragi-Cards (https://www.sragicards.cz/).

## Services

- Photography — event, sports and esports photography; details that preserve emotion and atmosphere.
- Video — cinematic videos for events, brands and campaigns; an IEM aftermovie passed 100,000 views.
- Marketing — strategy, SEO and analytics setup, PPC, e-mail campaigns, branding, websites and e-shops built to convert.

## Main pages

- [Home](${absU('/')}): ${lp('/', 'Portfolio homepage')}
- [Photos](${absU('/photos/')}): ${lp('/photos/', 'Photo galleries')}
- [Videos](${absU('/videos/')}): ${lp('/videos/', 'Video portfolio')}
- [Marketing](${absU('/marketing/')}): ${lp('/marketing/', 'Marketing services')}
- [About](${absU('/about-me/')}): ${lp('/about-me/', 'The story of Štefan Šraga')}
- [Blog](${absU('/blogs/')}): ${lp('/blogs/', 'Blog')}

## Photo galleries

${galleryLines}

## Blog posts

${postLines}

## Contact

- E-mail: info@stefansraga.cz
- Phone: +420 737 419 707
- Address: Petra Jilemnického 2451/2, 434 01 Most, Czech Republic (IČO 19151578)
- LinkedIn: https://www.linkedin.com/in/stefansraga/
- Instagram: https://www.instagram.com/sraga.s/
`);
  console.log(`sitemap: ${SITEMAP.length} URLs`);
}

console.log('ALL PAGES GENERATED');
