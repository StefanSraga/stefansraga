# Nasazení webu + backend (GitHub → Vercel → Supabase)

Tenhle web je **statický** (čisté HTML/CSS/JS, žádný build). Obsah — videa, blog,
fotogalerie — žije v **Supabase** (databáze + přihlášení + úložiště fotek) a web ho
čte živě za běhu. Klient spravuje úplně vše přes stránku **`/admin`**.

Dvě dobré zprávy:
1. **Web můžeš nasadit hned**, i bez backendu — dokud nedoplníš klíče, běží ze
   statického obsahu a nic se nerozbije. Backend zapneš, až budeš chtít.
2. **Provoz vyjde prakticky na 0 Kč** (detailní rozpočet je [dole](#5-kolik-to-stojí)).

Postup má 4 části: **A)** web na GitHub, **B)** nasazení na Vercel, **C)** zapnutí
Supabase backendu, **D)** jak to klient spravuje. Projdi je popořadě.

---

## A) Nahrát web na GitHub

Potřebuješ účet na <https://github.com> a nainstalovaný `git`.

1. Na GitHubu vytvoř nový **prázdný** repozitář (tlačítko **New**, bez README,
   bez .gitignore) — třeba `stefansraga-web`. Zkopíruj si jeho URL.
2. V počítači otevři složku `C:\Users\12dej\Desktop\sraga` v terminálu a spusť:

   ```bash
   git init
   git add .
   git commit -m "Web Štefan Šraga"
   git branch -M main
   git remote add origin https://github.com/<tvuj-ucet>/stefansraga-web.git
   git push -u origin main
   ```

> `.gitignore` je nastavený správně — nenahrává `node_modules`, `.claude` ani logy,
> ale **nahrává** `assets/`, `supabase/` i `config.js` (ty tam patří). Anon klíč
> Supabase je bezpečné mít v repu (viz níže), **service_role klíč tam ale nikdy nedávej**.

## B) Nasadit na Vercel

1. Na <https://vercel.com> se přihlas GitHub účtem → **Add New → Project** →
   vyber repozitář `stefansraga-web` → **Import**.
2. Na import obrazovce nech **výchozí hodnoty**:
   - Framework Preset: **Other**
   - Build Command: **prázdné**
   - Output Directory: **prázdné**
   - Install Command: **prázdné**
   - Environment Variables: **žádné**
3. Klikni **Deploy**. Za ~1 minutu je web živě na adrese `…vercel.app`.

`vercel.json` už řeší hezké URL (bez `.html`), dynamické články i galerie a
`noindex` na `/admin`. **Vlastní doménu** (`stefansraga.com`) přidáš ve Vercelu v
**Settings → Domains** — je to zdarma, certifikát (HTTPS) Vercel vystaví sám.

> Po každém `git push` se web sám znovu nasadí. Statický obsah (home, about,
> marketing) se mění právě takhle — úpravou kódu a pushnutím. Videa/fotky/blog se
> ale mění **v adminu bez pushování** (viz část D).

---

## C) Zapnout backend (Supabase)

### C1. Založit projekt
Na <https://supabase.com> → **New project**. Zvol název a **heslo k databázi**
(ulož si ho). Počkej ~2 minuty, než naběhne.

### C2. Vytvořit databázi a nahrát obsah
V Supabase → **SQL Editor → New query**:

1. Otevři [`supabase/schema.sql`](supabase/schema.sql), zkopíruj **celý** obsah,
   vlož a klikni **Run**. Vytvoří tabulky, zabezpečení (RLS) i úložiště na fotky.
2. Stejně spusť [`supabase/seed.sql`](supabase/seed.sql) — nahraje všechna
   **současná** videa, články a galerie, ať web nezačíná prázdný.

### C3. Vytvořit přihlášení pro admina
V Supabase → **Authentication → Users → Add user** → zadej e-mail a heslo
(zaškrtni **Auto Confirm User**). Tímhle účtem se budeš přihlašovat na `/admin`.

### C4. 🔒 Povolit tomuto adminovi zápis (POVINNÉ)
Zabezpečení je nastavené tak, že měnit obsah smí **jen e-maily na seznamu adminů** —
ne kdokoli přihlášený. Do **SQL Editoru** proto vlož e-mail z předchozího kroku:

```sql
insert into public.admin_emails (email) values ('sem-tvuj-admin@email.cz');
```

Bez tohohle kroku se sice přihlásíš, ale nic neuložíš (a je to tak správně).

### C5. 🔒 Vypnout veřejnou registraci (POVINNÉ)
V Supabase → **Authentication → Sign In / Providers → Email** → vypni
**„Allow new users to sign up"**. Účty tak zakládáš jen ty ručně; nikdo cizí se
nezaregistruje. (Dohromady s krokem C4 je to dvojitá pojistka.)

### C6. Doplnit klíče do webu
V Supabase → **Project Settings → API** zkopíruj **Project URL** a **anon public**
klíč a vlož je do [`assets/js/config.js`](assets/js/config.js):

```js
window.SUPABASE_CONFIG = {
  url: 'https://abcd.supabase.co',
  anonKey: 'eyJhbGci...'   // anon public klíč (NE service_role!)
};
```

Pak změnu pushni: `git add assets/js/config.js && git commit -m "Supabase klíče" && git push`.
Vercel se sám nasadí a od té chvíle web čte obsah živě ze Supabase.

> **Proč je anon klíč bezpečné mít v kódu:** je „public" — díky RLS pravidlům
> (`schema.sql`) přes něj jde jen **číst zveřejněný** obsah. Zapisovat může jen
> přihlášený admin ze seznamu. Tajný `service_role` klíč do webu ani do Gitu nikdy nedávej.

---

