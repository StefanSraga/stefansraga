/* ============================================================
   Admin logic — auth + CRUD for videos, posts, galleries.
   Uses the Supabase client (anon key + a logged-in session).
   All writes are gated by Row-Level-Security: only an authenticated
   admin can change anything.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  const configured = cfg.url && cfg.anonKey && !/YOUR-PROJECT|YOUR-PUBLIC/.test(cfg.url + cfg.anonKey);
  const sb = (configured && window.supabase) ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slugify = s => String(s).toLowerCase().trim()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y').replace(/č/g, 'c').replace(/ď/g, 'd').replace(/ě/g, 'e').replace(/ň/g, 'n').replace(/ř/g, 'r').replace(/š/g, 's').replace(/ť/g, 't').replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // slug is UNIQUE NOT NULL in the DB — guarantee it's non-empty and doesn't
  // collide with another row (auto-append -2/-3…), so a save never fails on a
  // duplicate-key error the owner wouldn't understand.
  async function uniqueSlug(table, desired, ownSlug) {
    const root = slugify(desired) || ('polozka-' + Date.now());
    const { data } = await sb.from(table).select('slug');
    const taken = new Set((data || []).map(r => r.slug).filter(s => s !== ownSlug));
    if (!taken.has(root)) return root;
    let n = 2;
    while (taken.has(root + '-' + n)) n++;
    return root + '-' + n;
  }

  function youtubeId(v) {
    if (!v) return null;
    const m = String(v).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(String(v).trim())) return String(v).trim();
    return null;
  }
  function videoThumb(v) {
    if (v.poster) return v.poster;
    const id = youtubeId(v.video);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  }

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), 3200);
  }
  async function guardCall(promise, okMsg) {
    try { const r = await promise; if (r && r.error) throw r.error; if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(e.message || 'Chyba', true); throw e; }
  }

  /* ---------- storage upload ---------- */
  // Photos straight from a camera are huge — shrink to web size before upload
  // (max 2560 px, JPEG). Saves the free-tier storage AND every visitor's data.
  async function shrinkImage(file, maxEdge = 2560, quality = 0.85) {
    if (!/^image\/(jpeg|webp)$/.test(file.type)) return file;   // PNG (alpha) left untouched
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(maxEdge / Math.max(bmp.width, bmp.height), 1);
      if (scale === 1 && file.size < 900 * 1024) { bmp.close(); return file; }
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return file; }   // anything odd → upload the original
  }

  async function uploadFile(file, folder) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const rand = Math.random().toString(36).slice(2, 9);
    const key = `${folder}/${Date.now()}-${rand}.${ext}`;
    const { error } = await sb.storage.from('media').upload(key, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return sb.storage.from('media').getPublicUrl(key).data.publicUrl;
  }
  async function uploadImage(file, folder) {
    return uploadFile(await shrinkImage(file), folder);
  }

  // When content is deleted, delete its files too — otherwise orphaned photos
  // quietly eat the 1 GB storage. Only touches URLs inside our bucket.
  function storageKey(url) {
    const m = String(url || '').match(/\/storage\/v1\/object\/public\/media\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  async function removeMedia(urls) {
    const keys = [].concat(urls).map(storageKey).filter(Boolean);
    if (keys.length) { try { await sb.storage.from('media').remove(keys); } catch (e) { console.warn(e); } }
  }

  /* ---------- dialog ---------- */
  const dlg = $('#dialog'), dlgForm = $('#dialog-form'), dlgTitle = $('#dialog-title');
  let onSave = null;
  function openDialog(title, fieldsHTML, saveFn) {
    dlgTitle.textContent = title;
    dlgForm.innerHTML = fieldsHTML;
    onSave = saveFn;
    dlg.hidden = false;
  }
  function closeDialog() { dlg.hidden = true; dlgForm.innerHTML = ''; onSave = null; }
  $('#dialog-close').onclick = closeDialog;
  $('#dialog-cancel').onclick = closeDialog;
  $('#dialog-save').onclick = async () => {
    if (!onSave) return;
    const btn = $('#dialog-save'); const old = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
    try { await onSave(); closeDialog(); } catch (e) {} finally { btn.innerHTML = old; btn.disabled = false; }
  };
  dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); });

  const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
  const checked = id => { const e = document.getElementById(id); return e ? e.checked : false; };

  /* ============================================================
     VIDEOS
     ============================================================ */
  let CATS = [];
  async function loadVideosPanel() {
    const panel = $('[data-panel="videos"]');
    panel.innerHTML = '<p class="empty-hint">Načítám…</p>';
    const [{ data: cats }, { data: vids }] = await Promise.all([
      sb.from('categories').select('*').order('sort'),
      sb.from('videos').select('*').order('sort'),
    ]);
    CATS = cats || [];
    panel.innerHTML = '';

    // categories bar
    const catBar = el('div', 'cats');
    catBar.appendChild(el('span', 'lbl', 'Kategorie:'));
    CATS.forEach(c => {
      const chip = el('span', 'cat-chip', `<span class="nm" title="Klikni pro přejmenování">${esc(c.label)}</span> <button title="Smazat">&times;</button>`);
      chip.querySelector('.nm').onclick = async () => {
        const label = prompt('Nový název kategorie:', c.label);
        if (!label || label === c.label) return;
        await guardCall(sb.from('categories').update({ label }).eq('id', c.id), 'Kategorie přejmenována');
        loadVideosPanel();
      };
      chip.querySelector('button').onclick = async () => {
        if (!confirm(`Smazat kategorii „${c.label}"? Videa v ní zůstanou bez kategorie.`)) return;
        await guardCall(sb.from('categories').delete().eq('id', c.id), 'Kategorie smazána');
        loadVideosPanel();
      };
      catBar.appendChild(chip);
    });
    const addCat = el('button', 'btn btn-sm', '+ Kategorie');
    addCat.onclick = () => {
      const label = prompt('Název kategorie (např. Esport):');
      if (!label) return;
      const id = slugify(label);
      guardCall(sb.from('categories').insert({ id, label, sort: CATS.length }), 'Kategorie přidána').then(loadVideosPanel);
    };
    catBar.appendChild(addCat);
    panel.appendChild(catBar);

    // header
    const head = el('div', 'panel-head');
    head.innerHTML = `<h2>Videa</h2><span class="count">${(vids || []).length}</span><span class="spacer"></span>`;
    const addBtn = el('button', 'btn btn-primary', '+ Přidat video');
    addBtn.onclick = () => editVideo(null);
    head.appendChild(addBtn);
    panel.appendChild(head);

    // rows
    const list = el('div', 'rows');
    (vids || []).forEach((v, i) => list.appendChild(videoRow(v, i, vids)));
    if (!(vids || []).length) list.appendChild(el('div', 'empty-hint', 'Zatím žádná videa. Klikni na „+ Přidat video".'));
    panel.appendChild(list);
  }

  function videoRow(v, i, all) {
    const row = el('div', 'row');
    const thumb = videoThumb(v);
    const catLabel = (CATS.find(c => c.id === v.category) || {}).label || '—';
    const soon = !v.video ? '<span class="tag muted">Coming soon</span>' : '';
    row.innerHTML = `
      <div class="order-btns"><button ${i === 0 ? 'disabled' : ''}>▲</button><button ${i === all.length - 1 ? 'disabled' : ''}>▼</button></div>
      <img class="thumb" src="${esc(thumb)}" alt="" onerror="this.style.opacity=.25">
      <div class="grow">
        <div class="r-title">${esc(v.title)}</div>
        <div class="r-sub"><span class="tag">${esc(catLabel)}</span> ${soon} ${esc((v.description || '').slice(0, 90))}</div>
      </div>
      <div class="r-actions">
        <label class="pill-toggle"><input type="checkbox" ${v.published ? 'checked' : ''}> zveřejněno</label>
        <button class="btn btn-sm">Upravit</button>
        <button class="btn btn-sm btn-danger">Smazat</button>
      </div>`;
    const [up, down] = row.querySelectorAll('.order-btns button');
    up.onclick = () => reorder(all, i, i - 1, 'videos');
    down.onclick = () => reorder(all, i, i + 1, 'videos');
    row.querySelector('.pill-toggle input').onchange = e =>
      guardCall(sb.from('videos').update({ published: e.target.checked }).eq('id', v.id), 'Uloženo');
    const [edit, del] = row.querySelectorAll('.r-actions .btn');
    edit.onclick = () => editVideo(v);
    del.onclick = async () => { if (confirm(`Smazat video „${v.title}"?`)) { await guardCall(sb.from('videos').delete().eq('id', v.id), 'Smazáno'); removeMedia([v.poster]); loadVideosPanel(); } };
    return row;
  }

  function editVideo(v) {
    const isNew = !v;
    v = v || { title: '', category: (CATS[0] || {}).id || '', description: '', video: '', poster: '', orientation: 'landscape', published: true };
    const opts = CATS.map(c => `<option value="${esc(c.id)}" ${c.id === v.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
    const orient = o => `<option value="${o}" ${(v.orientation || 'landscape') === o ? 'selected' : ''}>`;
    openDialog(isNew ? 'Nové video' : 'Upravit video', `
      <div class="field"><label>Název</label><input type="text" id="f-title" value="${esc(v.title)}"></div>
      <div class="field-row">
        <div class="field"><label>Kategorie</label><select id="f-cat">${opts}</select></div>
        <div class="field"><label>Zveřejněno</label><div class="checkline"><input type="checkbox" id="f-pub" ${v.published ? 'checked' : ''}> viditelné na webu</div></div>
      </div>
      <div class="field"><label>YouTube odkaz</label>
        <input type="url" id="f-video" value="${esc(v.video)}" placeholder="https://youtu.be/…">
        <span class="hint">Stačí vložit odkaz na YouTube — náhled i přehrávač se udělají samy. Prázdné = „Coming soon".</span>
        <img id="f-thumb" class="thumb-preview" src="${esc(videoThumb(v))}" alt="" onerror="this.style.display='none'" onload="this.style.display='block'">
      </div>
      <div class="field"><label>Vlastní náhled (nepovinné)</label>
        <div class="media-pick">
          <img class="preview" id="f-vposter-prev" src="${esc(v.poster || '')}" onerror="this.style.opacity=.25">
          <div class="media-actions">
            <input type="file" id="f-vposter-file" accept="image/*" style="font-size:13px">
            <span class="hint">Použije se, když ještě není video (Coming soon) nebo místo YouTube náhledu.</span>
          </div>
        </div>
      </div>
      <div class="field"><label>Orientace</label>
        <select id="f-orient">${orient('landscape')}na šířku (16:9)</option>${orient('portrait')}na výšku (reel)</option></select>
      </div>
      <div class="field"><label>Popis</label><textarea id="f-desc">${esc(v.description)}</textarea></div>
    `, async () => {
      let poster = v.poster || '';
      const pf = document.getElementById('f-vposter-file').files[0];
      if (pf) poster = await uploadImage(pf, 'videos');
      const rec = {
        title: val('f-title'),
        category: val('f-cat') || null,
        video: val('f-video'),
        poster: poster || null,
        orientation: val('f-orient') || 'landscape',
        description: val('f-desc'),
        published: checked('f-pub'),
      };
      if (!rec.title) { toast('Vyplň název', true); throw new Error('no title'); }
      if (isNew) {
        const { data: mx } = await sb.from('videos').select('sort').order('sort', { ascending: false }).limit(1);
        rec.sort = ((mx && mx[0] && mx[0].sort) || 0) + 1;
        await guardCall(sb.from('videos').insert(rec), 'Video přidáno');
      } else {
        await guardCall(sb.from('videos').update(rec).eq('id', v.id), 'Uloženo');
      }
      loadVideosPanel();
    });
    // live previews: YouTube thumbnail (robust) + uploaded poster
    setTimeout(() => {
      const vin = document.getElementById('f-video'), thumb = document.getElementById('f-thumb');
      if (vin && thumb) vin.oninput = () => {
        const id = youtubeId(vin.value);
        if (id) { thumb.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; thumb.style.display = 'block'; }
        else thumb.style.display = 'none';
      };
      const pf = document.getElementById('f-vposter-file');
      if (pf) pf.onchange = () => { if (pf.files[0]) document.getElementById('f-vposter-prev').src = URL.createObjectURL(pf.files[0]); };
    }, 0);
  }

  /* ============================================================
     POSTS (blog)
     ============================================================ */
  async function loadPostsPanel() {
    const panel = $('[data-panel="posts"]');
    panel.innerHTML = '<p class="empty-hint">Načítám…</p>';
    const { data: posts } = await sb.from('posts').select('*').order('sort');
    panel.innerHTML = '';
    const head = el('div', 'panel-head');
    head.innerHTML = `<h2>Blog</h2><span class="count">${(posts || []).length}</span><span class="spacer"></span>`;
    const addBtn = el('button', 'btn btn-primary', '+ Přidat článek');
    addBtn.onclick = () => editPost(null);
    head.appendChild(addBtn);
    panel.appendChild(head);
    const note = el('p', '', '★ První článek v pořadí = velký FEATURED snímek nahoře na blogu. Pořadí měníš šipkami ▲▼.');
    note.style.cssText = 'margin:0 0 14px;font-size:12.5px;color:var(--fg-dim,#9a9a9a)';
    panel.appendChild(note);
    const list = el('div', 'rows');
    (posts || []).forEach((p, i) => list.appendChild(postRow(p, i, posts)));
    if (!(posts || []).length) list.appendChild(el('div', 'empty-hint', 'Zatím žádné články.'));
    panel.appendChild(list);
  }
  function postRow(p, i, all) {
    const row = el('div', 'row');
    row.innerHTML = `
      <div class="order-btns"><button ${i === 0 ? 'disabled' : ''}>▲</button><button ${i === all.length - 1 ? 'disabled' : ''}>▼</button></div>
      <img class="thumb" src="${esc(p.cover || '')}" alt="" onerror="this.style.opacity=.25">
      <div class="grow">
        <div class="r-title">${esc(p.title)}</div>
        <div class="r-sub">${esc(p.date || '')} · ${esc(p.slug)}</div>
      </div>
      <div class="r-actions">
        <label class="pill-toggle"><input type="checkbox" ${p.published ? 'checked' : ''}> zveřejněno</label>
        <a class="btn btn-sm" href="/post/${encodeURI(p.slug)}/" target="_blank" rel="noopener" title="${p.published ? '' : 'Koncept uvidíš jen ty (přihlášený admin)'}">${p.published ? 'Otevřít' : 'Náhled'} ↗</a>
        <button class="btn btn-sm">Upravit</button>
        <button class="btn btn-sm btn-danger">Smazat</button>
      </div>`;
    const [up, down] = row.querySelectorAll('.order-btns button');
    up.onclick = () => reorder(all, i, i - 1, 'posts');
    down.onclick = () => reorder(all, i, i + 1, 'posts');
    row.querySelector('.pill-toggle input').onchange = e => guardCall(sb.from('posts').update({ published: e.target.checked }).eq('id', p.id), 'Uloženo');
    const [edit, del] = row.querySelectorAll('.r-actions button.btn');
    edit.onclick = () => editPost(p);
    del.onclick = async () => { if (confirm(`Smazat článek „${p.title}"?`)) { await guardCall(sb.from('posts').delete().eq('id', p.id), 'Smazáno'); removeMedia([p.cover]); loadPostsPanel(); } };
    return row;
  }
  function editPost(p) {
    const isNew = !p;
    p = p || { title: '', slug: '', cover: '', excerpt: '', body: '', date: '', read_time: '', tags: [], published: true };
    openDialog(isNew ? 'Nový článek' : 'Upravit článek', `
      <div class="field"><label>Nadpis</label><input type="text" id="f-title" value="${esc(p.title)}"></div>
      <div class="field-row">
        <div class="field"><label>URL (slug)</label><input type="text" id="f-slug" value="${esc(p.slug)}" placeholder="auto z nadpisu"></div>
        <div class="field"><label>Datum</label><input type="text" id="f-date" value="${esc(p.date)}" placeholder="11. 3. 2026"></div>
      </div>
      <div class="field"><label>Úvodní obrázek (cover)</label>
        <div class="media-pick">
          <img class="preview" id="f-cover-prev" src="${esc(p.cover || '')}" onerror="this.style.opacity=.25">
          <div class="media-actions">
            <input type="file" id="f-cover-file" accept="image/*" style="font-size:13px">
            <span class="hint">Nahraj obrázek — uloží se do úložiště.</span>
          </div>
        </div>
      </div>
      <div class="field"><label>Perex (krátký popis)</label><textarea id="f-excerpt" style="min-height:60px">${esc(p.excerpt)}</textarea></div>
      <div class="field"><label>Štítky (odděl čárkou)</label>
        <input type="text" id="f-tags" value="${esc((p.tags || []).join(', '))}" placeholder="esport, apple, recenze">
        <span class="hint">Na blogu se z nich udělají filtrovací tlačítka a pomáhají vyhledávání.</span>
      </div>
      <div class="field"><label>Obsah článku</label>
        <div class="ed-bar">
          <button type="button" data-ed="h2">Nadpis</button>
          <button type="button" data-ed="b">Tučně</button>
          <button type="button" data-ed="green">Zeleně</button>
          <button type="button" data-ed="img">+ Obrázek do textu</button>
        </div>
        <textarea id="f-body" style="min-height:220px">${esc(p.body)}</textarea>
        <input type="file" id="f-body-img" accept="image/*" hidden>
        <span class="hint">Piš normálně — odstavce se udělají samy z prázdných řádků. Označ text a klikni na tlačítko pro formát. (Kdo umí, může psát HTML přímo.)</span>
      </div>
      <div class="field-row">
        <div class="field"><label>Čas čtení</label><input type="text" id="f-read" value="${esc(p.read_time)}" placeholder="Minut čtení: 2"></div>
        <div class="field"><label>Zveřejněno</label><div class="checkline"><input type="checkbox" id="f-pub" ${p.published ? 'checked' : ''}> viditelné</div></div>
      </div>
    `, async () => {
      let cover = p.cover || '';
      const file = document.getElementById('f-cover-file').files[0];
      if (file) { cover = await uploadImage(file, 'posts'); }
      const title = val('f-title');
      if (!title) { toast('Vyplň nadpis', true); throw new Error('no title'); }
      // plain text (no HTML tags) → wrap blank-line paragraphs in <p> automatically
      let body = document.getElementById('f-body').value.trim();
      if (body && !/<[a-z][\s\S]*?>/i.test(body)) {
        body = body.split(/\n\s*\n/).map(t => `<p>${t.trim().replace(/\n/g, '<br>')}</p>`).join('\n');
      }
      const rec = {
        title, slug: await uniqueSlug('posts', val('f-slug') || title, p.slug),
        cover, excerpt: val('f-excerpt'), body,
        date: val('f-date'), read_time: val('f-read'), published: checked('f-pub'),
      };
      // tags column exists only after the 2026-07 schema update — send it only
      // when it's actually used, so saving keeps working on older databases
      const tagsRaw = val('f-tags');
      if (tagsRaw || (p.tags && p.tags.length)) {
        rec.tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      }
      if (isNew) {
        const { data: mx } = await sb.from('posts').select('sort').order('sort', { ascending: false }).limit(1);
        rec.sort = ((mx && mx[0] && mx[0].sort) || 0) + 1;
        await guardCall(sb.from('posts').insert(rec), 'Článek přidán');
      } else {
        await guardCall(sb.from('posts').update(rec).eq('id', p.id), 'Uloženo');
      }
      loadPostsPanel();
    });
    // live cover preview + editor toolbar
    setTimeout(() => {
      const f = document.getElementById('f-cover-file');
      if (f) f.onchange = () => { if (f.files[0]) document.getElementById('f-cover-prev').src = URL.createObjectURL(f.files[0]); };

      const ta = document.getElementById('f-body');
      const wrap = (before, after) => {
        const s = ta.selectionStart, e = ta.selectionEnd;
        const sel = ta.value.slice(s, e) || 'text';
        ta.setRangeText(before + sel + after, s, e, 'select');
        ta.focus();
      };
      document.querySelectorAll('.ed-bar [data-ed]').forEach(btn => btn.onclick = () => {
        const k = btn.getAttribute('data-ed');
        if (k === 'h2') wrap('\n<h2>', '</h2>\n');
        else if (k === 'b') wrap('<strong>', '</strong>');
        else if (k === 'green') wrap('<span class="green">', '</span>');
        else if (k === 'img') document.getElementById('f-body-img').click();
      });
      const bimg = document.getElementById('f-body-img');
      if (bimg) bimg.onchange = async () => {
        const file = bimg.files[0];
        if (!file) return;
        toast('Nahrávám obrázek…');
        try {
          const url = await uploadImage(file, 'posts');
          const s = ta.selectionStart;
          ta.setRangeText(`\n<img src="${url}" alt="">\n`, s, s, 'end');
          toast('Obrázek vložen do textu');
        } catch (e) { toast(e.message || 'Chyba nahrávání', true); }
        bimg.value = '';
      };
    }, 0);
  }

  /* ============================================================
     GALLERIES
     ============================================================ */
  async function loadGalleriesPanel() {
    const panel = $('[data-panel="galleries"]');
    panel.innerHTML = '<p class="empty-hint">Načítám…</p>';
    const { data: gals } = await sb.from('galleries').select('*').order('sort');
    panel.innerHTML = '';
    const head = el('div', 'panel-head');
    head.innerHTML = `<h2>Galerie</h2><span class="count">${(gals || []).length}</span><span class="spacer"></span>`;
    const addBtn = el('button', 'btn btn-primary', '+ Přidat galerii');
    addBtn.onclick = () => editGallery(null);
    head.appendChild(addBtn);
    panel.appendChild(head);
    const list = el('div', 'rows');
    (gals || []).forEach((g, i) => list.appendChild(galleryRow(g, i, gals)));
    if (!(gals || []).length) list.appendChild(el('div', 'empty-hint', 'Zatím žádné galerie.'));
    panel.appendChild(list);
  }
  function galleryRow(g, i, all) {
    const row = el('div', 'row');
    row.innerHTML = `
      <div class="order-btns"><button ${i === 0 ? 'disabled' : ''}>▲</button><button ${i === all.length - 1 ? 'disabled' : ''}>▼</button></div>
      <img class="thumb" src="${esc(g.hero || '')}" alt="" onerror="this.style.opacity=.25">
      <div class="grow">
        <div class="r-title">${esc(g.name)}</div>
        <div class="r-sub">/${esc(g.slug)}</div>
      </div>
      <div class="r-actions">
        <label class="pill-toggle"><input type="checkbox" ${g.published ? 'checked' : ''}> zveřejněno</label>
        <a class="btn btn-sm" href="/photos/${encodeURI(g.slug)}/" target="_blank" rel="noopener">Otevřít ↗</a>
        <button class="btn btn-sm">Upravit</button>
        <button class="btn btn-sm btn-danger">Smazat</button>
      </div>`;
    const [up, down] = row.querySelectorAll('.order-btns button');
    up.onclick = () => reorder(all, i, i - 1, 'galleries');
    down.onclick = () => reorder(all, i, i + 1, 'galleries');
    row.querySelector('.pill-toggle input').onchange = e => guardCall(sb.from('galleries').update({ published: e.target.checked }).eq('id', g.id), 'Uloženo');
    const [edit, del] = row.querySelectorAll('.r-actions button.btn');
    edit.onclick = () => editGallery(g);
    del.onclick = async () => {
      if (!confirm(`Smazat galerii „${g.name}" i s fotkami?`)) return;
      const { data: ims } = await sb.from('gallery_images').select('url').eq('gallery_id', g.id);
      await guardCall(sb.from('galleries').delete().eq('id', g.id), 'Smazáno');
      removeMedia([...(ims || []).map(x => x.url), g.hero]);   // uklidit soubory z úložiště
      loadGalleriesPanel();
    };
    return row;
  }
  async function editGallery(g) {
    const isNew = !g;
    g = g || { name: '', slug: '', hero: '', intro: '', published: true };
    let images = [];
    if (!isNew) { const { data } = await sb.from('gallery_images').select('*').eq('gallery_id', g.id).order('sort'); images = data || []; }
    openDialog(isNew ? 'Nová galerie' : 'Upravit galerii', `
      <div class="field-row">
        <div class="field"><label>Název</label><input type="text" id="f-name" value="${esc(g.name)}"></div>
        <div class="field"><label>URL (slug)</label><input type="text" id="f-slug" value="${esc(g.slug)}" placeholder="auto z názvu"></div>
      </div>
      <div class="field"><label>Hlavní obrázek (hero)</label>
        <div class="media-pick">
          <img class="preview" id="f-hero-prev" src="${esc(g.hero || '')}" onerror="this.style.opacity=.25">
          <div class="media-actions"><input type="file" id="f-hero-file" accept="image/*" style="font-size:13px"></div>
        </div>
      </div>
      <div class="field"><label>Úvodní text</label><textarea id="f-intro">${esc(g.intro)}</textarea></div>
      <div class="field"><label>Zveřejněno</label><div class="checkline"><input type="checkbox" id="f-pub" ${g.published ? 'checked' : ''}> viditelné</div></div>
      ${isNew ? '<p class="hint">Fotky do galerie přidáš po prvním uložení (otevři galerii znovu).</p>' :
        `<div class="field"><label>Fotky (${images.length}) — nahraj další</label>
          <input type="file" id="f-imgs-file" accept="image/*" multiple style="font-size:13px">
          <div class="imgs-grid" id="f-imgs"></div>
        </div>`}
    `, async () => {
      let hero = g.hero || '';
      const hf = document.getElementById('f-hero-file').files[0];
      if (hf) hero = await uploadImage(hf, 'galleries');
      const name = val('f-name');
      if (!name) { toast('Vyplň název', true); throw new Error('no name'); }
      const rec = { name, slug: await uniqueSlug('galleries', val('f-slug') || name, g.slug), hero, intro: val('f-intro'), published: checked('f-pub') };
      if (isNew) {
        const { data: mx } = await sb.from('galleries').select('sort').order('sort', { ascending: false }).limit(1);
        rec.sort = ((mx && mx[0] && mx[0].sort) || 0) + 1;
        await guardCall(sb.from('galleries').insert(rec), 'Galerie vytvořena');
      } else {
        await guardCall(sb.from('galleries').update(rec).eq('id', g.id), 'Uloženo');
      }
      loadGalleriesPanel();
    });

    // hero preview + image manager (existing galleries only)
    setTimeout(() => {
      const hf = document.getElementById('f-hero-file');
      if (hf) hf.onchange = () => { if (hf.files[0]) document.getElementById('f-hero-prev').src = URL.createObjectURL(hf.files[0]); };
      if (isNew) return;
      const grid = document.getElementById('f-imgs');
      const renderImgs = () => {
        grid.innerHTML = '';
        images.forEach((im, idx) => {
          const cell = el('div', 'img-cell', `<img src="${esc(im.url)}" alt="">
            <button class="x" title="Smazat">&times;</button>
            <div class="mv"><button class="l" ${idx === 0 ? 'disabled' : ''}>◀</button><button class="r" ${idx === images.length - 1 ? 'disabled' : ''}>▶</button></div>`);
          cell.querySelector('.x').onclick = async () => { await guardCall(sb.from('gallery_images').delete().eq('id', im.id), 'Fotka smazána'); removeMedia([im.url]); images.splice(idx, 1); renderImgs(); };
          cell.querySelector('.mv .l').onclick = () => swapImg(idx, idx - 1);
          cell.querySelector('.mv .r').onclick = () => swapImg(idx, idx + 1);
          grid.appendChild(cell);
        });
      };
      async function swapImg(a, b) {
        if (b < 0 || b >= images.length) return;
        const A = images[a], B = images[b];
        await Promise.all([
          sb.from('gallery_images').update({ sort: b }).eq('id', A.id),
          sb.from('gallery_images').update({ sort: a }).eq('id', B.id),
        ]);
        images[a] = B; images[b] = A; renderImgs();
      }
      renderImgs();
      const filesInput = document.getElementById('f-imgs-file');
      filesInput.onchange = async () => {
        const files = [...filesInput.files];
        if (!files.length) return;
        filesInput.disabled = true;
        let ok = 0;
        for (let i = 0; i < files.length; i++) {
          toast(`Nahrávám ${i + 1}/${files.length}…`);
          try {
            const url = await uploadImage(files[i], 'galleries');
            const sort = images.length;
            const { data } = await sb.from('gallery_images').insert({ gallery_id: g.id, url, alt: '', sort }).select();
            if (data && data[0]) { images.push(data[0]); ok++; }
            renderImgs();   // photos appear as they land, not all at the end
          } catch (e) { toast(e.message, true); }
        }
        filesInput.disabled = false;
        filesInput.value = '';
        toast(`Hotovo — nahráno ${ok} z ${files.length} fotek`);
      };
    }, 0);
  }

  /* ============================================================
     WEB (site settings — homepage videos swappable without a deploy)
     ============================================================ */
  const HOME_SLOTS = [
    { key: 'home_video_intro1', label: 'Úvodní video vlevo (první intro)' },
    { key: 'home_video_intro2', label: 'Úvodní video vpravo (druhé intro)' },
    { key: 'home_video_full', label: 'Velké video přes celou šířku' },
  ];
  async function loadWebPanel() {
    const panel = $('[data-panel="web"]');
    panel.innerHTML = '<p class="empty-hint">Načítám…</p>';
    const { data, error } = await sb.from('settings').select('*');
    if (error) {
      panel.innerHTML = '<div class="empty-hint">Tabulka nastavení zatím neexistuje.<br>Spusť v Supabase → SQL Editor aktuální <code>supabase/schema.sql</code> (je bezpečné ho pustit znovu) a obnov tuhle stránku.</div>';
      return;
    }
    const S = {};
    (data || []).forEach(r => { S[r.key] = r.value || {}; });
    panel.innerHTML = '';
    const head = el('div', 'panel-head');
    head.innerHTML = '<h2>Videa na hlavní stránce</h2><span class="spacer"></span>';
    panel.appendChild(head);
    const note = el('p', '', 'Nahraj MP4 a video na webu se vymění hned — bez programátora. Doporučení: zkomprimuj video na ~10–20 MB (1080p stačí), velké soubory žerou měsíční datový limit. „Poster" je obrázek zobrazený, než se video načte.');
    note.style.cssText = 'margin:0 0 14px;font-size:12.5px;color:var(--fg-dim)';
    panel.appendChild(note);
    const list = el('div', 'rows');
    HOME_SLOTS.forEach(slot => {
      const cur = S[slot.key] || {};
      const row = el('div', 'row');
      row.innerHTML = `
        <img class="thumb" src="${esc(cur.poster || '')}" alt="" onerror="this.style.opacity=.25">
        <div class="grow">
          <div class="r-title">${esc(slot.label)}</div>
          <div class="r-sub">${cur.src ? esc(decodeURIComponent(cur.src.split('/').pop())) : '— původní video z webu —'}</div>
        </div>
        <div class="r-actions">
          <label class="btn btn-sm">Nahrát MP4<input type="file" accept="video/mp4" hidden></label>
          <label class="btn btn-sm">Poster<input type="file" accept="image/*" hidden></label>
          ${cur.src ? '<button class="btn btn-sm btn-danger">Vrátit původní</button>' : ''}
        </div>`;
      const [vidIn, imgIn] = row.querySelectorAll('input[type=file]');
      vidIn.onchange = async () => {
        const f = vidIn.files[0];
        if (!f) return;
        if (f.size > 49 * 1024 * 1024) { toast('Video je moc velké (limit ~50 MB) — zkomprimuj ho', true); vidIn.value = ''; return; }
        toast('Nahrávám video… může to chvíli trvat');
        try {
          const url = await uploadFile(f, 'home');
          if (cur.src) removeMedia([cur.src]);   // předchozí nahrané video už není potřeba
          await guardCall(sb.from('settings').upsert({ key: slot.key, value: { ...cur, src: url } }), 'Video vyměněno — je hned živě');
          loadWebPanel();
        } catch (e) { toast(e.message, true); }
      };
      imgIn.onchange = async () => {
        const f = imgIn.files[0];
        if (!f) return;
        toast('Nahrávám poster…');
        try {
          const url = await uploadImage(f, 'home');
          if (cur.poster) removeMedia([cur.poster]);
          await guardCall(sb.from('settings').upsert({ key: slot.key, value: { ...cur, poster: url } }), 'Poster uložen');
          loadWebPanel();
        } catch (e) { toast(e.message, true); }
      };
      const resetBtn = row.querySelector('.btn-danger');
      if (resetBtn) resetBtn.onclick = async () => {
        if (!confirm('Vrátit původní video z webu?')) return;
        await guardCall(sb.from('settings').delete().eq('key', slot.key), 'Vráceno původní video');
        removeMedia([cur.src, cur.poster]);
        loadWebPanel();
      };
      list.appendChild(row);
    });
    panel.appendChild(list);
  }

  /* ---------- shared reorder ---------- */
  async function reorder(all, from, to, table) {
    if (to < 0 || to >= all.length) return;
    const A = all[from], B = all[to];
    await Promise.all([
      sb.from(table).update({ sort: B.sort }).eq('id', A.id),
      sb.from(table).update({ sort: A.sort }).eq('id', B.id),
    ]);
    if (table === 'videos') loadVideosPanel();
    else if (table === 'posts') loadPostsPanel();
    else loadGalleriesPanel();
  }

  /* ============================================================
     TABS + AUTH
     ============================================================ */
  const loaders = { videos: loadVideosPanel, posts: loadPostsPanel, galleries: loadGalleriesPanel, web: loadWebPanel };
  document.querySelectorAll('.adm-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.adm-tab').forEach(t => t.classList.toggle('active', t === tab));
      const name = tab.dataset.tab;
      document.querySelectorAll('.adm-panel').forEach(p => p.hidden = p.dataset.panel !== name);
      loaders[name]();
    };
  });

  function showApp(session) {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#adm-email').textContent = session.user.email;
    loadVideosPanel();
  }
  function showLogin(msg) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    if (msg) { const n = $('#login-note'); n.textContent = msg; }
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-err'); err.hidden = true;
    const btn = $('#login-btn'); const old = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: val('login-email'), password: $('#login-pass').value });
      if (error) throw error;
      showApp(data.session);
    } catch (e2) {
      err.textContent = 'Přihlášení selhalo: ' + (e2.message || '');
      err.hidden = false;
    } finally { btn.textContent = old; btn.disabled = false; }
  });

  $('#logout-btn').onclick = async () => { await sb.auth.signOut(); showLogin(); };

  /* ---------- boot ---------- */
  (async function init() {
    if (!sb) {
      showLogin('');
      $('#login-note').innerHTML = '⚠ Supabase zatím není nastavený. Doplň klíče v <code>assets/js/config.js</code>.';
      $('#login-btn').disabled = true;
      return;
    }
    const { data } = await sb.auth.getSession();
    if (data.session) showApp(data.session);
    else showLogin();
  })();
})();
