/* ============================================================
   Shared CMS data layer (public, read-only).
   Wraps the Supabase client. If Supabase isn't configured yet,
   SR.ready is false and pages fall back to their static content.
   Requires: assets/js/vendor/supabase.js + assets/js/config.js (loaded first).
   ============================================================ */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = cfg.url && cfg.anonKey &&
    !/YOUR-PROJECT|YOUR-PUBLIC/.test(cfg.url + cfg.anonKey);

  let client = null;
  if (configured && window.supabase && window.supabase.createClient) {
    try { client = window.supabase.createClient(cfg.url, cfg.anonKey); } catch (e) { console.error(e); }
  }

  async function rows(builder) {
    const { data, error } = await builder;
    if (error) { console.error('[cms]', error.message); throw error; }
    return data || [];
  }

  const SR = {
    ready: !!client,
    client,

    getCategories: () => rows(client.from('categories').select('*').order('sort')),

    getVideos: () => rows(client.from('videos').select('*')
      .eq('published', true).order('sort')),

    // Newest first → the first card (index 0) is always the latest published
    // post, i.e. the big featured poster frame on the blog is self-updating.
    getPosts: () => rows(client.from('posts').select('*')
      .eq('published', true).order('created_at', { ascending: false })),

    // No explicit published filter here on purpose: RLS hides drafts from
    // anonymous visitors, but a logged-in admin (same browser as /admin)
    // gets them back — that's the draft-preview feature.
    getPost: async (slug) => {
      const d = await rows(client.from('posts').select('*').eq('slug', slug).limit(1));
      return d[0] || null;
    },

    // +1 view for a published post (SECURITY DEFINER function; anon-safe).
    // Fails silently when the function isn't installed yet.
    bumpViews: (slug) => client.rpc('bump_views', { post_slug: slug })
      .then(r => { if (r.error) console.warn('[views]', r.error.message); }),

    // site settings as { key: value } — silently empty until the settings
    // table exists (pre-migration databases must not spam the console)
    getSettings: async () => {
      try {
        const { data, error } = await client.from('settings').select('*');
        if (error) return {};
        const map = {};
        (data || []).forEach(r => { map[r.key] = r.value; });
        return map;
      } catch (e) { return {}; }
    },

    getGalleries: () => rows(client.from('galleries').select('*')
      .eq('published', true).order('sort')),

    getGallery: async (slug) => {
      const g = await rows(client.from('galleries').select('*').eq('slug', slug).limit(1));
      if (!g[0]) return null;
      const images = await rows(client.from('gallery_images').select('*')
        .eq('gallery_id', g[0].id).order('sort'));
      return { ...g[0], images };
    },
  };

  window.SR = SR;
})();

/* Head-meta updater for client-rendered content (admin-created posts/galleries
   served via the dynamic /view templates). Google executes JS, so setting the
   title/description/canonical/og here gets fresh content indexed properly. */
window.SRMeta = function (o) {
  const ensure = (selector, make) => {
    let el = document.head.querySelector(selector);
    if (!el) { el = make(); document.head.appendChild(el); }
    return el;
  };
  const meta = (key, keyAttr, content) => {
    if (content == null) return;
    const el = ensure(`meta[${keyAttr}="${key}"]`, () => {
      const m = document.createElement('meta'); m.setAttribute(keyAttr, key); return m;
    });
    el.setAttribute('content', content);
  };
  if (o.title) {
    document.title = o.title;
    meta('og:title', 'property', o.title);
    meta('twitter:title', 'name', o.title);
  }
  if (o.desc) {
    meta('description', 'name', o.desc);
    meta('og:description', 'property', o.desc);
    meta('twitter:description', 'name', o.desc);
  }
  if (o.image) {
    meta('og:image', 'property', o.image);
    meta('twitter:image', 'name', o.image);
    // the swapped image has unknown dimensions — stale 1200×630 hints would
    // make scrapers mis-crop the preview
    document.head.querySelectorAll('meta[property="og:image:width"],meta[property="og:image:height"]')
      .forEach(el => el.remove());
  }
  if (o.url) {
    meta('og:url', 'property', o.url);
    ensure('link[rel="canonical"]', () => {
      const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l;
    }).setAttribute('href', o.url);
  }
  if (o.type) meta('og:type', 'property', o.type);
};