## D) Co teď klient zvládne sám v `/admin`

Přihlaš se na `…/admin` e-mailem a heslem z kroku C3. Vše se projeví **hned**, bez
pushování a bez vývojáře:

- **🎬 Videa** — „+ Přidat video": stačí **vložit YouTube odkaz**, vybrat kategorii
  a hotovo (náhled i přehrávač se udělají samy). Můžeš přidat i vlastní náhledový
  obrázek, zvolit orientaci (na šířku / reel na výšku), řadit, skrýt/zveřejnit a
  spravovat kategorie.
- **📝 Blog** — psát/upravovat články (nadpis, cover, text/HTML, datum), řadit,
  zveřejnit. Funguje i pro **úplně nové** články — dostanou automaticky vlastní URL.
- **📷 Galerie** — vytvořit **novou** galerii i upravit stávající: název, hero, úvod,
  nahrát/mazat/přeřadit fotky. **Nová galerie se sama objeví** na stránce Photos a má
  vlastní funkční adresu `…/photos/<název>/`.
- U článků i galerií je v řádku tlačítko **„Otevřít ↗"**, kterým si hned zkontroluješ,
  jak položka vypadá na živém webu.

Skrytím (přepínač „zveřejněno") položka zmizí z webu; smazáním se odstraní i s fotkami.

Ručně v kódu (a pushnutím) se mění jen věci, co se skoro nemění: home, About,
Marketing, právní stránky a kontakt v patičce.

---

## 5) Kolik to stojí

Krátká odpověď: **prakticky zdarma.** Rozpočet (ceny ověřené v polovině roku 2026):

| Vrstva | Free tier | Reálná cena/měsíc | Kdy začne stát |
|---|---|---|---|
| **Vercel** (hosting) | Sedí s velkou rezervou | **0 Kč** | viz pozn. 1 níže |
| **Supabase** (DB + fotky + login) | Sedí s velkou rezervou | **0 Kč** | >500 MB DB / >1 GB fotek / >5 GB stažených dat / měsíc |
| **Doména** stefansraga.com | Napojení na Vercel zdarma | **0 Kč** hosting | (jen roční obnova u registrátora ~300 Kč/rok) |
| **Keep-alive** (viz pozn. 2) | GitHub Actions zdarma | **0 Kč** | — |

**Pozn. 1 — Vercel a „komerční use":** Vercel Hobby (free) je zdarma a náš web se do
jeho limitů (100 GB přenosu/měsíc atd.) pohodlně vejde. Háček je čistě právní: Hobby
je dle podmínek „jen pro nekomerční osobní použití", a profesionální portfolio, které
propaguje služby fotografa, do toho striktně spadá jako komerční → dle litery podmínek
patří na **Vercel Pro ($20/měsíc)**. V praxi malá portfolia běží na free bez problémů;
je to šedá zóna, ne technický limit. Alternativa zdarma bez téhle nejasnosti:
**Cloudflare Pages** nebo **Netlify** (obojí umí totéž pro statický web).

**Pozn. 2 — Supabase se po 7 dnech nečinnosti „uspí":** free projekt se po týdnu bez
aktivity pozastaví a první další načtení pak čeká ~60 s na probuzení. Vyřešíš to tím,
že do DB občas „šťouchneš". Nejčistší je **GitHub Actions cron** (na free GitHubu
zdarma), který pár× týdně pošle `select 1`. Alternativa: <https://cron-job.org> nebo
UptimeRobot. Jakákoli aktivita 7denní časovač resetuje.

**Dvě poctivá čísla:**
- **Pragmaticky (jako osobní projekt):** **0 Kč/měsíc** (jen držet Supabase „při životě").
- **Plně dle podmínek pro komerční portfolio:** **~$20/měsíc** (Vercel Pro), Supabase
  dál zdarma. Nebo **0 Kč** i tak, když hosting dáš na Cloudflare Pages / Netlify.

---

## 6) Provozní / technické poznámky

- **Přenos dat (bandwidth):** homepage má ~100 MB vlastních videí. Vercel Hobby dává
  100 GB/měsíc, takže cca ~1000 plných návštěv domů měsíčně. Kód to už zmírňuje
  (`preload="none"` + přehrání až při odscrollování — kdo web hned opustí, videa
  nestáhne). **Kdyby návštěvnost rostla**, přesuň ta velká videa z homepage na YouTube
  nebo do Supabase Storage (kód umí i plné `https://` URL) — tím přenos z Vercelu
  skoro zmizí a repo se zmenší.
- **Bez rebuildu:** veřejné stránky čtou obsah ze Supabase za běhu (`assets/js/cms.js`
  + hydrátory `videos.js`, `blog.js`, `postpage.js`, `gallery.js`, `photoshub.js`).
  Statické HTML slouží jako fallback a pro SEO/Google.
- **Dynamické URL:** nové články jedou přes šablonu `/post/view/` a nové galerie přes
  `/photos/view/`; přepisy jsou ve `vercel.json` (`/post/:slug`, `/photos/:slug`).
  Díky tomu mají hezkou adresu bez pushování.
- **Zabezpečení:** vše přes Row-Level-Security (`supabase/schema.sql`) + seznam adminů
  `admin_emails` a funkci `is_admin()`. Anon jen čte `published`; zapisovat a vidět
  skryté smí jen admin ze seznamu. Ve frontendu žádné tajné klíče.
- **Fotky** z adminu jdou do Supabase Storage (bucket `media`, veřejné čtení). Původní
  obrázky v `assets/img/` fungují dál.
- **Rozšiřování:** další funkce (formuláře, e-maily) přidáš jako Supabase Edge Functions
  nebo Vercel serverless `/api/*` — datová vrstva je připravená.
