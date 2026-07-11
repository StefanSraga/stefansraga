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
