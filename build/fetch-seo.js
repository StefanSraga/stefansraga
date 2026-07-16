/* Build step 1/2 — pull the owner's SEO edits out of Supabase.

   The owner edits SEO in /admin (stored in the `settings` table as
   cms_seo_* keys). This script fetches them and writes seo-overrides.json,
   which generate-site.js then bakes into the static HTML.

   Why a separate pre-step: generate-site.js is fully synchronous, and fetch
   is not. Splitting keeps that script untouched and simple.

   SAFETY: this must NEVER fail the build. Any problem (no network, project
   paused, table missing, bad key) → write an empty overrides file and let the
   generator fall back to the built-in defaults. A missed SEO edit is a small
   problem; a site that won't deploy is a big one.
*/
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'seo-overrides.json');

// read the same credentials the site uses (single source of truth)
function readConfig() {
  try {
    const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'config.js'), 'utf8');
    const url = (js.match(/url:\s*'([^']+)'/) || [])[1];
    const key = (js.match(/anonKey:\s*'([^']+)'/) || [])[1];
    return (url && key && !/YOUR_/i.test(url)) ? { url, key } : null;
  } catch (e) { return null; }
}

async function main() {
  const cfg = readConfig();
  if (!cfg) {
    console.warn('[seo] no Supabase config — using built-in defaults');
    return fs.writeFileSync(OUT, '{}');
  }
  try {
    const res = await fetch(`${cfg.url}/rest/v1/settings?select=key,value`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('unexpected response');

    // keep only SEO keys; unwrap {v:…} or raw string values (both shapes exist)
    const out = {};
    for (const r of rows) {
      if (!r.key || !/^cms_seo_/.test(r.key)) continue;
      const v = (r.value && typeof r.value === 'object' && 'v' in r.value) ? r.value.v : r.value;
      if (typeof v === 'string' && v.trim()) out[r.key.replace(/^cms_/, '')] = v.trim();
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log(`[seo] loaded ${Object.keys(out).length} SEO override(s) from Supabase`);
  } catch (e) {
    console.warn('[seo] could not read Supabase (' + e.message + ') — using built-in defaults');
    fs.writeFileSync(OUT, '{}');
  }
}

main().catch(e => {
  console.warn('[seo] unexpected error — using built-in defaults:', e.message);
  try { fs.writeFileSync(OUT, '{}'); } catch (_) {}
});
