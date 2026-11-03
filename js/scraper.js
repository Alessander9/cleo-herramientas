/**
 * Cleo Herramientas - Extractor de Imágenes de Sitios Web
 * ---------------------------------------------------------------------------
 * Recorre las páginas de un sitio (mismo dominio), localiza todas sus
 * imágenes (<img>, srcset, <picture>, lazy-load, fondos CSS, og:image,
 * íconos, enlaces a imágenes y URLs incrustadas en scripts/JSON) y permite
 * descargarlas una a una, en ZIP o enviarlas al compresor de fotos.
 *
 * Los navegadores no permiten leer el HTML de otros dominios (CORS), así que
 * las peticiones pasan por un proxy: primero el propio (`/api/proxy`, función
 * serverless de Vercel) y, si no existe (GitHub Pages, servidor local…), por
 * proxies CORS públicos como respaldo.
 *
 * Seguridad: todo el contenido extraído se inserta con textContent/atributos,
 * nunca como HTML, y los documentos se analizan con DOMParser (inerte: no
 * ejecuta scripts ni carga recursos).
 */

(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    const els = {
      hero: $('scraperHero'),
      form: $('scraperForm'),
      input: $('scraperUrlInput'),
      btnStart: $('btnScrapeStart'),
      maxPages: $('scraperMaxPages'),
      useSitemap: $('scraperUseSitemap'),
      includeCss: $('scraperIncludeCss'),
      hideSmall: $('scraperHideSmall'),
      dedupe: $('scraperDedupe'),
      error: $('scraperError'),
      progress: $('scraperProgress'),
      spinner: $('scraperSpinner'),
      statusText: $('scraperStatusText'),
      progressFill: $('scraperProgressFill'),
      pagesDone: $('scraperPagesDone'),
      imagesFound: $('scraperImagesFound'),
      currentUrl: $('scraperCurrentUrl'),
      btnCancel: $('btnScrapeCancel'),
      countText: $('scraperCountText'),
      btnSend: $('btnScraperSendToCompressor'),
      btnDownloadSelected: $('btnScraperDownloadSelected'),
      selectedLabel: $('scraperSelectedLabel'),
      btnDownloadAll: $('btnScraperDownloadAll'),
      btnClear: $('btnScraperClear'),
      selectAll: $('scraperSelectAll'),
      typeFilters: $('scraperTypeFilters'),
      sort: $('scraperSort'),
      search: $('scraperSearch'),
      grid: $('scraperGrid'),
      empty: $('scraperEmpty'),
      emptyTitle: $('scraperEmptyTitle'),
      emptyText: $('scraperEmptyText'),
      zipProgress: $('scraperZipProgress'),
      zipText: $('scraperZipText'),
      zipPercent: $('scraperZipPercent'),
      zipFill: $('scraperZipFill'),
      previewModal: $('scraperPreviewModal'),
      previewImg: $('scraperPreviewImg'),
      previewName: $('scraperPreviewName'),
      previewMeta: $('scraperPreviewMeta'),
      previewOpen: $('scraperPreviewOpen'),
      btnPreviewDownload: $('btnScraperPreviewDownload'),
      btnPreviewClose: $('btnScraperPreviewClose'),
      previewContext: $('scraperPreviewContext'),
      tab: $('tabScraper'),
      // Nuevos elementos para texto, contexto y estructura
      extractText: $('scraperExtractText'),
      resultsTitle: $('scraperResultsTitle'),
      btnViewGrid: $('btnScraperViewGrid'),
      btnViewText: $('btnScraperViewText'),
      pagesBadge: $('scraperPagesBadge'),
      btnExportJson: $('btnScraperExportJson'),
      btnExportMd: $('btnScraperExportMd'),
      imagesToolbar: $('scraperImagesToolbar'),
      textToolbar: $('scraperTextToolbar'),
      pageSelect: $('scraperPageSelect'),
      textStatsPill: $('scraperTextStatsPill'),
      textSearch: $('scraperTextSearch'),
      textView: $('scraperTextView'),
      prioritizeShop: $('scraperPrioritizeShop'),
      pathFilter: $('scraperPathFilter'),
      // Nuevos controles de Redes Sociales, Pegar URLs y Bookmarklet
      engineSelect: $('scraperEngineSelect'),
      btnOpenPasteModal: $('btnOpenPasteModal'),
      btnOpenBookmarkletModal: $('btnOpenBookmarkletModal'),
      pasteUrlsModal: $('pasteUrlsModal'),
      btnPasteUrlsClose: $('btnPasteUrlsClose'),
      btnPasteUrlsCancel: $('btnPasteUrlsCancel'),
      btnPasteUrlsSubmit: $('btnPasteUrlsSubmit'),
      pasteUrlsTextarea: $('pasteUrlsTextarea'),
      pasteUrlsCount: $('pasteUrlsCount'),
      bookmarkletModal: $('bookmarkletModal'),
      btnBookmarkletClose: $('btnBookmarkletClose'),
      btnBookmarkletDismiss: $('btnBookmarkletDismiss'),
      cleoBookmarkletLink: $('cleoBookmarkletLink')
    };

    if (!els.hero || !els.form) return;

    /* ------------------------------------------------------------------ *
     * Constantes
     * ------------------------------------------------------------------ */

    const IMAGE_EXTS = ['jpg', 'jpeg', 'jfif', 'png', 'apng', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tif', 'tiff'];
    const IMAGE_EXT_RE = /\.(jpe?g|jfif|png|apng|gif|webp|avif|svg|bmp|ico|tiff?)(?:$|[?#])/i;
    const SKIP_PAGE_EXT_RE = /\.(pdf|zip|rar|7z|gz|tgz|tar|mp4|m4v|mov|webm|mkv|avi|mp3|wav|ogg|flac|m4a|docx?|xlsx?|pptx?|odt|csv|exe|msi|dmg|apk|css|js|mjs|json|rss|atom|txt|woff2?|ttf|otf|eot|jpe?g|jfif|png|apng|gif|webp|avif|svg|bmp|ico|tiff?)$/i;
    const FONT_RE = /\.(woff2?|ttf|otf|eot)(?:$|[?#])/i;
    const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-full', 'data-full-src', 'data-large', 'data-hi-res', 'data-zoom-image', 'data-image'];
    const BG_ATTRS = ['data-bg', 'data-background', 'data-background-image', 'data-bg-src', 'data-bg-image'];
    const TYPE_ORDER = ['all', 'jpg', 'png', 'webp', 'gif', 'svg', 'avif', 'ico', 'other'];
    const TYPE_LABELS = { all: 'Todas', jpg: 'JPG', png: 'PNG', webp: 'WebP', gif: 'GIF', svg: 'SVG', avif: 'AVIF', ico: 'ICO', other: 'Otros' };
    const RASTER_TYPES = ['jpg', 'png', 'webp', 'gif', 'avif'];
    const MIME_EXT = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/apng': 'png',
      'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
      'image/bmp': 'bmp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/tiff': 'tiff'
    };
    const EXT_MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff' };

    const SMALL_PX = 64;
    const PAGE_CONCURRENCY = 3;
    const DOWNLOAD_CONCURRENCY = 6;
    const MAX_STYLESHEETS = 25;
    const MAX_IMAGES = 3000;
    const FETCH_TIMEOUT = 20000;

    /* ------------------------------------------------------------------ *
     * Estado
     * ------------------------------------------------------------------ */

    const state = {
      items: [],
      byKey: new Map(),
      byCanonical: new Map(),
      cards: new Map(),
      filterType: 'all',
      search: '',
      sort: 'found',
      scan: null,
      busy: false,
      lastSite: '',
      hasScanned: false,
      previewItem: null,
      // Páginas completas con metadatos y contenido estructurado
      pagesData: [],
      activeView: 'grid',
      selectedPageIndex: 0,
      textSearch: ''
    };
    let orderCounter = 0;

    /* ------------------------------------------------------------------ *
     * Red: proxies CORS
     * ------------------------------------------------------------------ */

    const OWN_PROXY = /^https?:$/.test(location.protocol) ? new URL('api/proxy', location.href).href : null;

    const proxies = [
      OWN_PROXY && {
        id: 'cleo',
        build: (u) => `${OWN_PROXY}?url=${encodeURIComponent(u)}`,
        // Evita confundir la página 404 del hosting con una respuesta del proxy.
        verify: (res) => res.headers.get('X-Cleo-Proxy') === '1',
        authoritative: true
      },
      { id: 'corsproxy', build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
      { id: 'allorigins', build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
      { id: 'codetabs', build: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` }
    ].filter(Boolean).map((p, i) => Object.assign(p, { disabled: false, fails: 0, rank: i }));

    const corsBlockedHosts = new Set();

    class HttpError extends Error {
      constructor(status) {
        super(`HTTP ${status}`);
        this.status = status;
      }
    }

    function abortError() {
      const err = new Error('Cancelado');
      err.name = 'AbortError';
      return err;
    }

    function orderedProxies() {
      return proxies
        .filter((p) => !p.disabled)
        .sort((a, b) => (a.fails - b.fails) || (a.rank - b.rank));
    }

    async function fetchWithTimeout(url, { signal, timeout = FETCH_TIMEOUT, ...opts } = {}) {
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      if (signal) {
        if (signal.aborted) throw abortError();
        signal.addEventListener('abort', onAbort, { once: true });
      }
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    }

    /**
     * Descarga `url` a través del primer proxy que funcione.
     * Devuelve { res, finalUrl } (finalUrl tiene en cuenta redirecciones si el
     * proxy lo informa).
     */
    async function proxiedFetch(url, { signal, accept } = {}) {
      let lastErr = null;
      for (const p of orderedProxies()) {
        if (signal && signal.aborted) throw abortError();
        try {
          const res = await fetchWithTimeout(p.build(url), { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (p.verify && !p.verify(res)) {
            p.disabled = true;
            continue;
          }
          if (!res.ok) {
            // Solo el error 404 (no encontrado) es definitivo desde el proxy propio;
            // ante 403 u otros se permite intentar con los demás proxies de respaldo.
            if (p.authoritative && res.status === 404) {
              throw new HttpError(res.status);
            }
            lastErr = new HttpError(res.status);
            p.fails++;
            continue;
          }
          if (accept && !accept(res)) {
            lastErr = new Error('Respuesta inesperada del proxy');
            p.fails++;
            continue;
          }
          if (p.fails > 0) p.fails--;
          return { res, finalUrl: res.headers.get('X-Final-Url') || url };
        } catch (err) {
          if (err instanceof HttpError) throw err;
          if (signal && signal.aborted) throw abortError();
          lastErr = err;
          p.fails++;
        }
      }
      throw lastErr || new Error('No se pudo acceder al recurso');
    }

    function isImageBlob(blob, ext) {
      if (!blob || !blob.size) return false;
      const type = (blob.type || '').toLowerCase();
      if (type.startsWith('image/')) return true;
      if (/html/.test(type)) return false;
      // Algunos servidores sirven imágenes como octet-stream o SVG como XML.
      return !!ext && (type === '' || /octet-stream|xml|text\/plain/.test(type));
    }

    async function fetchImageBlob(item, signal) {
      let host = '';
      try { host = new URL(item.url).host; } catch (e) { /* noop */ }

      // 1) Directo: rápido si el servidor permite CORS (muchos CDN lo hacen).
      if (host && !corsBlockedHosts.has(host)) {
        try {
          const res = await fetchWithTimeout(item.url, { signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', timeout: 15000 });
          if (res.ok) {
            const blob = await res.blob();
            if (isImageBlob(blob, item.ext)) return blob;
          }
        } catch (err) {
          if (signal && signal.aborted) throw err;
          corsBlockedHosts.add(host);
        }
      }

      // 2) A través de proxy.
      const { res } = await proxiedFetch(item.url, {
        signal,
        accept: (r) => !/text\/html/i.test(r.headers.get('content-type') || '')
      });
      const blob = await res.blob();
      if (!isImageBlob(blob, item.ext)) throw new Error('El recurso no es una imagen');
      return blob;
    }

    function thumbFallbackUrl(url) {
      const p = orderedProxies()[0];
      return p ? p.build(url) : url;
    }

    /* ------------------------------------------------------------------ *
     * Utilidades de URL
     * ------------------------------------------------------------------ */

    function normalizeInputUrl(raw) {
      let v = (raw || '').trim();
      if (!v) return null;
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) return null;
        if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
        u.hash = '';
        return u.href;
      } catch (e) {
        return null;
      }
    }

    function siteKey(hostname) {
      return String(hostname || '').toLowerCase().replace(/^www\./, '');
    }

    function shortUrl(href, max = 70) {
      try {
        const u = new URL(href);
        const s = u.host + (u.pathname === '/' ? '' : u.pathname) + u.search;
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
      } catch (e) {
        return href;
      }
    }

    function safeDecode(s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    }

    function detectExt(u) {
      const m = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
      let ext = m ? m[1].toLowerCase() : '';
      if (!IMAGE_EXTS.includes(ext)) {
        ext = '';
        for (const [k, v] of u.searchParams) {
          const val = String(v).toLowerCase();
          if (/^(fm|format|ext|type|output|f)$/i.test(k) && IMAGE_EXTS.includes(val)) { ext = val; break; }
          const inner = val.match(/\.(jpe?g|png|gif|webp|avif|svg)(?:$|[?#&])/i);
          if (inner) { ext = inner[1].toLowerCase(); break; }
        }
      }
      if (ext === 'jpeg' || ext === 'jfif') ext = 'jpg';
      if (ext === 'apng') ext = 'png';
      if (ext === 'tif') ext = 'tiff';
      return ext;
    }

    function typeFromExt(ext) {
      return ['jpg', 'png', 'webp', 'gif', 'svg', 'avif', 'ico'].includes(ext) ? ext : 'other';
    }

    function fileNameFromUrl(u) {
      let seg = safeDecode(u.pathname.split('/').filter(Boolean).pop() || '');
      seg = seg.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();
      if (seg.length > 120) seg = seg.slice(-120);
      return seg || `${siteKey(u.hostname)}-imagen`;
    }

    /** Desenvuelve optimizadores tipo Next.js (/_next/image?url=…) a la imagen original. */
    function unwrapOptimizer(u) {
      if (/\/_next\/image\/?$/.test(u.pathname) || /\/_vercel\/image\/?$/.test(u.pathname)) {
        const inner = u.searchParams.get('url');
        if (inner) {
          try { return new URL(inner, u.origin); } catch (e) { /* noop */ }
        }
      }
      return u;
    }

    /**
     * Calcula la clave canónica de una imagen ignorando parámetros de reescalado
     * y sufijos de tamaño autogenerados (como -300x300 en WordPress o _300x en Shopify).
     */
    function canonicalImageInfo(u) {
      const cleanUrl = new URL(u.href);
      const resizeParams = ['w', 'h', 'width', 'height', 'resize', 'crop', 'v', 'ver', 'version', 'quality', 'q'];
      resizeParams.forEach((p) => cleanUrl.searchParams.delete(p));

      let pathname = cleanUrl.pathname;
      let score = Infinity;

      // WordPress / WooCommerce: -1024x768.ext o -300x300.ext
      const wpMatch = pathname.match(/^(.*?)-(\d{2,4})x(\d{2,4})(\.[a-z0-9]+)$/i);
      if (wpMatch) {
        const w = parseInt(wpMatch[2], 10);
        const h = parseInt(wpMatch[3], 10);
        score = w * h;
        pathname = wpMatch[1] + wpMatch[4];
      } else {
        // Shopify: _1024x1024.ext o _300x.ext
        const shopifyMatch = pathname.match(/^(.*?)_(\d{2,4})x(\d{0,4})(\.[a-z0-9]+)$/i);
        if (shopifyMatch) {
          const w = parseInt(shopifyMatch[2], 10);
          const h = parseInt(shopifyMatch[3] || shopifyMatch[2], 10);
          score = w * h;
          pathname = shopifyMatch[1] + shopifyMatch[4];
        }
      }

      cleanUrl.pathname = pathname;
      return {
        canonicalKey: (cleanUrl.origin + cleanUrl.pathname).toLowerCase(),
        score
      };
    }

    /* ------------------------------------------------------------------ *
     * Registro de imágenes
     * ------------------------------------------------------------------ */

    function addImage(raw, base, via, pageUrl, alt, contextInfo = null) {
      if (!raw) return;
      const value = String(raw).trim().replace(/&amp;/g, '&');
      if (!value || /^(data|blob|javascript|about):/i.test(value) || value.startsWith('#')) return;

      let u;
      try { u = new URL(value, base); } catch (e) { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      u.hash = '';
      u = unwrapOptimizer(u);

      const key = u.href;
      const existing = state.byKey.get(key);
      if (existing) {
        if (pageUrl) existing.pages.add(pageUrl);
        if (!existing.alt && alt) existing.alt = alt;
        if (!existing.context && contextInfo) existing.context = contextInfo;
        return;
      }

      const dedupeEnabled = els.dedupe ? els.dedupe.checked : true;
      const { canonicalKey, score } = canonicalImageInfo(u);

      if (dedupeEnabled) {
        const existingCanonical = state.byCanonical.get(canonicalKey);
        if (existingCanonical) {
          if (pageUrl) existingCanonical.item.pages.add(pageUrl);
          if (!existingCanonical.item.alt && alt) existingCanonical.item.alt = alt;
          if (!existingCanonical.item.context && contextInfo) existingCanonical.item.context = contextInfo;

          // Si la nueva versión tiene mayor resolución (score más alto) o es la original (Infinity),
          // actualizamos la URL del ítem existente para conservar la mejor calidad sin duplicar.
          if (score > existingCanonical.score) {
            const oldKey = existingCanonical.item.url;
            state.byKey.delete(oldKey);

            existingCanonical.item.url = key;
            existingCanonical.item.name = fileNameFromUrl(u);
            existingCanonical.item.ext = detectExt(u);
            existingCanonical.item.type = typeFromExt(existingCanonical.item.ext);
            existingCanonical.score = score;
            state.byKey.set(key, existingCanonical.item);

            const card = state.cards.get(existingCanonical.item.id);
            if (card) {
              const img = card.querySelector('img');
              if (img) img.src = existingCanonical.item.thumbFallback ? thumbFallbackUrl(key) : key;
              const nameEl = card.querySelector('.scr-card-name');
              if (nameEl) {
                nameEl.textContent = existingCanonical.item.name;
                nameEl.title = key;
              }
            }
          }
          return;
        }
      }

      if (state.items.length >= MAX_IMAGES) {
        if (state.scan) state.scan.limitReached = true;
        return;
      }

      const ext = detectExt(u);
      const item = {
        id: 'scr_' + (++orderCounter),
        order: orderCounter,
        url: key,
        ext,
        type: typeFromExt(ext),
        name: fileNameFromUrl(u),
        alt: alt ? String(alt).slice(0, 160) : '',
        via,
        pages: new Set(pageUrl ? [pageUrl] : []),
        context: contextInfo || null,
        width: 0,
        height: 0,
        loaded: false,
        broken: false,
        thumbFallback: false,
        selected: false
      };
      state.items.push(item);
      state.byKey.set(key, item);
      state.byCanonical.set(canonicalKey, { item, score });
      if (state.scan) els.imagesFound.textContent = String(state.items.length);
      scheduleRender();
    }

    function bestFromSrcset(value) {
      if (!value) return null;
      let best = null;
      let bestScore = -1;
      value.split(/,\s+|,(?=[a-z]+:\/\/|\/)/i).forEach((part) => {
        const [url, descriptor] = part.trim().split(/\s+/);
        if (!url || /^data:/i.test(url)) return;
        let score = 1;
        if (descriptor) {
          const n = parseFloat(descriptor);
          if (!isNaN(n)) score = /w$/i.test(descriptor) ? n : n * 1000;
        }
        if (score > bestScore) {
          bestScore = score;
          best = url;
        }
      });
      return best;
    }

    const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi;

    function extractCssUrls(cssText, baseUrl, pageUrl, via, requireExt) {
      if (!cssText || cssText.indexOf('url(') === -1) return;
      CSS_URL_RE.lastIndex = 0;
      let m;
      while ((m = CSS_URL_RE.exec(cssText))) {
        const raw = m[2].trim();
        if (!raw || /^data:/i.test(raw) || raw.startsWith('#') || FONT_RE.test(raw)) continue;
        if (requireExt && !IMAGE_EXT_RE.test(raw)) continue;
        addImage(raw, baseUrl, via, pageUrl);
      }
    }

    const ABS_IMG_RE = /https?:\/\/[^\s"'<>()\\,]+?\.(?:jpe?g|jfif|png|gif|webp|avif|svg|bmp)(?:\?[^\s"'<>()\\]*)?(?=[\s"'<>()\\,]|$)/gi;
    const REL_IMG_RE = /["'](\/[^"'\s<>()\\]+?\.(?:jpe?g|jfif|png|gif|webp|avif|svg))(?:\?[^"'\s<>\\]*)?["']/gi;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function extractPageStructureAndContext(doc, base, pageUrl, pageMeta) {
      const IGNORE_SELECTORS = 'script, style, noscript, svg, nav, footer, header, form, iframe, [aria-hidden="true"], .nav, .menu, .sidebar, #sidebar, .cookie-banner, .footer, .header';
      const container = doc.querySelector('main, article, [role="main"], #content, .content, .post, .entry-content, .article') || doc.body;
      if (!container) return { blocks: [], contextMap: new Map() };

      const blocks = [];
      const contextMap = new Map();
      let currentSection = pageMeta.title || '';
      let lastTextSnippet = '';

      function isIgnored(el) {
        return !!el.closest(IGNORE_SELECTORS);
      }

      // Detección de Ficha de Producto E-commerce (WooCommerce, Shopify, Schema.org)
      let productInfo = null;
      if (pageMeta.jsonLd && pageMeta.jsonLd.length) {
        for (const item of pageMeta.jsonLd) {
          const list = item['@graph'] || (Array.isArray(item) ? item : [item]);
          const prod = list.find(g => g && g['@type'] === 'Product');
          if (prod) {
            const offers = Array.isArray(prod.offers) ? prod.offers[0] : (prod.offers || {});
            const priceVal = offers.price || (offers.priceSpecification ? (offers.priceSpecification.price || offers.priceSpecification[0]?.price) : '');
            const curr = offers.priceCurrency || 'PEN';
            const avail = (offers.availability || '').includes('InStock') ? 'En stock' : ((offers.availability || '').includes('OutOfStock') ? 'Agotado' : '');
            productInfo = {
              name: prod.name || pageMeta.title,
              price: priceVal ? `${curr} ${priceVal}` : '',
              sku: prod.sku || '',
              availability: avail,
              description: (prod.description || '').replace(/\s+/g, ' ').trim(),
              brand: prod.brand ? (prod.brand.name || prod.brand) : ''
            };
            break;
          }
        }
      }

      if (!productInfo && (doc.querySelector('.product, .woocommerce, [itemtype*="schema.org/Product"]') || /\/producto\//i.test(pageUrl))) {
        const titleEl = doc.querySelector('.product_title, h1.product-title, h1.entry-title');
        const priceEl = doc.querySelector('.price, .woocommerce-Price-amount');
        const stockEl = doc.querySelector('.stock, .in-stock, .out-of-stock');
        const skuEl = doc.querySelector('.sku');
        const shortDescEl = doc.querySelector('.woocommerce-product-details__short-description, .product-short-description');

        if (titleEl || priceEl) {
          productInfo = {
            name: (titleEl ? titleEl.textContent : pageMeta.title).trim(),
            price: priceEl ? priceEl.textContent.replace(/\s+/g, ' ').trim() : '',
            sku: skuEl ? skuEl.textContent.trim() : '',
            availability: stockEl ? stockEl.textContent.trim() : '',
            description: shortDescEl ? shortDescEl.textContent.replace(/\s+/g, ' ').trim() : pageMeta.description
          };
        }
      }

      if (productInfo) {
        pageMeta.isProduct = true;
        pageMeta.product = productInfo;
        blocks.push({
          type: 'product',
          data: productInfo
        });
      }

      const candidates = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, table, figure, img');
      const seenElements = new Set();

      candidates.forEach((el) => {
        if (isIgnored(el) || seenElements.has(el)) return;
        const tag = el.tagName.toLowerCase();

        // Encabezados
        if (/^h[1-6]$/.test(tag)) {
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) {
            currentSection = text;
            blocks.push({
              type: tag,
              level: parseInt(tag[1], 10),
              text
            });
          }
          return;
        }

        // Párrafos
        if (tag === 'p') {
          if (el.closest('figure, blockquote')) return;
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (text && text.length > 5) {
            lastTextSnippet = text.slice(0, 180);
            blocks.push({
              type: 'p',
              text
            });
          }
          return;
        }

        // Citas
        if (tag === 'blockquote') {
          seenElements.add(el);
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) {
            blocks.push({
              type: 'quote',
              text
            });
          }
          return;
        }

        // Listas
        if (tag === 'ul' || tag === 'ol') {
          if (el.closest('ul, ol')) return;
          seenElements.add(el);
          const items = Array.from(el.querySelectorAll(':scope > li'))
            .map(li => (li.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          if (items.length) {
            blocks.push({
              type: 'list',
              ordered: tag === 'ol',
              items: items.slice(0, 30)
            });
          }
          return;
        }

        // Tablas
        if (tag === 'table') {
          seenElements.add(el);
          const headers = Array.from(el.querySelectorAll('th')).map(th => (th.textContent || '').trim());
          const rows = [];
          el.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim());
            if (cells.length && cells.some(c => c)) rows.push(cells);
          });
          if (headers.length || rows.length) {
            blocks.push({
              type: 'table',
              headers: headers.slice(0, 10),
              rows: rows.slice(0, 25).map(r => r.slice(0, 10))
            });
          }
          return;
        }

        // Figuras e Imágenes
        if (tag === 'figure' || tag === 'img') {
          const img = tag === 'img' ? el : el.querySelector('img');
          if (!img) return;
          seenElements.add(img);
          if (tag === 'figure') seenElements.add(el);

          const figcaption = el.closest('figure')?.querySelector('figcaption') || (tag === 'figure' ? el.querySelector('figcaption') : null);
          const captionText = figcaption ? (figcaption.textContent || '').replace(/\s+/g, ' ').trim() : '';
          const alt = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
          const rawSrc = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
          if (!rawSrc) return;

          let imgUrl = '';
          try { imgUrl = new URL(rawSrc, base).href; } catch (e) { return; }

          const ctxInfo = {
            section: currentSection,
            caption: captionText,
            snippet: lastTextSnippet,
            pageTitle: pageMeta.title,
            pageUrl: pageUrl,
            alt: alt
          };

          contextMap.set(imgUrl, ctxInfo);

          blocks.push({
            type: 'image',
            url: imgUrl,
            alt: alt,
            caption: captionText,
            section: currentSection,
            snippet: lastTextSnippet
          });
        }
      });

      return { blocks, contextMap };
    }

    /** Analiza un documento HTML y devuelve los enlaces internos y hojas de estilo. */
    function extractFromHtml(html, pageUrl, scan) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let base = pageUrl;
      const baseEl = doc.querySelector('base[href]');
      if (baseEl) {
        try { base = new URL(baseEl.getAttribute('href'), pageUrl).href; } catch (e) { /* noop */ }
      }

      // 1. Extraer metadatos de la página
      const pageMeta = {
        url: pageUrl,
        title: (doc.querySelector('title')?.textContent || doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').replace(/\s+/g, ' ').trim(),
        description: (doc.querySelector('meta[name="description"]')?.getAttribute('content') || doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '').replace(/\s+/g, ' ').trim(),
        author: (doc.querySelector('meta[name="author"]')?.getAttribute('content') || doc.querySelector('[rel="author"]')?.textContent || doc.querySelector('.author, .byline')?.textContent || '').replace(/\s+/g, ' ').trim(),
        date: (doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || doc.querySelector('time')?.getAttribute('datetime') || doc.querySelector('time')?.textContent || '').replace(/\s+/g, ' ').trim(),
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || pageUrl,
        lang: doc.documentElement.getAttribute('lang') || '',
        jsonLd: []
      };

      doc.querySelectorAll('script[type="application/ld+json"]').forEach((st) => {
        try {
          const parsed = JSON.parse(st.textContent);
          if (parsed) pageMeta.jsonLd.push(parsed);
        } catch (e) { /* noop */ }
      });

      // 2. Extraer estructura cronológica, texto y contexto de imágenes
      let contextMap = new Map();
      const shouldExtractText = els.extractText ? els.extractText.checked : true;
      if (shouldExtractText) {
        const extracted = extractPageStructureAndContext(doc, base, pageUrl, pageMeta);
        contextMap = extracted.contextMap;
        state.pagesData.push({
          url: pageUrl,
          title: pageMeta.title,
          description: pageMeta.description,
          author: pageMeta.author,
          date: pageMeta.date,
          canonical: pageMeta.canonical,
          lang: pageMeta.lang,
          jsonLd: pageMeta.jsonLd,
          blocks: extracted.blocks,
          textBlocksCount: extracted.blocks.filter(b => b.type !== 'image').length,
          imagesCount: extracted.blocks.filter(b => b.type === 'image').length
        });

        // Actualizar contexto en imágenes ya guardadas
        contextMap.forEach((ctx, urlKey) => {
          const it = state.byKey.get(urlKey);
          if (it && !it.context) it.context = ctx;
        });

        if (els.pagesBadge) {
          els.pagesBadge.textContent = String(state.pagesData.length);
          els.pagesBadge.style.display = state.pagesData.length ? 'inline-block' : 'none';
        }
      }

      const add = (raw, via, alt) => {
        let fullUrl = '';
        try { fullUrl = new URL(raw, base).href; } catch (e) { /* noop */ }
        const ctx = fullUrl ? contextMap.get(fullUrl) : null;
        addImage(raw, base, via, pageUrl, alt, ctx);
      };

      // <img> con srcset / lazy-load
      doc.querySelectorAll('img').forEach((img) => {
        const alt = img.getAttribute('alt') || img.getAttribute('title') || '';
        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
        const best = bestFromSrcset(srcset);
        const lazy = LAZY_ATTRS.map((a) => img.getAttribute(a)).find((v) => v && !/^data:/i.test(v));
        const src = img.getAttribute('src');
        if (best) add(best, 'img', alt);
        if (lazy) add(lazy, 'img', alt);
        if (!best && !lazy && src) add(src, 'img', alt);
      });

      // <picture><source srcset>
      doc.querySelectorAll('source[srcset], source[data-srcset]').forEach((s) => {
        add(bestFromSrcset(s.getAttribute('srcset') || s.getAttribute('data-srcset')), 'img');
      });

      // Fondos en atributos style / data-bg
      doc.querySelectorAll('[style*="url("]').forEach((el) => {
        extractCssUrls(el.getAttribute('style'), base, pageUrl, 'css', false);
      });
      doc.querySelectorAll(BG_ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) => {
        BG_ATTRS.forEach((a) => {
          const v = el.getAttribute(a);
          if (!v) return;
          if (v.includes('url(')) extractCssUrls(v, base, pageUrl, 'css', false);
          else add(v, 'css');
        });
      });
      doc.querySelectorAll('style').forEach((st) => {
        extractCssUrls(st.textContent, base, pageUrl, 'css', true);
      });

      // Redes sociales / metadatos
      doc.querySelectorAll([
        'meta[property="og:image"]', 'meta[property="og:image:url"]', 'meta[property="og:image:secure_url"]',
        'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'meta[property="twitter:image"]',
        'meta[itemprop="image"]', 'meta[name="msapplication-TileImage"]'
      ].join(',')).forEach((m) => add(m.getAttribute('content'), 'meta'));

      // Íconos y precargas
      doc.querySelectorAll('link[href]').forEach((l) => {
        const rel = (l.getAttribute('rel') || '').toLowerCase();
        if (/\b(icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)\b/.test(rel)) add(l.getAttribute('href'), 'icon');
        else if (rel === 'image_src') add(l.getAttribute('href'), 'meta');
        else if (rel === 'preload' && (l.getAttribute('as') || '').toLowerCase() === 'image') {
          add(bestFromSrcset(l.getAttribute('imagesrcset')) || l.getAttribute('href'), 'img');
        }
      });

      // Otros elementos
      doc.querySelectorAll('video[poster]').forEach((v) => add(v.getAttribute('poster'), 'img'));
      doc.querySelectorAll('input[type="image"][src]').forEach((i) => add(i.getAttribute('src'), 'img'));
      doc.querySelectorAll('image').forEach((i) => add(i.getAttribute('href') || i.getAttribute('xlink:href'), 'img'));
      doc.querySelectorAll('object[data], embed[src]').forEach((o) => {
        const v = o.getAttribute('data') || o.getAttribute('src');
        if (v && IMAGE_EXT_RE.test(v)) add(v, 'img');
      });

      // Enlaces que apuntan directamente a imágenes (galerías, lightbox…)
      const links = [];
      doc.querySelectorAll('a[href], area[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href) return;
        if (IMAGE_EXT_RE.test(href)) {
          add(href, 'link', a.getAttribute('title') || '');
          return;
        }
        try { links.push(new URL(href, base).href); } catch (e) { /* noop */ }
      });

      // URLs incrustadas en scripts / JSON (sitios hechos con React, Next, Vue…)
      const raw = html.replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
      let m;
      ABS_IMG_RE.lastIndex = 0;
      while ((m = ABS_IMG_RE.exec(raw))) add(m[0], 'script');
      REL_IMG_RE.lastIndex = 0;
      while ((m = REL_IMG_RE.exec(raw))) add(m[1], 'script');

      // Hojas de estilo externas
      const stylesheets = [];
      if (scan.includeCss) {
        doc.querySelectorAll('link[href]').forEach((l) => {
          const rel = (l.getAttribute('rel') || '').toLowerCase();
          const as = (l.getAttribute('as') || '').toLowerCase();
          if (/\bstylesheet\b/.test(rel) || (rel === 'preload' && as === 'style')) {
            try { stylesheets.push(new URL(l.getAttribute('href'), base).href); } catch (e) { /* noop */ }
          }
        });
      }

      return { links, stylesheets };
    }

    /* ------------------------------------------------------------------ *
     * Rastreo del sitio
     * ------------------------------------------------------------------ */

    const IGNORE_URL_PATTERNS = /\/(carrito|cart|checkout|finalizar-compra|mi-cuenta|my-account|login|acceder|registro|register|wp-login\.php|xmlrpc\.php|feed|wp-json|wp-admin|cdn-cgi)(\/|$|\?)/i;
    const SHOP_URL_PATTERNS = /\/(producto|product|item|tienda|shop|catalogo|catalog|categoria-producto|product-category)(\/|$|\?)/i;

    function enqueuePage(scan, href, isHighPriority = false) {
      let u;
      try { u = new URL(href); } catch (e) { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      if (siteKey(u.hostname) !== scan.siteKey) return;
      if (SKIP_PAGE_EXT_RE.test(u.pathname)) return;
      u.hash = '';
      [...u.searchParams.keys()].forEach((k) => {
        if (/^(utm_|fbclid|gclid|mc_|_ga|ref$|replytocom|add-to-cart)/i.test(k)) u.searchParams.delete(k);
      });
      if (u.search.length > 120) return; // evita trampas de calendarios / filtros infinitos

      // Si priorizar tienda está activo, ignorar carritos, checkouts y logins
      if (scan.prioritizeShop && IGNORE_URL_PATTERNS.test(u.pathname + u.search)) {
        return;
      }

      // Filtro de ruta personalizado si el usuario lo especificó (ej: /tienda/, /producto/)
      if (scan.pathTokens && scan.pathTokens.length > 0) {
        const pathLower = (u.pathname + u.search).toLowerCase();
        const matchesToken = scan.pathTokens.some(token => pathLower.includes(token));
        if (!matchesToken && u.href !== scan.startUrl && u.pathname !== '/') {
          return;
        }
      }

      const key = siteKey(u.hostname) + u.pathname.replace(/\/+$/, '') + u.search;
      if (scan.seen.has(key)) return;
      if (scan.seen.size >= scan.maxPages * 8) return;
      scan.seen.add(key);

      const isShop = isHighPriority || SHOP_URL_PATTERNS.test(u.pathname);
      if (scan.prioritizeShop && isShop) {
        scan.shopQueue.push(u.href);
      } else {
        scan.queue.push(u.href);
      }
    }


    async function processStylesheet(scan, cssUrl, pageUrl) {
      if (scan.cssSeen.has(cssUrl) || scan.cssSeen.size >= MAX_STYLESHEETS) return;
      scan.cssSeen.add(cssUrl);
      try {
        const { res, finalUrl } = await proxiedFetch(cssUrl, { signal: scan.ctrl.signal });
        const css = await res.text();
        if (/^\s*</.test(css)) return; // página de error HTML
        extractCssUrls(css, finalUrl, pageUrl, 'css', true);
        const imports = [];
        css.replace(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/gi, (_, href) => {
          try { imports.push(new URL(href, finalUrl).href); } catch (e) { /* noop */ }
          return _;
        });
        await Promise.all(imports.map((href) => processStylesheet(scan, href, pageUrl)));
      } catch (e) {
        /* hoja de estilo inaccesible: se ignora */
      }
    }

    async function processPage(scan, url, isStart) {
      const signal = scan.ctrl.signal;
      els.currentUrl.textContent = shortUrl(url);
      els.currentUrl.title = url;
      try {
        const { res, finalUrl } = await proxiedFetch(url, { signal });
        if (signal.aborted) return;
        const ct = (res.headers.get('content-type') || '').toLowerCase();

        if (isStart) {
          // Si el inicio redirige (p. ej. a www. u otro dominio), seguimos ese sitio.
          try { scan.siteKey = siteKey(new URL(finalUrl).hostname); } catch (e) { /* noop */ }
        }

        if (ct.startsWith('image/')) {
          addImage(finalUrl, finalUrl, 'img', url);
          scan.pagesOk++;
          return;
        }
        if (ct && !/html|xml|text\/plain/.test(ct)) return;

        const html = await res.text();
        if (signal.aborted) return;
        const { links, stylesheets } = extractFromHtml(html, finalUrl, scan);
        scan.pagesOk++;

        if (scan.maxPages > 1) links.forEach((href) => enqueuePage(scan, href));
        if (stylesheets.length) {
          await Promise.all(stylesheets.map((css) => processStylesheet(scan, css, finalUrl)));
        }
      } catch (err) {
        if (signal.aborted) return;
        scan.failures++;
        if (isStart) scan.startError = err;
      }
    }

    async function discoverSitemaps(scan) {
      scan.pendingDiscovery++;
      const signal = scan.ctrl.signal;
      try {
        const origin = new URL(scan.startUrl).origin;
        const candidates = [];
        try {
          const { res } = await proxiedFetch(origin + '/robots.txt', { signal });
          const txt = await res.text();
          txt.replace(/^\s*sitemap:\s*(\S+)/gim, (_, u) => {
            candidates.push(u);
            return _;
          });
        } catch (e) { /* sin robots.txt */ }
        if (!candidates.length) candidates.push(origin + '/sitemap.xml', origin + '/sitemap_index.xml');

        const seenMaps = new Set();
        let budget = 16;
        while (candidates.length && budget > 0 && !signal.aborted) {
          if (scan.seen.size >= scan.maxPages * 8) break;
          const sm = candidates.shift();
          if (seenMaps.has(sm)) continue;
          seenMaps.add(sm);
          budget--;
          try {
            const { res } = await proxiedFetch(sm, { signal });
            const xml = await res.text();
            if (!/<(urlset|sitemapindex)[\s>]/i.test(xml)) continue;
            const doc = new DOMParser().parseFromString(xml, 'application/xml');
            Array.from(doc.getElementsByTagName('sitemap')).forEach((n) => {
              const loc = n.getElementsByTagName('loc')[0];
              if (loc && loc.textContent) {
                const sUrl = loc.textContent.trim();
                if (scan.prioritizeShop && /product|producto|shop|tienda/i.test(sUrl)) {
                  candidates.unshift(sUrl);
                } else {
                  candidates.push(sUrl);
                }
              }
            });
            Array.from(doc.getElementsByTagName('url')).forEach((n) => {
              const loc = n.getElementsByTagName('loc')[0];
              if (loc && loc.textContent) {
                const locUrl = loc.textContent.trim();
                const isProd = /producto|product/i.test(locUrl);
                enqueuePage(scan, locUrl, isProd);
              }
              // Sitemaps de imágenes (image:loc)
              Array.from(n.getElementsByTagName('image:loc')).forEach((il) => {
                addImage(il.textContent, sm, 'sitemap', loc ? loc.textContent.trim() : sm);
              });
            });
            if (scan.pump) scan.pump();
          } catch (e) { /* sitemap inaccesible */ }
        }
      } finally {
        scan.pendingDiscovery--;
        if (scan.pump) scan.pump();
      }
    }

    function updateScanProgress(scan) {
      const total = Math.max(1, Math.min(scan.maxPages, scan.seen.size));
      const pct = Math.min(100, Math.round((scan.processed / total) * 100));
      els.progressFill.style.width = pct + '%';
      els.pagesDone.textContent = String(scan.pagesOk);
      els.imagesFound.textContent = String(state.items.length);
      els.statusText.textContent = `Escaneando página ${Math.min(scan.processed + 1, total)} de ${total}…`;
    }

    async function startSocialScan(startUrl, scan) {
      els.statusText.textContent = 'Conectando con motor de Redes Sociales (gallery-dl)...';
      els.pagesDone.textContent = '1';
      els.progressFill.style.width = '30%';

      try {
        const streamUrl = `/api/social-extract?url=${encodeURIComponent(startUrl)}&stream=1`;
        const res = await fetch(streamUrl, { signal: scan.ctrl.signal });
        if (!res.ok) {
          throw new Error(`Error en el servidor (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.type === 'image' && data.url) {
                  let hostname = 'red social';
                  try { hostname = new URL(startUrl).hostname; } catch (e) {}
                  addImage(data.url, data.url, 'social', startUrl, 'Foto de ' + hostname);
                  els.imagesFound.textContent = String(state.items.length);
                  els.statusText.textContent = `Descubriendo fotos en alta calidad... (${state.items.length} encontradas)`;
                  scheduleRender();
                } else if (data.type === 'error') {
                  showError(`Aviso: ${data.error}`);
                }
              } catch (e) { /* ignore parse */ }
            }
          }
        }
        scan.pagesOk = 1;
      } catch (err) {
        if (!scan.ctrl.signal.aborted) {
          showError(`Extracción de redes: ${err.message}. Puedes usar también el botón "📋 Pegar URLs" o "⭐ Marcador para Redes".`);
        }
      } finally {
        finishScan(scan);
      }
    }

    async function startBrowserScan(startUrl, scan) {
      els.statusText.textContent = 'Iniciando navegador headless (Puppeteer con scroll automático)...';
      els.pagesDone.textContent = '1';
      els.progressFill.style.width = '30%';

      try {
        const streamUrl = `/api/browser-extract?url=${encodeURIComponent(startUrl)}&stream=1&scrolls=12`;
        const res = await fetch(streamUrl, { signal: scan.ctrl.signal });
        if (!res.ok) {
          throw new Error(`Error en el servidor (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.type === 'image' && data.url) {
                  addImage(data.url, data.url, 'browser', startUrl, 'Foto renderizada');
                  els.imagesFound.textContent = String(state.items.length);
                  els.statusText.textContent = `Renderizando y haciendo scroll... (${state.items.length} encontradas)`;
                  scheduleRender();
                } else if (data.type === 'error') {
                  showError(`Aviso: ${data.error}`);
                }
              } catch (e) { /* ignore parse */ }
            }
          }
        }
        scan.pagesOk = 1;
      } catch (err) {
        if (!scan.ctrl.signal.aborted) {
          showError(`Error en el navegador headless: ${err.message}`);
        }
      } finally {
        finishScan(scan);
      }
    }

    async function startGoogleMapsScan(startUrl, scan) {
      els.statusText.textContent = 'Conectando con Google Maps y abriendo galería de fotos...';
      els.pagesDone.textContent = '1';
      els.progressFill.style.width = '25%';

      try {
        const streamUrl = `/api/maps-extract?url=${encodeURIComponent(startUrl)}&stream=1&scrolls=35`;
        const res = await fetch(streamUrl, { signal: scan.ctrl.signal });
        if (!res.ok) {
          throw new Error(`Error en el servidor (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.type === 'image' && data.url) {
                  addImage(data.url, data.url, 'maps', startUrl, 'Foto de Google Maps');
                  els.imagesFound.textContent = String(state.items.length);
                  els.statusText.textContent = `Descubriendo fotos de la ubicación en alta calidad... (${state.items.length} encontradas)`;
                  scheduleRender();
                } else if (data.type === 'error') {
                  showError(`Aviso Google Maps: ${data.error}`);
                }
              } catch (e) { /* ignore parse */ }
            }
          }
        }
        scan.pagesOk = 1;
      } catch (err) {
        if (!scan.ctrl.signal.aborted) {
          showError(`Google Maps: ${err.message}. Puedes usar también el botón "⭐ Marcador para Redes" o "📋 Pegar URLs".`);
        }
      } finally {
        finishScan(scan);
      }
    }

    async function startScan() {
      if (state.scan) return;
      const startUrl = normalizeInputUrl(els.input.value);
      if (!startUrl) {
        showError('Escribe un enlace válido, por ejemplo: https://ejemplo.com');
        els.input.focus();
        return;
      }
      els.input.value = startUrl;
      hideError();
      clearResults();

      const maxPages = parseInt(els.maxPages.value, 10) || 1;
      const prioritizeShop = els.prioritizeShop ? els.prioritizeShop.checked : true;
      const pathFilterRaw = els.pathFilter ? els.pathFilter.value.trim() : '';
      const pathTokens = pathFilterRaw ? pathFilterRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];

      const scan = {
        startUrl,
        siteKey: siteKey(new URL(startUrl).hostname),
        maxPages,
        prioritizeShop,
        pathTokens,
        includeCss: els.includeCss.checked,
        ctrl: new AbortController(),
        shopQueue: [],
        queue: [],
        seen: new Set(),
        cssSeen: new Set(),
        started: 0,
        processed: 0,
        pagesOk: 0,
        failures: 0,
        pendingDiscovery: 0,
        startError: null,
        limitReached: false,
        pump: null
      };
      state.scan = scan;
      state.hasScanned = true;
      state.lastSite = scan.siteKey;

      setScanningUI(true);
      els.statusText.textContent = 'Conectando con el sitio…';
      els.progressFill.style.width = '0%';
      els.pagesDone.textContent = '0';
      els.imagesFound.textContent = '0';

      const engine = els.engineSelect ? els.engineSelect.value : 'auto';
      let isSocial = false;
      let isMaps = false;
      try {
        const host = new URL(startUrl).hostname;
        isSocial = /facebook\.com|fb\.watch|instagram\.com|threads\.net|tiktok\.com|pinterest\.com|twitter\.com|x\.com|reddit\.com/i.test(host);
        isMaps = /google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(startUrl);
      } catch (e) {}

      if (engine === 'maps' || (engine === 'auto' && isMaps)) {
        await startGoogleMapsScan(startUrl, scan);
        return;
      }

      if (engine === 'social' || (engine === 'auto' && isSocial)) {
        await startSocialScan(startUrl, scan);
        return;
      }

      if (engine === 'browser') {
        await startBrowserScan(startUrl, scan);
        return;
      }

      enqueuePage(scan, startUrl);
      if (!scan.shopQueue.length && !scan.queue.length) scan.queue.push(startUrl);
      const firstUrl = scan.shopQueue[0] || scan.queue[0];

      if (els.useSitemap.checked && maxPages > 1) discoverSitemaps(scan);

      await new Promise((resolve) => {
        let active = 0;
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        const pump = () => {
          if (done) return;
          if (scan.ctrl.signal.aborted) {
            if (active === 0) finish();
            return;
          }
          // La primera página va sola, para conocer el dominio final antes de seguir.
          const limit = scan.processed === 0 ? 1 : PAGE_CONCURRENCY;
          while (active < limit && (scan.shopQueue.length || scan.queue.length) && scan.started < scan.maxPages) {
            let url;
            if (scan.started === 0) {
              if (scan.queue.includes(firstUrl)) {
                scan.queue.splice(scan.queue.indexOf(firstUrl), 1);
                url = firstUrl;
              } else if (scan.shopQueue.includes(firstUrl)) {
                scan.shopQueue.splice(scan.shopQueue.indexOf(firstUrl), 1);
                url = firstUrl;
              } else {
                url = firstUrl;
              }
            } else {
              url = scan.shopQueue.length ? scan.shopQueue.shift() : scan.queue.shift();
            }
            const isStart = url === firstUrl && scan.started === 0;
            scan.started++;
            active++;
            processPage(scan, url, isStart).finally(() => {
              active--;
              scan.processed++;
              updateScanProgress(scan);
              pump();
            });
          }
          const exhausted = (!scan.shopQueue.length && !scan.queue.length) || scan.started >= scan.maxPages;
          if (active === 0 && exhausted && scan.pendingDiscovery === 0) finish();
        };
        scan.pump = pump;
        pump();
      });

      finishScan(scan);
    }

    function finishScan(scan) {
      const canceled = scan.ctrl.signal.aborted;
      state.scan = null;
      setScanningUI(false);
      els.progressFill.style.width = '100%';
      els.pagesDone.textContent = String(scan.pagesOk);
      els.imagesFound.textContent = String(state.items.length);
      els.currentUrl.textContent = '';

      const n = state.items.length;
      if (scan.startError && n === 0) {
        const status = scan.startError.status;
        let msg = 'No se pudo acceder al sitio. Comprueba el enlace; algunos sitios bloquean el acceso automatizado.';
        if (status === 404) msg = 'La página no existe (error 404). Revisa el enlace.';
        else if (status === 403 || status === 401) msg = 'El sitio ha denegado el acceso (error ' + status + '). Es posible que bloquee herramientas automáticas.';
        showError(msg);
        els.statusText.textContent = 'No se pudo escanear el sitio';
      } else {
        const pagesTxt = `${scan.pagesOk} ${scan.pagesOk === 1 ? 'página' : 'páginas'}`;
        const imgsTxt = `${n} ${n === 1 ? 'imagen' : 'imágenes'}`;
        els.statusText.textContent = canceled
          ? `Escaneo detenido: ${imgsTxt} en ${pagesTxt}`
          : `Escaneo completado: ${imgsTxt} en ${pagesTxt}`;
        if (scan.limitReached) {
          els.statusText.textContent += ` (límite de ${MAX_IMAGES} alcanzado)`;
        }
      }
      if (els.pagesBadge) {
        els.pagesBadge.textContent = String(state.pagesData.length);
        els.pagesBadge.style.display = state.pagesData.length ? 'inline-block' : 'none';
      }
      updatePageSelect();
      if (state.activeView === 'text') renderTextView();
      scheduleRender(true);
    }

    function cancelScan() {
      if (state.scan) {
        state.scan.ctrl.abort();
        els.statusText.textContent = 'Deteniendo…';
      }
    }

    /* ------------------------------------------------------------------ *
     * Interfaz
     * ------------------------------------------------------------------ */

    function showError(msg) {
      els.error.textContent = msg;
      els.error.hidden = false;
    }

    function hideError() {
      els.error.hidden = true;
      els.error.textContent = '';
    }

    function setScanningUI(on) {
      els.progress.hidden = false;
      els.spinner.hidden = !on;
      els.btnCancel.hidden = !on;
      els.btnStart.disabled = on;
      els.input.disabled = on;
      els.maxPages.disabled = on;
      els.useSitemap.disabled = on;
      els.includeCss.disabled = on;
      els.btnStart.querySelector('span').textContent = on ? 'Escaneando…' : 'Escanear sitio';
      els.hero.classList.toggle('is-scanning', on);
      updateButtons();
    }

    let toastTimer = null;
    function toast(msg, tone, actionEl) {
      let el = document.getElementById('scraperToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'scraperToast';
        el.className = 'scr-toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
      }
      el.innerHTML = '';
      const textSpan = document.createElement('span');
      textSpan.textContent = msg;
      el.appendChild(textSpan);
      if (actionEl) {
        el.appendChild(actionEl);
      }
      el.className = `scr-toast is-visible${tone ? ` is-${tone}` : ''}`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('is-visible'), actionEl ? 12000 : 3600);
    }

    function isSmall(item) {
      if (item.via === 'icon' || item.type === 'ico') return true;
      return item.loaded && item.width > 0 && item.height > 0 && Math.max(item.width, item.height) < SMALL_PX;
    }

    function passesBaseFilters(item) {
      if (els.hideSmall.checked && isSmall(item)) return false;
      if (state.search) {
        const hay = (item.name + ' ' + item.url + ' ' + item.alt).toLowerCase();
        if (!hay.includes(state.search)) return false;
      }
      return true;
    }

    function visibleItems() {
      const list = state.items.filter((i) => passesBaseFilters(i) && (state.filterType === 'all' || i.type === state.filterType));
      if (state.sort === 'largest') {
        list.sort((a, b) => (b.width * b.height) - (a.width * a.height) || a.order - b.order);
      } else if (state.sort === 'name') {
        list.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
      }
      return list;
    }

    const CARD_TEMPLATE = `
      <label class="scr-card-chk" title="Seleccionar"><input type="checkbox" class="cleo-chk"></label>
      <span class="scr-type-badge"></span>
      <button type="button" class="scr-thumb" data-act="preview" title="Ver en grande">
        <img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="">
        <span class="scr-thumb-fallback">Sin vista previa</span>
      </button>
      <div class="scr-card-body">
        <div class="scr-card-name"></div>
        <div class="scr-card-meta"><span class="scr-dims">—</span><span class="scr-via"></span></div>
        <div class="scr-card-actions">
          <button type="button" class="btn-icon-action" data-act="download" title="Descargar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button type="button" class="btn-icon-action" data-act="open" title="Abrir en una pestaña nueva">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button type="button" class="btn-icon-action" data-act="copy" title="Copiar enlace de la imagen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      </div>`;

    const VIA_LABELS = { img: 'Imagen', css: 'Fondo CSS', meta: 'Redes', icon: 'Ícono', link: 'Enlace', script: 'Script', sitemap: 'Sitemap' };

    function updateCardDims(item, card) {
      const dims = card.querySelector('.scr-dims');
      if (item.loaded && item.width) dims.textContent = `${item.width} × ${item.height}`;
      else if (item.broken) dims.textContent = 'No disponible';
      else dims.textContent = '—';
    }

    function getCard(item) {
      let card = state.cards.get(item.id);
      if (card) {
        card.querySelector('input').checked = item.selected;
        card.classList.toggle('is-selected', item.selected);
        return card;
      }
      card = document.createElement('article');
      card.className = 'scr-card';
      card.dataset.id = item.id;
      card.innerHTML = CARD_TEMPLATE;

      const badge = card.querySelector('.scr-type-badge');
      badge.textContent = item.ext ? item.ext.toUpperCase() : '?';
      badge.classList.add(`t-${item.type}`);
      const name = card.querySelector('.scr-card-name');
      name.textContent = item.name;
      name.title = item.url;
      card.querySelector('.scr-via').textContent = VIA_LABELS[item.via] || item.via;
      card.querySelector('input').checked = item.selected;
      card.classList.toggle('is-selected', item.selected);

      const img = card.querySelector('img');
      img.alt = item.alt || item.name;
      img.addEventListener('load', () => {
        item.loaded = true;
        item.broken = false;
        item.width = img.naturalWidth;
        item.height = img.naturalHeight;
        card.classList.remove('is-broken');
        updateCardDims(item, card);
        if (els.hideSmall.checked && isSmall(item)) scheduleRender();
        else if (state.sort === 'largest') scheduleRender();
      });
      img.addEventListener('error', () => {
        // Muchos sitios bloquean el hotlinking: reintentamos a través del proxy.
        if (!item.thumbFallback) {
          item.thumbFallback = true;
          img.src = thumbFallbackUrl(item.url);
          return;
        }
        item.broken = true;
        card.classList.add('is-broken');
        updateCardDims(item, card);
      });
      img.src = item.thumbFallback ? thumbFallbackUrl(item.url) : item.url;

      state.cards.set(item.id, card);
      return card;
    }

    let renderTimer = null;
    function scheduleRender(immediate) {
      if (immediate) {
        clearTimeout(renderTimer);
        renderTimer = null;
        render();
        return;
      }
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        render();
      }, 250);
    }

    function render() {
      const list = visibleItems();
      const wanted = new Set();
      const frag = document.createDocumentFragment();
      list.forEach((item) => {
        const card = getCard(item);
        wanted.add(card);
        frag.appendChild(card);
      });
      Array.from(els.grid.children).forEach((child) => {
        if (!wanted.has(child)) child.remove();
      });
      els.grid.appendChild(frag);

      renderTypeFilters();

      const total = state.items.length;
      els.countText.textContent = list.length === total ? String(total) : `${list.length} de ${total}`;

      const showEmpty = list.length === 0;
      els.empty.hidden = !showEmpty;
      els.grid.hidden = showEmpty;
      if (showEmpty) {
        if (state.scan) {
          els.emptyTitle.textContent = 'Buscando imágenes…';
          els.emptyText.textContent = 'Las imágenes aparecerán aquí en cuanto Cleo las encuentre.';
        } else if (total > 0) {
          els.emptyTitle.textContent = 'Ninguna imagen coincide con los filtros';
          els.emptyText.textContent = 'Prueba con otro formato, otra búsqueda o desactiva «Ocultar íconos pequeños».';
        } else if (state.hasScanned) {
          els.emptyTitle.textContent = 'No se encontraron imágenes';
          els.emptyText.textContent = 'Puede que el sitio cargue sus imágenes con JavaScript o bloquee el acceso. Prueba con otra página del sitio.';
        } else {
          els.emptyTitle.textContent = 'Aún no has escaneado ningún sitio';
          els.emptyText.textContent = 'Pega un enlace arriba y pulsa «Escanear sitio» para ver aquí todas sus imágenes.';
        }
      }
      updateButtons(list);
    }

    function renderTypeFilters() {
      const base = state.items.filter(passesBaseFilters);
      const counts = { all: base.length };
      base.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; });
      if (state.filterType !== 'all' && !counts[state.filterType]) state.filterType = 'all';

      const html = TYPE_ORDER
        .filter((t) => t === 'all' || counts[t])
        .map((t) => `<button type="button" class="tab-filter-btn${state.filterType === t ? ' active' : ''}" data-type="${t}">${TYPE_LABELS[t]} <span class="scr-filter-count">${counts[t] || 0}</span></button>`)
        .join('');
      if (els.typeFilters.innerHTML !== html) els.typeFilters.innerHTML = html;
    }

    function selectedVisible(list) {
      return (list || visibleItems()).filter((i) => i.selected);
    }

    function updateButtons(list) {
      const visible = list || visibleItems();
      const selected = visible.filter((i) => i.selected);
      const scanning = !!state.scan;
      const busy = state.busy;

      els.btnDownloadAll.disabled = busy || visible.length === 0;
      els.btnDownloadSelected.disabled = busy || selected.length === 0;
      els.btnSend.disabled = busy || selected.length === 0 || !window.CleoPhotos;
      els.btnClear.disabled = scanning || (state.items.length === 0 && state.pagesData.length === 0);
      els.selectedLabel.textContent = selected.length ? `Descargar selección (${selected.length})` : 'Descargar selección';

      if (els.btnExportJson) els.btnExportJson.disabled = busy || (state.items.length === 0 && state.pagesData.length === 0);
      if (els.btnExportMd) els.btnExportMd.disabled = busy || (state.items.length === 0 && state.pagesData.length === 0);

      els.selectAll.disabled = visible.length === 0;
      els.selectAll.checked = visible.length > 0 && selected.length === visible.length;
      els.selectAll.indeterminate = selected.length > 0 && selected.length < visible.length;
    }

    function clearResults() {
      state.items = [];
      state.byKey.clear();
      state.byCanonical.clear();
      state.cards.clear();
      state.filterType = 'all';
      state.pagesData = [];
      state.selectedPageIndex = 0;
      state.textSearch = '';
      if (els.pageSelect) els.pageSelect.innerHTML = '';
      if (els.textView) els.textView.innerHTML = '';
      if (els.pagesBadge) els.pagesBadge.style.display = 'none';
      els.grid.innerHTML = '';
      orderCounter = 0;
      scheduleRender(true);
    }

    /* ------------------------------------------------------------------ *
     * Descargas
     * ------------------------------------------------------------------ */

    function saveBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    function saveBlobWithFallback(blob, name, okCount, failCount) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Enlace manual en el toast si el navegador bloquea descargas asíncronas
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.className = 'scr-toast-link';
      link.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" style="display:inline-block;vertical-align:middle;margin-right:4px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Descargar archivo ZIP
      `;
      link.addEventListener('click', () => {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });

      const msg = failCount
        ? `ZIP listo con ${okCount} imágenes (${failCount} no se pudieron descargar). Si no inició automáticamente:`
        : `ZIP listo con ${okCount} imágenes. Si no inició automáticamente:`;
      toast(msg, failCount ? 'warn' : 'ok', link);
    }

    function fileNameFor(item, blob) {
      let name = item.name;
      const realExt = MIME_EXT[(blob && blob.type || '').toLowerCase().split(';')[0]];
      const m = name.match(/\.([a-z0-9]{2,5})$/i);
      const curExt = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : '';
      if (realExt && curExt !== realExt) {
        name = (IMAGE_EXTS.includes(curExt) ? name.slice(0, -m[0].length) : name) + '.' + realExt;
      } else if (!curExt || !IMAGE_EXTS.includes(curExt)) {
        name += '.' + (item.ext || 'jpg');
      }
      return name;
    }

    function uniqueName(name, used) {
      let candidate = name;
      let n = 2;
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      while (used.has(candidate.toLowerCase())) candidate = `${stem}-${n++}${ext}`;
      used.add(candidate.toLowerCase());
      return candidate;
    }

    async function runPool(list, limit, worker) {
      let index = 0;
      const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
        while (index < list.length) {
          const i = index++;
          await worker(list[i], i);
        }
      });
      await Promise.all(runners);
    }

    async function downloadOne(item, button) {
      if (button) button.classList.add('is-loading');
      try {
        const blob = await fetchImageBlob(item);
        saveBlob(blob, fileNameFor(item, blob));
      } catch (err) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
        toast('No se pudo descargar directamente: se abrió la imagen en una pestaña nueva para guardarla.', 'warn');
      } finally {
        if (button) button.classList.remove('is-loading');
      }
    }

    function setZipProgress(text, pct) {
      els.zipProgress.hidden = false;
      els.zipText.textContent = text;
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      els.zipPercent.textContent = p + '%';
      els.zipFill.style.width = p + '%';
    }

    async function downloadZip(items, triggerBtn) {
      if (!items.length || state.busy) return;
      if (items.length === 1) return downloadOne(items[0], triggerBtn);
      if (!window.JSZip) {
        toast('No se pudo cargar el generador de ZIP. Revisa tu conexión.', 'error');
        return;
      }
      state.busy = true;
      updateButtons();

      const btn = triggerBtn || els.btnDownloadAll;
      const origHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.classList.add('is-loading');
        btn.innerHTML = `<span class="spinner-ring"></span><span>Descargando (0/${items.length})…</span>`;
      }

      const abortCtrl = new AbortController();
      state.abortDownload = abortCtrl;
      const zip = new window.JSZip();
      const used = new Set();
      const failed = [];
      let done = 0;
      let ok = 0;
      setZipProgress(`Descargando imágenes… 0/${items.length}`, 0);

      try {
        await runPool(items, DOWNLOAD_CONCURRENCY, async (item) => {
          if (abortCtrl.signal.aborted) return;
          try {
            const blob = await fetchImageBlob(item, abortCtrl.signal);
            zip.file(uniqueName(fileNameFor(item, blob), used), blob);
            ok++;
          } catch (err) {
            if (abortCtrl.signal.aborted) return;
            failed.push(item.url);
          } finally {
            done++;
            setZipProgress(`Descargando imágenes… ${done}/${items.length}`, (done / items.length) * 90);
            if (btn) {
              const span = btn.querySelector('span:last-child');
              if (span) span.textContent = `Descargando (${done}/${items.length})…`;
            }
          }
        });

        if (abortCtrl.signal.aborted) {
          toast('Descarga cancelada.', 'warn');
          return;
        }

        if (!ok) {
          toast('No se pudo descargar ninguna imagen: el sitio bloquea las descargas externas.', 'error');
          return;
        }
        if (failed.length) {
          zip.file('_imagenes_no_descargadas.txt', 'Estas imágenes no se pudieron descargar:\r\n\r\n' + failed.join('\r\n'));
        }

        if (btn) {
          const span = btn.querySelector('span:last-child');
          if (span) span.textContent = 'Empaquetando ZIP…';
        }
        setZipProgress('Generando archivo ZIP…', 92);

        // Las imágenes ya están comprimidas: STORE es mucho más rápido y pesa casi igual.
        const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => {
          setZipProgress('Generando ZIP…', 90 + meta.percent * 0.1);
        });
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = `Cleo_Imagenes_${(state.lastSite || 'sitio').replace(/[^a-z0-9.-]+/gi, '_')}_${stamp}.zip`;
        saveBlobWithFallback(content, filename, ok, failed.length);
      } catch (err) {
        if (!abortCtrl.signal.aborted) {
          toast('Ocurrió un error al generar el ZIP.', 'error');
        }
      } finally {
        state.busy = false;
        state.abortDownload = null;
        if (btn) {
          btn.innerHTML = origHtml;
          btn.classList.remove('is-loading');
        }
        setTimeout(() => { els.zipProgress.hidden = true; }, 1800);
        updateButtons();
      }
    }

    async function sendToCompressor(items, triggerBtn) {
      if (!window.CleoPhotos || state.busy) return;
      const candidates = items.filter((i) => RASTER_TYPES.includes(i.type) || i.type === 'other');
      const skipped = items.length - candidates.length;
      if (!candidates.length) {
        toast('Los íconos y SVG no se pueden comprimir. Selecciona fotos JPG, PNG, WebP, GIF o AVIF.', 'warn');
        return;
      }

      state.busy = true;
      updateButtons();

      const btn = triggerBtn || els.btnSend;
      const origHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.classList.add('is-loading');
        btn.innerHTML = `<span class="spinner-ring"></span><span>Transfiriendo (0/${candidates.length})…</span>`;
      }

      // Cambiar de inmediato a la pestaña Fotos para feedback instantáneo al usuario
      const tabPhotos = document.getElementById('tabPhotos');
      if (tabPhotos) tabPhotos.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(`Transfiriendo ${candidates.length} imágenes al compresor de Fotos…`, 'ok');

      const abortCtrl = new AbortController();
      state.abortDownload = abortCtrl;
      const used = new Set();
      let done = 0;
      let totalPushed = 0;
      let batch = [];
      setZipProgress(`Preparando imágenes para comprimir… 0/${candidates.length}`, 0);

      try {
        await runPool(candidates, DOWNLOAD_CONCURRENCY, async (item) => {
          if (abortCtrl.signal.aborted) return;
          try {
            let blob = await fetchImageBlob(item, abortCtrl.signal);
            let type = (blob.type || '').split(';')[0].toLowerCase();
            if (!type.startsWith('image/')) type = EXT_MIME[item.ext] || '';
            const ext = MIME_EXT[type];
            if (ext && RASTER_TYPES.includes(ext)) {
              if (blob.type !== type) blob = blob.slice(0, blob.size, type);
              batch.push(new File([blob], uniqueName(fileNameFor(item, blob), used), { type }));
              if (batch.length >= 6) {
                const toPush = batch.slice();
                batch = [];
                totalPushed += toPush.length;
                window.CleoPhotos.addFiles(toPush);
              }
            }
          } catch (err) {
            /* se omite */
          } finally {
            done++;
            setZipProgress(`Preparando imágenes para comprimir… ${done}/${candidates.length}`, (done / candidates.length) * 100);
            if (btn) {
              const span = btn.querySelector('span:last-child');
              if (span) span.textContent = `Transfiriendo (${done}/${candidates.length})…`;
            }
          }
        });

        if (abortCtrl.signal.aborted) return;

        if (batch.length > 0) {
          totalPushed += batch.length;
          await window.CleoPhotos.addFiles(batch);
        }

        if (!totalPushed) {
          toast('No se pudo descargar ninguna de las imágenes seleccionadas.', 'error');
          return;
        }

        const extra = (candidates.length - totalPushed) + skipped;
        toast(`✅ ${totalPushed} imágenes listas en el compresor de Fotos.${extra ? ` (${extra} omitidas)` : ''}`, 'ok');
      } finally {
        state.busy = false;
        state.abortDownload = null;
        if (btn) {
          btn.innerHTML = origHtml;
          btn.classList.remove('is-loading');
        }
        setTimeout(() => { els.zipProgress.hidden = true; }, 1000);
        updateButtons();
      }
    }

    /* ------------------------------------------------------------------ *
     * Vista previa y Contexto
     * ------------------------------------------------------------------ */

    function renderPreviewContext(item) {
      if (!els.previewContext) return;
      const ctx = item.context || {};
      const page = item.pages.values().next().value || ctx.pageUrl || '';
      const items = [];

      if (ctx.section) {
        items.push(`<div class="scr-ctx-item"><span class="scr-ctx-label">Sección</span><span class="scr-ctx-val">${escapeHtml(ctx.section)}</span></div>`);
      }
      if (ctx.caption) {
        items.push(`<div class="scr-ctx-item"><span class="scr-ctx-label">Pie de foto</span><span class="scr-ctx-val">${escapeHtml(ctx.caption)}</span></div>`);
      }
      if (item.alt) {
        items.push(`<div class="scr-ctx-item"><span class="scr-ctx-label">Texto alternativo (Alt)</span><span class="scr-ctx-val">${escapeHtml(item.alt)}</span></div>`);
      }
      if (ctx.snippet) {
        items.push(`<div class="scr-ctx-item" style="grid-column: 1 / -1;"><span class="scr-ctx-label">Contexto textual adyacente</span><span class="scr-ctx-val">${escapeHtml(ctx.snippet)}</span></div>`);
      }
      if (page) {
        items.push(`<div class="scr-ctx-item" style="grid-column: 1 / -1;"><span class="scr-ctx-label">Página de origen</span><a class="scr-meta-url" href="${escapeHtml(page)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl(page, 80))}</a></div>`);
      }

      if (items.length) {
        els.previewContext.innerHTML = `<div class="scr-ctx-grid">${items.join('')}</div>`;
        els.previewContext.style.display = 'block';
      } else {
        els.previewContext.innerHTML = '';
        els.previewContext.style.display = 'none';
      }
    }

    function openPreview(item) {
      state.previewItem = item;
      els.previewName.textContent = item.name;
      const parts = [];
      if (item.width) parts.push(`${item.width} × ${item.height}px`);
      if (item.ext) parts.push(item.ext.toUpperCase());
      parts.push(VIA_LABELS[item.via] || item.via);
      const page = item.pages.values().next().value;
      if (page) parts.push(`en ${shortUrl(page, 50)}`);
      els.previewMeta.textContent = parts.join(' · ');
      els.previewOpen.href = item.url;
      els.previewImg.onerror = () => {
        els.previewImg.onerror = null;
        els.previewImg.src = thumbFallbackUrl(item.url);
      };
      els.previewImg.alt = item.alt || item.name;
      els.previewImg.src = item.thumbFallback ? thumbFallbackUrl(item.url) : item.url;

      renderPreviewContext(item);
      els.previewModal.style.display = 'flex';
    }

    function closePreview() {
      els.previewModal.style.display = 'none';
      els.previewImg.removeAttribute('src');
      if (els.previewContext) {
        els.previewContext.innerHTML = '';
        els.previewContext.style.display = 'none';
      }
      state.previewItem = null;
    }

    /* ------------------------------------------------------------------ *
     * Visor de Texto, Orden y Estructura
     * ------------------------------------------------------------------ */

    function updatePageSelect() {
      if (!els.pageSelect) return;
      const pages = state.pagesData;
      if (!pages.length) {
        els.pageSelect.innerHTML = '<option value="0">Sin páginas analizadas</option>';
        return;
      }
      const opts = pages.map((p, idx) => {
        const title = p.title ? p.title.slice(0, 48) : shortUrl(p.url, 48);
        return `<option value="${idx}">${idx + 1}. ${escapeHtml(title)}</option>`;
      }).join('');
      els.pageSelect.innerHTML = opts;
      els.pageSelect.value = String(state.selectedPageIndex);
    }

    function setViewMode(mode) {
      state.activeView = mode;
      const isText = mode === 'text';
      if (els.btnViewGrid) {
        els.btnViewGrid.classList.toggle('active', !isText);
        els.btnViewGrid.setAttribute('aria-selected', !isText ? 'true' : 'false');
      }
      if (els.btnViewText) {
        els.btnViewText.classList.toggle('active', isText);
        els.btnViewText.setAttribute('aria-selected', isText ? 'true' : 'false');
      }
      if (els.resultsTitle) {
        els.resultsTitle.textContent = isText ? 'Texto y Estructura' : 'Imágenes encontradas';
      }

      if (els.imagesToolbar) els.imagesToolbar.style.display = isText ? 'none' : 'flex';
      if (els.textToolbar) els.textToolbar.style.display = isText ? 'flex' : 'none';
      if (els.grid) els.grid.style.display = isText ? 'none' : 'grid';
      if (els.textView) els.textView.style.display = isText ? 'flex' : 'none';

      if (isText) {
        renderTextView();
      }
    }

    function renderTextView() {
      if (!els.textView) return;
      if (!state.pagesData.length) {
        els.textView.innerHTML = `
          <div class="empty-state-wrap">
            <p style="color: var(--text-muted); font-size: 0.88rem;">No se encontraron bloques de texto en el escaneo.</p>
          </div>
        `;
        if (els.textStatsPill) els.textStatsPill.textContent = '0 bloques';
        return;
      }

      updatePageSelect();
      const pageIndex = Math.max(0, Math.min(state.selectedPageIndex, state.pagesData.length - 1));
      const page = state.pagesData[pageIndex];
      if (!page) return;

      const q = (state.textSearch || '').toLowerCase();
      let filteredBlocks = page.blocks;
      if (q) {
        filteredBlocks = page.blocks.filter(b => {
          if (b.type === 'product') {
            const prod = b.data || {};
            return (prod.name && prod.name.toLowerCase().includes(q)) ||
                   (prod.description && prod.description.toLowerCase().includes(q)) ||
                   (prod.sku && prod.sku.toLowerCase().includes(q)) ||
                   (prod.price && prod.price.toLowerCase().includes(q));
          }
          if (b.type === 'image') {
            return (b.alt && b.alt.toLowerCase().includes(q)) ||
                   (b.caption && b.caption.toLowerCase().includes(q)) ||
                   (b.section && b.section.toLowerCase().includes(q));
          }
          if (b.items) return b.items.some(i => i.toLowerCase().includes(q));
          if (b.headers) return b.headers.some(h => h.toLowerCase().includes(q));
          if (b.rows) return b.rows.some(r => r.some(c => c.toLowerCase().includes(q)));
          return b.text && b.text.toLowerCase().includes(q);
        });
      }

      if (els.textStatsPill) {
        els.textStatsPill.textContent = `${filteredBlocks.length} bloques (${page.textBlocksCount || 0} textos, ${page.imagesCount || 0} fotos)`;
      }

      const metaTags = [];
      if (page.author) metaTags.push(`<span class="scr-meta-tag"><strong>Autor:</strong> ${escapeHtml(page.author)}</span>`);
      if (page.date) metaTags.push(`<span class="scr-meta-tag"><strong>Fecha:</strong> ${escapeHtml(page.date)}</span>`);
      if (page.lang) metaTags.push(`<span class="scr-meta-tag"><strong>Idioma:</strong> ${escapeHtml(page.lang.toUpperCase())}</span>`);
      if (page.jsonLd && page.jsonLd.length) {
        const types = page.jsonLd.map(j => j['@type']).filter(Boolean).flat().join(', ');
        metaTags.push(`<span class="scr-meta-tag" style="color: #c084fc;"><strong>Schema.org:</strong> ${escapeHtml(types || 'JSON-LD')}</span>`);
      }

      let jsonLdHtml = '';
      if (page.jsonLd && page.jsonLd.length) {
        jsonLdHtml = `
          <details class="scr-jsonld-accordion">
            <summary class="scr-jsonld-summary">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              <span>Ver datos estructurados JSON-LD (${page.jsonLd.length})</span>
            </summary>
            <pre class="scr-jsonld-code">${escapeHtml(JSON.stringify(page.jsonLd, null, 2))}</pre>
          </details>
        `;
      }

      const metaHtml = `
        <div class="scr-meta-card">
          <div class="scr-meta-head">
            <div>
              <h3 class="scr-meta-title">${escapeHtml(page.title || 'Sin título')}</h3>
              <a class="scr-meta-url" href="${escapeHtml(page.url)}" target="_blank" rel="noopener noreferrer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <span>${escapeHtml(page.url)}</span>
              </a>
            </div>
          </div>
          ${page.description ? `<p class="scr-meta-desc">${escapeHtml(page.description)}</p>` : ''}
          ${metaTags.length ? `<div class="scr-meta-tags-row">${metaTags.join('')}</div>` : ''}
          ${jsonLdHtml}
        </div>
      `;

      const streamHtml = filteredBlocks.map((block) => {
        const badge = block.type.toUpperCase();
        let bodyHtml = '';

        if (block.type === 'product') {
          const prod = block.data || {};
          const isAvail = (prod.availability || '').toLowerCase().includes('stock') && !(prod.availability || '').toLowerCase().includes('out');
          bodyHtml = `
            <div class="scr-product-card">
              <div class="scr-product-badge">🛍️ Ficha de Producto</div>
              <h3 class="scr-product-title">${escapeHtml(prod.name || '')}</h3>
              <div class="scr-product-pricing">
                ${prod.price ? `<span class="scr-product-price">${escapeHtml(prod.price)}</span>` : ''}
                ${prod.availability ? `<span class="scr-product-stock ${isAvail ? 'in-stock' : 'out-of-stock'}">${escapeHtml(prod.availability)}</span>` : ''}
                ${prod.sku ? `<span class="scr-product-sku">SKU: ${escapeHtml(prod.sku)}</span>` : ''}
                ${prod.brand ? `<span class="scr-product-sku">Marca: ${escapeHtml(prod.brand)}</span>` : ''}
              </div>
              ${prod.description ? `<div class="scr-product-desc">${escapeHtml(prod.description)}</div>` : ''}
            </div>
          `;
        } else if (/^h[1-6]$/.test(block.type)) {
          bodyHtml = `<div class="scr-${block.type}">${escapeHtml(block.text)}</div>`;
        } else if (block.type === 'p') {
          bodyHtml = `<p class="scr-p">${escapeHtml(block.text)}</p>`;
        } else if (block.type === 'quote') {
          bodyHtml = `<blockquote class="scr-quote">${escapeHtml(block.text)}</blockquote>`;
        } else if (block.type === 'list') {
          const tag = block.ordered ? 'ol' : 'ul';
          const itemsHtml = block.items.map(it => `<li>${escapeHtml(it)}</li>`).join('');
          bodyHtml = `<${tag} class="scr-list">${itemsHtml}</${tag}>`;
        } else if (block.type === 'table') {
          const ths = (block.headers || []).map(h => `<th>${escapeHtml(h)}</th>`).join('');
          const trs = (block.rows || []).map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
          bodyHtml = `
            <div class="scr-table-wrap">
              <table class="scr-table">
                ${ths ? `<thead><tr>${ths}</tr></thead>` : ''}
                ${trs ? `<tbody>${trs}</tbody>` : ''}
              </table>
            </div>
          `;
        } else if (block.type === 'image') {
          const it = state.byKey.get(block.url);
          const caption = block.caption || block.alt || (it && it.name) || 'Imagen';
          bodyHtml = `
            <div class="scr-inline-img-card">
              <img class="scr-inline-img-thumb" src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || '')}" loading="lazy" referrerpolicy="no-referrer">
              <div class="scr-inline-img-info">
                <div class="scr-inline-img-caption">${escapeHtml(caption)}</div>
                ${block.section ? `<div class="scr-inline-img-context">📍 Sección: ${escapeHtml(block.section)}</div>` : ''}
                ${block.snippet ? `<div class="scr-inline-img-context">💬 ${escapeHtml(block.snippet)}</div>` : ''}
              </div>
              <div class="scr-inline-img-actions">
                <button class="btn-compact-add" data-act="inline-preview" data-url="${escapeHtml(block.url)}" title="Ver en grande">🔍 Ver</button>
              </div>
            </div>
          `;
        }

        return `
          <div class="scr-block" data-type="${escapeHtml(block.type)}">
            <span class="scr-block-badge">${badge}</span>
            ${bodyHtml}
          </div>
        `;
      }).join('');

      els.textView.innerHTML = `
        ${metaHtml}
        <div class="scr-stream-container">
          ${streamHtml || '<div style="color: var(--text-muted); padding: 12px; font-size: 0.84rem;">No hay bloques que coincidan con la búsqueda.</div>'}
        </div>
      `;
    }

    /* ------------------------------------------------------------------ *
     * Exportación de Datos: JSON & Markdown
     * ------------------------------------------------------------------ */

    function exportToJson() {
      if (!state.pagesData.length && !state.items.length) {
        toast('No hay datos extraídos para exportar.', 'warn');
        return;
      }

      const exportData = {
        meta: {
          app: 'Cleo Herramientas - Extractor Web',
          site: state.lastSite || (state.pagesData[0] ? state.pagesData[0].url : ''),
          exportedAt: new Date().toISOString(),
          totalPagesScanned: state.pagesData.length,
          totalImagesFound: state.items.length
        },
        pages: state.pagesData.map(p => ({
          url: p.url,
          title: p.title,
          description: p.description,
          author: p.author,
          date: p.date,
          canonical: p.canonical,
          lang: p.lang,
          jsonLd: p.jsonLd,
          structure: p.blocks.map((b, idx) => ({
            order: idx + 1,
            type: b.type,
            level: b.level || undefined,
            text: b.text || undefined,
            items: b.items || undefined,
            headers: b.headers || undefined,
            rows: b.rows || undefined,
            product: b.type === 'product' ? b.data : undefined,
            image: b.type === 'image' ? {
              url: b.url,
              alt: b.alt,
              caption: b.caption,
              section: b.section,
              surroundingSnippet: b.snippet
            } : undefined
          }))
        })),
        images: state.items.map(it => ({
          id: it.id,
          order: it.order,
          name: it.name,
          url: it.url,
          ext: it.ext,
          type: it.type,
          dimensions: it.width && it.height ? `${it.width}x${it.height}` : undefined,
          alt: it.alt || undefined,
          caption: it.context ? it.context.caption : undefined,
          section: it.context ? it.context.section : undefined,
          surroundingText: it.context ? it.context.snippet : undefined,
          pages: Array.from(it.pages)
        }))
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const host = (state.lastSite || 'sitio').replace(/[^a-z0-9_-]/gi, '_');
      saveBlob(blob, `cleo_datos_${host}_${Date.now()}.json`);
      toast('Exportación JSON completada con éxito.', 'ok');
    }

    function exportToMarkdown() {
      if (!state.pagesData.length && !state.items.length) {
        toast('No hay datos para exportar a Markdown.', 'warn');
        return;
      }

      const host = state.lastSite || 'sitio';
      let md = `# Reporte de Extracción: ${host}\n\n`;
      md += `*Generado por Cleo Herramientas el ${new Date().toLocaleString('es-ES')}*\n`;
      md += `*Total páginas analizadas: ${state.pagesData.length} | Total imágenes: ${state.items.length}*\n\n---\n\n`;

      if (state.pagesData.length) {
        state.pagesData.forEach((p, pIdx) => {
          md += `## Página ${pIdx + 1}: ${p.title || p.url}\n\n`;
          md += `> **URL:** ${p.url}  \n`;
          if (p.description) md += `> **Descripción:** ${p.description}  \n`;
          if (p.author) md += `> **Autor:** ${p.author}  \n`;
          if (p.date) md += `> **Fecha:** ${p.date}  \n`;
          md += `\n### Contenido estructurado:\n\n`;

          p.blocks.forEach(b => {
            if (b.type === 'product') {
              const prod = b.data || {};
              md += `### 🛍️ Producto: ${prod.name || 'Sin título'}\n\n`;
              if (prod.price) md += `- **Precio:** ${prod.price}\n`;
              if (prod.availability) md += `- **Disponibilidad:** ${prod.availability}\n`;
              if (prod.sku) md += `- **SKU:** ${prod.sku}\n`;
              if (prod.brand) md += `- **Marca:** ${prod.brand}\n`;
              if (prod.description) md += `\n**Descripción del producto:**\n${prod.description}\n\n`;
              md += '\n';
            } else if (/^h[1-6]$/.test(b.type)) {
              const prefix = '#'.repeat(Math.min(6, (b.level || 2) + 2));
              md += `${prefix} ${b.text}\n\n`;
            } else if (b.type === 'p') {
              md += `${b.text}\n\n`;
            } else if (b.type === 'quote') {
              md += `> ${b.text}\n\n`;
            } else if (b.type === 'list') {
              b.items.forEach((it, i) => {
                md += b.ordered ? `${i + 1}. ${it}\n` : `- ${it}\n`;
              });
              md += '\n';
            } else if (b.type === 'table') {
              if (b.headers && b.headers.length) {
                md += `| ${b.headers.join(' | ')} |\n`;
                md += `| ${b.headers.map(() => '---').join(' | ')} |\n`;
              }
              (b.rows || []).forEach(r => {
                md += `| ${r.join(' | ')} |\n`;
              });
              md += '\n';
            } else if (b.type === 'image') {
              const alt = b.alt || b.caption || 'Imagen';
              md += `![${alt}](${b.url})\n`;
              if (b.caption) md += `*Pie de foto: ${b.caption}*\n`;
              if (b.section) md += `*Ubicación: ${b.section}*\n`;
              md += '\n';
            }
          });

          md += `---\n\n`;
        });
      } else {
        md += `### Galería de Imágenes Encontradas\n\n`;
        state.items.forEach(it => {
          md += `- ![${it.alt || it.name}](${it.url}) [${it.name}](${it.url})\n`;
        });
      }

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      saveBlob(blob, `cleo_contenido_${host.replace(/[^a-z0-9_-]/gi, '_')}_${Date.now()}.md`);
      toast('Exportación Markdown descargada.', 'ok');
    }

    /* ------------------------------------------------------------------ *
     * Eventos
     * ------------------------------------------------------------------ */

    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      startScan();
    });

    els.btnCancel.addEventListener('click', cancelScan);

    els.hideSmall.addEventListener('change', () => scheduleRender(true));
    if (els.dedupe) els.dedupe.addEventListener('change', () => scheduleRender(true));

    els.search.addEventListener('input', () => {
      state.search = els.search.value.trim().toLowerCase();
      scheduleRender();
    });

    els.sort.addEventListener('change', () => {
      state.sort = els.sort.value;
      scheduleRender(true);
    });

    els.typeFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      state.filterType = btn.getAttribute('data-type');
      scheduleRender(true);
    });

    els.selectAll.addEventListener('change', () => {
      const on = els.selectAll.checked;
      visibleItems().forEach((i) => { i.selected = on; });
      scheduleRender(true);
    });

    els.grid.addEventListener('change', (e) => {
      if (!e.target.matches('input[type="checkbox"]')) return;
      const card = e.target.closest('.scr-card');
      const item = card && state.items.find((i) => i.id === card.dataset.id);
      if (!item) return;
      item.selected = e.target.checked;
      card.classList.toggle('is-selected', item.selected);
      updateButtons();
    });

    els.grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const card = btn.closest('.scr-card');
      const item = card && state.items.find((i) => i.id === card.dataset.id);
      if (!item) return;
      const act = btn.getAttribute('data-act');
      if (act === 'preview') openPreview(item);
      else if (act === 'download') downloadOne(item, btn);
      else if (act === 'open') window.open(item.url, '_blank', 'noopener,noreferrer');
      else if (act === 'copy') {
        try {
          await navigator.clipboard.writeText(item.url);
          toast('Enlace de la imagen copiado.', 'ok');
        } catch (err) {
          toast('No se pudo copiar el enlace.', 'error');
        }
      }
    });

    // Modos de vista y exportación
    if (els.btnViewGrid) els.btnViewGrid.addEventListener('click', () => setViewMode('grid'));
    if (els.btnViewText) els.btnViewText.addEventListener('click', () => setViewMode('text'));
    if (els.btnExportJson) els.btnExportJson.addEventListener('click', exportToJson);
    if (els.btnExportMd) els.btnExportMd.addEventListener('click', exportToMarkdown);

    if (els.pageSelect) {
      els.pageSelect.addEventListener('change', () => {
        state.selectedPageIndex = parseInt(els.pageSelect.value, 10) || 0;
        renderTextView();
      });
    }

    if (els.textSearch) {
      els.textSearch.addEventListener('input', () => {
        state.textSearch = els.textSearch.value.trim();
        renderTextView();
      });
    }

    if (els.textView) {
      els.textView.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act="inline-preview"]');
        if (!btn) return;
        const url = btn.getAttribute('data-url');
        const item = state.byKey.get(url) || { url, name: url.split('/').pop() || 'imagen', ext: 'jpg', type: 'jpg', pages: new Set() };
        openPreview(item);
      });
    }

    els.btnDownloadAll.addEventListener('click', () => downloadZip(visibleItems(), els.btnDownloadAll));
    els.btnDownloadSelected.addEventListener('click', () => downloadZip(selectedVisible(), els.btnDownloadSelected));
    els.btnSend.addEventListener('click', () => sendToCompressor(selectedVisible(), els.btnSend));
    els.btnClear.addEventListener('click', () => {
      if (state.scan) cancelScan();
      if (state.abortDownload) {
        state.abortDownload.abort();
        state.abortDownload = null;
      }
      state.busy = false;
      clearResults();
      state.hasScanned = false;
      els.progress.hidden = true;
      els.zipProgress.hidden = true;
      hideError();
      toast('Lista vaciada con éxito.', 'ok');
      scheduleRender(true);
    });

    els.btnPreviewClose.addEventListener('click', closePreview);
    els.previewModal.addEventListener('click', (e) => {
      if (e.target === els.previewModal) closePreview();
    });
    els.btnPreviewDownload.addEventListener('click', () => {
      if (state.previewItem) downloadOne(state.previewItem, els.btnPreviewDownload);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.previewModal && els.previewModal.style.display === 'flex') closePreview();
        if (els.pasteUrlsModal && els.pasteUrlsModal.style.display === 'flex') els.pasteUrlsModal.style.display = 'none';
        if (els.bookmarkletModal && els.bookmarkletModal.style.display === 'flex') els.bookmarkletModal.style.display = 'none';
      }
    });

    if (els.tab) {
      els.tab.addEventListener('click', () => {
        if (!els.input.value && !state.scan) setTimeout(() => els.input.focus(), 50);
      });
    }

    /* ------------------------------------------------------------------ *
     * Modal: Pegar URLs en Lote
     * ------------------------------------------------------------------ */
    if (els.btnOpenPasteModal && els.pasteUrlsModal) {
      const openPasteModal = () => {
        els.pasteUrlsModal.style.display = 'flex';
        if (els.pasteUrlsTextarea) {
          els.pasteUrlsTextarea.value = '';
          if (els.pasteUrlsCount) els.pasteUrlsCount.textContent = '0 enlaces detectados';
          setTimeout(() => els.pasteUrlsTextarea.focus(), 50);
        }
      };

      const closePasteModal = () => {
        els.pasteUrlsModal.style.display = 'none';
      };

      els.btnOpenPasteModal.addEventListener('click', openPasteModal);
      if (els.btnPasteUrlsClose) els.btnPasteUrlsClose.addEventListener('click', closePasteModal);
      if (els.btnPasteUrlsCancel) els.btnPasteUrlsCancel.addEventListener('click', closePasteModal);
      els.pasteUrlsModal.addEventListener('click', (e) => {
        if (e.target === els.pasteUrlsModal) closePasteModal();
      });

      function parsePasteUrls(text) {
        if (!text) return [];
        const lines = text.split(/[\r\n,]+/)
          .map(s => s.trim().replace(/^['"]+|['"]+$/g, ''))
          .filter(s => /^https?:\/\//i.test(s));
        return Array.from(new Set(lines));
      }

      if (els.pasteUrlsTextarea) {
        els.pasteUrlsTextarea.addEventListener('input', () => {
          const urls = parsePasteUrls(els.pasteUrlsTextarea.value);
          if (els.pasteUrlsCount) {
            els.pasteUrlsCount.textContent = `${urls.length} ${urls.length === 1 ? 'enlace detectado' : 'enlaces detectados'}`;
          }
        });
      }

      if (els.btnPasteUrlsSubmit) {
        els.btnPasteUrlsSubmit.addEventListener('click', () => {
          const urls = parsePasteUrls(els.pasteUrlsTextarea.value);
          if (!urls.length) {
            alert('Por favor pega al menos un enlace válido que comience con http:// o https://');
            return;
          }
          clearResults();
          urls.forEach((u) => {
            addImage(u, u, 'import', 'Importado manualmente', 'Foto importada');
          });
          state.hasScanned = true;
          closePasteModal();
          scheduleRender(true);
          toast(`✅ ¡${urls.length} fotos importadas con éxito!`, 'ok');
        });
      }
    }

    /* ------------------------------------------------------------------ *
     * Modal: Marcador de 1-Clic (Bookmarklet)
     * ------------------------------------------------------------------ */
    if (els.btnOpenBookmarkletModal && els.bookmarkletModal) {
      const currentOrigin = window.location.origin;
      const bookmarkletCode = "javascript:(function(){var imgs=[];document.querySelectorAll('img').forEach(function(i){var s=i.currentSrc||i.src||i.getAttribute('data-src')||i.getAttribute('data-lazy-src')||i.getAttribute('data-original');if(s)imgs.push(s);});document.querySelectorAll('*').forEach(function(el){var bg=(el.style&&el.style.backgroundImage)||'';var m=bg.match(/url\\(['\"]?(https?:\\/\\/[^'\"]+)['\"]?\\)/i);if(m)imgs.push(m[1]);});var valid=imgs.filter(function(s){return s&&/^https?:\\/\\//i.test(s)&&!s.includes('rsrc.php')&&!s.includes('emoji.php')&&!s.includes('mapslogo')&&!s.includes('default-user');}).map(function(s){return s.replace(/=w\\d+-h\\d+.*$|=s\\d+.*$/i,'=s0');});var unique=Array.from(new Set(valid));if(!unique.length){alert('No se encontraron imágenes en esta vista. Haz scroll e intenta de nuevo.');return;}var target='" + currentOrigin + "/?import_urls='+encodeURIComponent(JSON.stringify(unique));window.open(target,'_blank');})();";

      if (els.cleoBookmarkletLink) {
        els.cleoBookmarkletLink.setAttribute('href', bookmarkletCode);
        els.cleoBookmarkletLink.addEventListener('click', (e) => {
          e.preventDefault();
          alert('Arrastra este botón a tu barra de marcadores (Ctrl+Shift+B en Chrome/Edge si no la ves).');
        });
      }

      const openBookmarkletModal = () => {
        els.bookmarkletModal.style.display = 'flex';
      };

      const closeBookmarkletModal = () => {
        els.bookmarkletModal.style.display = 'none';
      };

      els.btnOpenBookmarkletModal.addEventListener('click', openBookmarkletModal);
      if (els.btnBookmarkletClose) els.btnBookmarkletClose.addEventListener('click', closeBookmarkletModal);
      if (els.btnBookmarkletDismiss) els.btnBookmarkletDismiss.addEventListener('click', closeBookmarkletModal);
      els.bookmarkletModal.addEventListener('click', (e) => {
        if (e.target === els.bookmarkletModal) closeBookmarkletModal();
      });
    }

    /* ------------------------------------------------------------------ *
     * Receptor de URLs del Marcador (?import_urls=...)
     * ------------------------------------------------------------------ */
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const rawImport = searchParams.get('import_urls');
      if (rawImport) {
        const urls = JSON.parse(rawImport);
        if (Array.isArray(urls) && urls.length > 0) {
          setTimeout(() => {
            const scraperTabBtn = document.querySelector('[data-tab="scraper"]');
            if (scraperTabBtn) scraperTabBtn.click();
            clearResults();
            urls.forEach((u) => {
              addImage(u, u, 'bookmarklet', 'Marcador de navegador', 'Foto capturada');
            });
            state.hasScanned = true;
            scheduleRender(true);
            toast(`📸 ¡${urls.length} fotos importadas desde el marcador!`, 'ok');
            window.history.replaceState({}, document.title, window.location.pathname);
          }, 350);
        }
      }
    } catch (e) { /* ignore parse */ }

    render();

    // Superficie de depuración / pruebas
    window.CleoScraper = {
      scan: (url) => { els.input.value = url; return startScan(); },
      cancel: cancelScan,
      getItems: () => state.items,
      getPagesData: () => state.pagesData,
      exportJson: exportToJson,
      exportMarkdown: exportToMarkdown,
      extractFromHtml: (html, pageUrl) => extractFromHtml(html, pageUrl, { includeCss: false }),
      proxies
    };
  });
})();
