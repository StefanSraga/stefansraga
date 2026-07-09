# stefansraga.com — statická replika (bez Wixu)

Kompletní statický přepis webu www.stefansraga.com. Žádný Wix, žádný build systém,
žádné externí závislosti (jediné externí prvky jsou YouTube embedy na stránce Videos).

## Struktura

```
index.html                  domovská stránka
photos/ videos/ marketing/  hlavní sekce
about-me/ blogs/            o mně, výpis blogu
events/ cars/ urbex/        fotogalerie
football/ icehockey/
comicconprague/
rallypraguerevival/
post/<slug>/                10 blogových článků (původní URL slugy)
privacy-policy/             právní stránky
accessibility-statement/
blog/  blank/               přesměrování (aliasy starých Wix URL)
assets/data/videos.json     ⭐ obsah stránky Videos (upravitelný klientem/backendem)
assets/
  css/style.css             design systém (tmavé téma, zelená #18C118)
  css/fonts.css             lokální fonty (Anton, Barlow)
  js/main.js                menu, particles, typewriter, marquee, lightbox…
  img/                      178 obrázků (plné rozlišení z Wix CDN)
  video/                    11 MP4 videí
  fonts/                    woff2 soubory
```

## Správa videí (stránka Videos)

Stránka **Videos** se vykresluje za běhu z jednoho datového souboru
[`assets/data/videos.json`](assets/data/videos.json). Klient (nebo budoucí backend/CMS)
upravuje jen tento soubor — po uložení a obnovení stránky se změny projeví,
**není potřeba nic přegenerovávat.**

Struktura každého videa — nejjednodušší je **vložit YouTube odkaz**, náhled i přehrávač
se pak udělají samy:

```json
{
  "id": "moje-video",
  "title": "Název videa",
  "category": "esport",          // id z pole "categories" (esport|sport|promo|product)
  "date": "2026",
  "description": "Krátký popis…",
  "video": "https://youtu.be/YOUTUBE_ID"   // ← stačí vložit YouTube odkaz
}
```

Pole `video` může být:
- **YouTube odkaz** (`https://youtu.be/…` nebo `https://www.youtube.com/watch?v=…`) —
  náhled i přehrávač automaticky, nic dalšího netřeba;
- **cesta k vlastnímu MP4** (`"assets/video/soubor.mp4"`) + `"poster": "…"`
  (a `"orientation": "portrait"` u videí na výšku);
- **prázdné** (`""`) → karta zobrazí „Coming soon".

- **Přidat video:** zkopíruj jeden blok, změň `title`, `category`, `description`
  a vlož YouTube odkaz do `video`. Hotovo.
- **Přidat kategorii:** přidej `{ "id": "...", "label": "..." }` do `categories`.
- **Napojení na backend:** až vznikne API, stačí aby vracelo stejný JSON tvar
  (nebo změnit `data-feed` na Videos stránce na URL API).

> Pozn.: protože se JSON načítá přes `fetch()`, stránka Videos vyžaduje spuštění
> přes webový server (viz níže), ne otevření souboru přes `file://`.

## Spuštění lokálně

Stačí jakýkoli statický server, např.:

```
npx http-server -p 8321 .
```

a otevřít http://localhost:8321/. (Otevření `index.html` napřímo v prohlížeči
funguje taky — odkazy jsou relativní.)

## Nasazení

Celou složku nahraj na libovolný statický hosting (Netlify, Cloudflare Pages,
GitHub Pages, vlastní nginx/Apache). Nic se nekompiluje.

- URL struktura je 1:1 s původním webem (včetně diakritiky ve slugách článků),
  takže staré odkazy a SEO zůstávají funkční.
- `blog/` a `blank/` jsou meta-refresh přesměrování; na vlastním serveru je
  můžeš nahradit 301 redirecty.

## Poznámky

- Fonty: originál používá komerční fonty licencované přes Wix (Helvetica W01,
  DIN Next W01). Ty nelze legálně zkopírovat, proto jsou nahrazeny volnými
  ekvivalenty: **Anton** (nadpisy — používal se už v původních widgetech)
  a **Barlow** (text, vizuálně velmi blízký DIN Next). Courier New je systémový.
- Videa v `assets/video/` jsou v nejvyšší kvalitě, kterou Wix CDN nabízel
  (hero video má ~50 MB — případně jde zmenšit přes ffmpeg).
- Formulář/komentáře u blogu Wix řešil na serveru — statická verze je nemá.
- Počty zobrazení u článků jsou statické snapshoty z doby migrace.
