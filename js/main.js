/* =====================================================================
   OBSIDIAN — motor del sitio
   Estructura compartida (barra, menú, buscador, bolsa, footer),
   transiciones, animaciones y la lógica de cada tipo de página
   según <body data-page="...">.
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- base ---------- */
  const CFG = window.OBSIDIAN_CONFIG || {};
  const html = document.documentElement;
  const body = document.body;
  const PAGE = body.dataset.page || '';
  const SECTION = body.dataset.section || '';
  const ROOT = body.dataset.root || '';
  const u = p => ROOT + p;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CO');
  const pad = n => String(n).padStart(2, '0');
  const fullName = p => (norm(p.nombre).startsWith(norm(p.marca)) || /^air jordan/i.test(p.nombre)) ? p.nombre : `${p.marca} ${p.nombre}`;
  const EXTRA = Number(CFG.aumentoPrecio) || 0;
  const PRODUCTS = (window.OBSIDIAN_PRODUCTS || []).map((p, i) => ({ ...p, precio: p.precio + EXTRA, rank: i, n: i + 1, slug: p.slug || slugify(`${fullName(p)} ${p.color}`) }));
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  /* forma de pago: solo los productos con "contraentrega": true se pagan al recibir; el resto, por adelantado */
  const isCOD = p => !!(p && p.contraentrega);
  const cartCOD = () => Cart.items.every(i => isCOD(byId[i.id]));
  const bySlug = Object.fromEntries(PRODUCTS.map(p => [p.slug, p]));
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const ANIM = !!(window.gsap && window.ScrollTrigger) && !REDUCED;
  if (ANIM) { gsap.registerPlugin(ScrollTrigger); if (window.Flip) gsap.registerPlugin(Flip); html.classList.add('js-anim'); }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bloqueado */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bloqueado */ } },
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* bloqueado */ } },
  };

  /* código de referido: ?ref=juan en cualquier página. Se recuerda N días (último enlace usado gana). */
  const REF_KEY = 'obs-ref';
  const REF_DAYS = Number(CFG.referidoDias) || 30;
  const cleanRef = v => { const s = norm(v).replace(/[^a-z0-9_-]/g, '').slice(0, 30); return s.length >= 2 ? s : ''; };
  (() => {
    let incoming = '';
    try { incoming = cleanRef(new URLSearchParams(location.search).get('ref')); } catch (e) { incoming = ''; }
    /* ?ref=tienda borra el enlace guardado y vuelve a los precios de la tienda */
    if (incoming === 'tienda') { try { localStorage.removeItem(REF_KEY); localStorage.removeItem('obs-refp'); } catch (e) { /* bloqueado */ } }
    else if (incoming) store.set(REF_KEY, { c: incoming, t: Date.now() });
  })();
  const getRef = () => { const o = store.get(REF_KEY, null); return o && o.c && Date.now() - o.t < REF_DAYS * 864e5 ? o.c : ''; };
  const refLine = () => (getRef() ? `\nVendedor: ${getRef()}` : '');

  /* precios del vendedor: quien llega con su enlace ve los precios que él puso (sin enlace, los de la tienda).
     Se guardan 10 min en el navegador; en la bolsa siempre se piden de nuevo. */
  const PX_KEY = 'obs-refp';
  const BASE_PRICE = Object.fromEntries(PRODUCTS.map(p => [p.id, p.precio]));
  const setPrices = map => PRODUCTS.forEach(p => { const v = Math.round(Number(map && map[p.id]) || 0); p.precio = v > 0 ? v : BASE_PRICE[p.id]; });
  const RefPrices = (() => {
    const ref = getRef();
    if (!ref || !CFG.pedidosApi) return { ready: Promise.resolve() };
    const cached = store.get(PX_KEY, null), same = !!(cached && cached.c === ref);
    if (same) setPrices(cached.p);
    if (same && PAGE !== 'cart' && Date.now() - cached.t < 10 * 60e3) return { ready: Promise.resolve() };
    if (!same) html.classList.add('px-wait');
    const unwait = () => html.classList.remove('px-wait');
    setTimeout(unwait, 3500);
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
    const ready = fetch(CFG.pedidosApi, { method: 'POST', body: JSON.stringify({ accion: 'preciosRef', ref }), signal: ctl.signal })
      .then(r => r.json())
      .then(j => {
        if (!j || !j.ok) return;
        store.set(PX_KEY, { c: ref, t: Date.now(), p: j.precios || {} });
        const before = PRODUCTS.map(p => p.precio).join();
        setPrices(j.precios);
        if (PRODUCTS.map(p => p.precio).join() !== before) paintPrices();
      })
      .catch(() => {})
      .finally(unwait);
    return { ready };
  })();
  function paintPrices() {
    $$('[data-price-of]').forEach(el => { const p = bySlug[el.dataset.priceOf]; if (p) el.textContent = fmt(p.precio); });
    const cur = bySlug[body.dataset.product];
    if (cur) $$('[data-price]').forEach(el => { el.textContent = fmt(cur.precio); });
    renderBag();
  }

  const COLLECTIONS = {
    blackout: { name: 'Blackout', img: 'img/products/lv-skate-black-4.jpg' },
    icons: { name: 'Icons', img: 'img/products/af1-mid-2.jpg' },
    luxury: { name: 'Luxury', img: 'img/products/nocta-blanco-1.jpg' },
    runner: { name: 'Runner', img: 'img/products/asics-verde-1.jpg' },
  };
  const brands = () => {
    const m = new Map();
    PRODUCTS.forEach(p => m.set(p.marca, (m.get(p.marca) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const productUrl = p => u(`productos/${p.slug}.html`);
  const brandUrl = m => u(`marcas/${slugify(m)}.html`);
  const colUrl = k => u(`colecciones/${k}.html`);
  const SIBS = {}; PRODUCTS.forEach(p => { if (!p.colores) (SIBS[norm(`${p.marca}|${p.nombre}`)] ||= []).push(p); });
  const colorLabel = p => { if (p.colores?.length) return `${p.colores.length} colores`; const n = (SIBS[norm(`${p.marca}|${p.nombre}`)] || []).length; return n > 1 ? `${p.color} · ${n} colores` : p.color; };
  const sizeRange = p => p.tallas.length ? `${p.tallas[0]}–${p.tallas[p.tallas.length - 1]}` : '—';
  const adultSizes = () => { const t = PRODUCTS.filter(p => p.genero !== 'Niños').flatMap(p => p.tallas); return t.length ? `${Math.min(...t)}–${Math.max(...t)}` : '36–44'; };
  const forGender = (p, g) => !g || p.genero === g || (p.genero === 'Unisex' && g !== 'Niños');
  const NEW_TAGS = ['Nuevo', 'Tendencia', 'Edición especial', 'Colaboración'];

  const HELP = [
    ['como-comprar.html', 'Cómo comprar'], ['envios.html', 'Envíos'], ['pagos.html', 'Pagos'], ['cambios.html', 'Cambios'],
    ['guia-de-tallas.html', 'Guía de tallas'], ['preguntas-frecuentes.html', 'Preguntas frecuentes'], ['contacto.html', 'Contacto'], ['privacidad.html', 'Privacidad'],
  ];
  const PAGE_TITLES = {
    'index.html': 'Inicio', '': 'Inicio', 'tienda.html': 'Tienda', 'novedades.html': 'Novedades', 'hombre.html': 'Hombre', 'mujer.html': 'Mujer', 'ninos.html': 'Niños',
    'colecciones.html': 'Colecciones', 'marcas.html': 'Marcas', 'lookbook.html': 'Lookbook', 'nosotros.html': 'Nosotros', 'carrito.html': 'Tu bolsa',
    ...Object.fromEntries(HELP),
  };

  /* ---------- íconos ---------- */
  const sv = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    arrow: sv('<path d="M4 12h16M14 6l6 6-6 6"/>'),
    arrowUR: sv('<path d="M7 17 17 7M8 7h9v9"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>'),
    x: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
    search: sv('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
    check: sv('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    truck: sv('<path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'),
    cash: sv('<rect x="2.5" y="6" width="19" height="12"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
    swap: sv('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
    chat: sv('<path d="M4 5.5h16v10H9l-5 4v-14Z"/><path d="M8 10h8M8 13h5"/>'),
    ig: sv('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>'),
    tk: sv('<path d="M13.5 3.5v11a3.7 3.7 0 1 1-3.4-3.7"/><path d="M13.5 3.5c.4 2.7 2.3 4.5 5.2 4.7"/>'),
    mail: sv('<rect x="3" y="5.5" width="18" height="13"/><path d="m3.5 7 8.5 6 8.5-6"/>'),
    wa: '<svg class="wa-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41Z"/></svg>',
  };
  const btnIco = `<span class="btn__ico">${I.arrow}${I.arrow}</span>`;
  const waLink = text => `https://wa.me/${String(CFG.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

  /* abre WhatsApp; si el navegador bloquea la ventana, deja un enlace visible */
  function openWA(url, fallbackEl) {
    let w = null;
    try { w = window.open(url, '_blank'); } catch (e) { w = null; }
    if (w) { try { w.opener = null; } catch (e) { /* nada */ } }
    if (fallbackEl) { fallbackEl.href = url; fallbackEl.hidden = false; }
    return !!w;
  }

  /* =====================================================================
     Estructura compartida
     ===================================================================== */
  function injectChrome() {
    const n = PRODUCTS.length;
    const tbItems = [CFG.pago || 'Pago contraentrega', CFG.envio || 'Envíos a toda Colombia', CFG.cambios || 'Cambios de talla', 'Pedidos por WhatsApp', `${n} modelos · Tallas ${adultSizes()}${PRODUCTS.some(p => p.genero === 'Niños') ? ' y niños' : ''}`]
      .map(t => `<span class="tb__item"><span class="dot"></span>${esc(t)}</span>`).join('');
    const nav = [['tienda.html', 'Tienda', 'shop'], ['colecciones.html', 'Colecciones', 'collections'], ['marcas.html', 'Marcas', 'brands'], ['lookbook.html', 'Lookbook', 'lookbook']];
    const big = [
      ['index.html', 'Inicio', 'img/products/j4-negro-1.jpg'], ['tienda.html', 'Tienda', 'img/products/numeris-azul-1.jpg'],
      ['novedades.html', 'Novedades', 'img/products/nocta-negro-1.jpg'], ['hombre.html', 'Hombre', 'img/products/numeris-negro-1.jpg'],
      ['mujer.html', 'Mujer', 'img/products/dunk-panda-1.jpg'], ...(PRODUCTS.some(p => p.genero === 'Niños') ? [['ninos.html', 'Niños', 'img/products/jordan-ninos-1.jpg']] : []), ['colecciones.html', 'Colecciones', 'img/products/nocta-blanco-1.jpg'],
      ['marcas.html', 'Marcas', 'img/products/samba-2.jpg'], ['lookbook.html', 'Lookbook', 'img/products/lv-skate-black-4.jpg'],
      ['nosotros.html', 'Nosotros', 'img/products/j3-black-2.jpg'], ['contacto.html', 'Contacto', 'img/products/suede-xl-1.jpg'],
    ];
    const igA = CFG.instagram ? `<a href="${esc(CFG.instagram)}" target="_blank" rel="noopener">Instagram</a>` : '';
    const tkA = CFG.tiktok ? `<a href="${esc(CFG.tiktok)}" target="_blank" rel="noopener">TikTok</a>` : '';
    document.body.insertAdjacentHTML('afterbegin', `
      <div class="grain" aria-hidden="true"></div>
      <div class="progress" aria-hidden="true"></div>
      <div class="cur" aria-hidden="true"><div class="cur__dot"></div><div class="cur__label"></div></div>
      <div class="fimg" aria-hidden="true"><img alt=""></div>
      <div class="pl" aria-hidden="true">
        <div class="pl__meta mono"><span>Obsidian — Colección 2026</span><span id="plCount">000</span></div>
        <div class="pl__frame">${['numeris-azul-1', 'j4-negro-1', 'lv-skate-black-1', 'samba-1', 'shox-negro-1', 'asics-plateado-1', 'j3-black-1', 'j1-patent-1', 'af1-white-5'].map((s, i) => `<img src="${u(`img/products/${s}.jpg`)}" alt=""${i ? '' : ' class="on"'}>`).join('')}</div>
        <div class="pl__word">${'Obsidian'.split('').map(c => `<span>${c}</span>`).join('')}</div>
      </div>
      <div class="tr" aria-hidden="true"><div class="tr__panel"><div class="tr__line"></div><div class="tr__inner"><img class="tr__logo" src="${u('img/logo/obsidian-logo-sm.webp')}" alt=""><p class="tr__title"><span id="trTitle">${esc(body.dataset.title || 'Obsidian')}</span></p><p class="mono muted">${esc(CFG.dominio || '')}</p></div></div></div>
      <div class="tb mono" aria-label="Información de compra"><div class="tb__track"><div class="tb__group">${tbItems}</div><div class="tb__group" aria-hidden="true">${tbItems}</div></div></div>
      <header class="hd" id="top">
        <div class="wrap hd__in">
          <nav class="hd__nav mono" aria-label="Principal">${nav.map(([h, l, k]) => `<a class="hd__a${SECTION === k ? ' is-on' : ''}" href="${u(h)}"${SECTION === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
          <a class="hd__brand" href="${u('index.html')}" aria-label="OBSIDIAN, inicio"><img src="${u('img/logo/obsidian-logo-sm.webp')}" alt="" width="38" height="38"><span class="hd__word">Obsidian</span></a>
          <div class="hd__act mono">
            <button class="hd__btn hd__search" type="button" data-search-open>Buscar</button>
            <button class="hd__btn" type="button" data-bag-open aria-label="Abrir bolsa">Bolsa <b class="bag-n">0</b></button>
            <button class="hd__btn hd__menu" type="button" data-menu-toggle aria-expanded="false" aria-controls="menu"><i></i><span>Menú</span></button>
          </div>
        </div>
      </header>
      <div class="mn" id="menu" aria-hidden="true">
        <div class="marble"></div>
        <button class="mn__close mono" type="button" data-menu-toggle>Cerrar ${I.x}</button>
        <div class="mn__scroll" data-lenis-prevent>
          <nav class="mn__main" aria-label="Menú">${big.map(([h, l], i) => `<a class="mn__big${PAGE_TITLES[location.pathname.split('/').pop()] === l ? ' is-on' : ''}" href="${u(h)}" data-pv="${i}"><span>${l}</span><small>${pad(i + 1)}</small></a>`).join('')}</nav>
          <div class="mn__cols mono">
            <div class="mn__group"><h4>Colecciones</h4>${Object.entries(COLLECTIONS).map(([k, c]) => `<a href="${colUrl(k)}">${c.name}</a>`).join('')}</div>
            <div class="mn__group"><h4>Marcas</h4>${brands().map(([b]) => `<a href="${brandUrl(b)}">${esc(b)}</a>`).join('')}</div>
            <div class="mn__group"><h4>Ayuda</h4>${HELP.map(([h, l]) => `<a href="${u(h)}">${l}</a>`).join('')}</div>
          </div>
          <div class="mn__preview">${big.map(([, , img], i) => `<img src="${u(img)}" alt=""${i ? '' : ' class="on"'} loading="lazy">`).join('')}</div>
          <div class="mn__foot mono"><a data-wa href="#">WhatsApp</a>${igA}${tkA}<span>${esc(CFG.dominio || '')}</span></div>
        </div>
      </div>
      <div class="sr" id="search" aria-hidden="true">
        <div class="sr__bg" data-search-close></div>
        <div class="sr__panel" data-lenis-prevent>
          <div class="wrap">
            <div class="sr__top mono"><span>Buscar en ${n} modelos</span><button class="sr__close" type="button" data-search-close>Cerrar ${I.x}</button></div>
            <form id="srForm" role="search"><label class="sr-only" for="srInput">Buscar un modelo</label><input class="sr__input" id="srInput" type="search" placeholder="Air Force, Samba, negro…" autocomplete="off"></form>
            <div class="sr__res" id="srRes"></div>
            <p class="sr__hint mono muted" id="srHint">Escribe una marca, un modelo o un color.</p>
          </div>
        </div>
      </div>`);

    document.body.insertAdjacentHTML('beforeend', `${reviewsSectionHTML()}
      <footer class="ft is-dark">
        <div class="marble" style="opacity:.22"></div>
        <div class="wrap">
          <div class="ft__cta"><h2 class="s-lg" data-split>¿Te ayudamos con tu <em>talla</em>?</h2><a class="btn btn--snow" data-wa href="#">${I.wa} Escríbenos</a></div>
          <div class="ft__grid mono">
            <div class="ft__brand"><img src="${u('img/logo/obsidian-logo-sm.webp')}" alt="" width="64" height="64"><p class="ft__about">Sneakers seleccionados para quienes caminan distinto. ${esc(CFG.pago || '')}${CFG.envio ? ' · ' + esc(CFG.envio) : ''}.</p></div>
            <div><h4>Tienda</h4><ul class="ft__list"><li><a href="${u('tienda.html')}">Todo el catálogo</a></li><li><a href="${u('novedades.html')}">Novedades</a></li><li><a href="${u('hombre.html')}">Hombre</a></li><li><a href="${u('mujer.html')}">Mujer</a></li>${PRODUCTS.some(p => p.genero === 'Niños') ? `<li><a href="${u('ninos.html')}">Niños</a></li>` : ''}<li><a href="${u('lookbook.html')}">Lookbook</a></li><li><a href="${u('nosotros.html')}">Nosotros</a></li></ul></div>
            <div><h4>Colecciones</h4><ul class="ft__list">${Object.entries(COLLECTIONS).map(([k, c]) => `<li><a href="${colUrl(k)}">${c.name}</a></li>`).join('')}<li><a href="${u('colecciones.html')}">Ver todas</a></li></ul></div>
            <div><h4>Marcas</h4><ul class="ft__list">${brands().map(([b]) => `<li><a href="${brandUrl(b)}">${esc(b)}</a></li>`).join('')}</ul></div>
            <div><h4>Ayuda</h4><ul class="ft__list">${HELP.map(([h, l]) => `<li><a href="${u(h)}">${l}</a></li>`).join('')}</ul></div>
          </div>
        </div>
        <div class="ft__giant" aria-hidden="true"><span class="chrome">Obsidian</span></div>
        <div class="wrap ft__bottom mono"><span>© ${new Date().getFullYear()} OBSIDIAN · ${esc(CFG.dominio || '')}</span><a href="${u('privacidad.html')}">Privacidad</a>${igA}${tkA}<a href="#top" data-top>Volver arriba ↑</a></div>
      </footer>
      <div class="dw" id="bag" aria-hidden="true">
        <div class="dw__bg" data-bag-close></div>
        <aside class="dw__panel" role="dialog" aria-modal="true" aria-label="Bolsa de compras">
          <div class="dw__head"><p class="dw__title">Tu <em>bolsa</em></p><button class="dw__close mono" type="button" data-bag-close>Cerrar ${I.x}</button></div>
          <div class="dw__body" data-lenis-prevent></div>
          <div class="dw__foot"></div>
        </aside>
      </div>
      <div class="toast" role="status" aria-live="polite"><img alt="" hidden><span class="mono"></span></div>${reviewsModalHTML()}`);
  }

  function applyConfig() {
    $$('.btn__ico:empty').forEach(el => { el.innerHTML = I.arrow + I.arrow; });
    $$('i[data-icon]').forEach(el => { if (I[el.dataset.icon]) el.outerHTML = I[el.dataset.icon]; });
    const msg = 'Hola OBSIDIAN 👋 Quiero información sobre sus tenis.';
    $$('[data-wa]').forEach(a => { a.href = waLink(a.dataset.wa || msg); a.target = '_blank'; a.rel = 'noopener'; });
    $$('[data-ig]').forEach(a => {
      if (CFG.instagram) { a.href = CFG.instagram; a.target = '_blank'; a.rel = 'noopener'; return; }
      (a.closest('[data-ig-wrap]') || a).remove();
    });
    $$('[data-cfg]').forEach(el => { const v = CFG[el.dataset.cfg]; if (v) el.textContent = v; });
    $$('[data-n="models"]').forEach(el => { el.textContent = PRODUCTS.length; });
    $$('[data-n="brands"]').forEach(el => { el.textContent = brands().length; });
    $$('[data-price-of]').forEach(el => { const p = bySlug[el.dataset.priceOf]; if (p) el.textContent = fmt(p.precio); });
  }

  /* =====================================================================
     Reseñas de clientes (al final de todas las páginas)
     Se guardan en la hoja de Google (pestaña Resenas) y las fotos y videos en tu Drive.
     Solo aparecen las que apruebas en el panel. Sin reseñas, invita a dejar la primera.
     ===================================================================== */
  const RV_CACHE = 'obs-rv-v1';
  const RV_MAX_FOTOS = 4, RV_MAX_VIDEO = 20 * 1024 * 1024, RV_MAX_FOTO = 5 * 1024 * 1024;
  const driveImg = (id, w = 900) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
  const driveVideo = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  const starsHTML = n => `<span class="rv-stars" role="img" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(n) ? 'is-on' : ''}">${STAR}</i>`).join('')}</span>`;
  const rvDate = v => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const rvPlay = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

  function reviewsSectionHTML() {
    return `
      <section class="rv" id="resenas" aria-labelledby="rvTitle">
        <div class="wrap">
          <div class="rv__head">
            <div><p class="mono muted">Lo que dicen nuestros clientes</p><h2 class="s-lg" id="rvTitle">Rese<em>ñas</em></h2></div>
            <div class="rv__sum" id="rvSum"></div>
          </div>
          <div class="rv__list" id="rvList"><p class="mono muted">Cargando reseñas…</p></div>
          <div class="rv__more"><button class="btn btn--line btn--sm" type="button" id="rvMore" hidden>Ver más reseñas ${btnIco}</button></div>
          <div class="rv__cta">
            <div><p class="rv__cta-t">¿Ya tienes tus <em>tenis</em>?</p><p class="mono muted">Cuéntanos cómo te fue. Puedes subir fotos y un video.</p></div>
            <button class="btn" type="button" data-rv-open>Escribir una reseña ${btnIco}</button>
          </div>
        </div>
      </section>`;
  }

  function reviewsModalHTML() {
    const opts = [...PRODUCTS].sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'))
      .map(p => `<option value="${esc(p.id)}">${esc(fullName(p))} · ${esc(p.color)}</option>`).join('');
    return `
      <div class="rvm" id="rvModal" aria-hidden="true">
        <div class="rvm__bg" data-rv-close></div>
        <div class="rvm__box" role="dialog" aria-modal="true" aria-labelledby="rvmTitle" data-lenis-prevent>
          <div class="rvm__head"><p class="rvm__title" id="rvmTitle">Tu <em>reseña</em></p><button class="dw__close mono" type="button" data-rv-close>Cerrar ${I.x}</button></div>
          <form class="form rvm__form" id="rvForm" novalidate>
            <div class="field full"><span class="mono muted">Calificación</span>
              <div class="rv-rate" id="rvRate" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map(i => `<button type="button" role="radio" aria-checked="false" aria-label="${i} ${i === 1 ? 'estrella' : 'estrellas'}" data-rate="${i}">${STAR}</button>`).join('')}</div>
            </div>
            <div class="field"><label class="mono" for="rvNombre">Tu nombre</label><input id="rvNombre" name="nombre" maxlength="40" autocomplete="name" required></div>
            <div class="field"><label class="mono" for="rvCiudad">Ciudad</label><input id="rvCiudad" name="ciudad" maxlength="40" autocomplete="address-level2"></div>
            <div class="field full"><label class="mono" for="rvProd">¿Qué tenis compraste?</label><select id="rvProd" name="producto"><option value="">Elige el modelo (opcional)</option>${opts}</select></div>
            <div class="field full"><label class="mono" for="rvTexto">Tu opinión</label><textarea id="rvTexto" name="texto" rows="4" maxlength="1000" required placeholder="¿Cómo te llegaron? ¿Te quedó bien la talla? ¿Qué tal la calidad?"></textarea></div>
            <div class="field full"><span class="mono muted">Fotos y video (opcional)</span>
              <div class="rv-up">
                <label class="chip mono">+ Fotos (hasta ${RV_MAX_FOTOS})<input type="file" id="rvFotos" accept="image/*" multiple hidden></label>
                <label class="chip mono">+ Un video (máx. 20 MB)<input type="file" id="rvVideo" accept="video/*" hidden></label>
              </div>
              <div class="rv-prev" id="rvPrev"></div>
            </div>
            <div class="field full"><label class="mono" for="rvPedido">Número de pedido o celular (opcional, no se publica)</label><input id="rvPedido" name="pedido" maxlength="30" inputmode="text" autocomplete="off"></div>
            <div class="sr-only" aria-hidden="true"><label for="rvWeb">No llenar este campo</label><input id="rvWeb" name="website" tabindex="-1" autocomplete="off"></div>
            <p class="rv-err full" id="rvErr" role="alert"></p>
            <button class="btn btn--block full" type="submit" id="rvSend">Enviar reseña ${btnIco}</button>
            <p class="mono muted full">Revisamos cada reseña antes de publicarla. En la página solo aparece tu nombre con la inicial del apellido y tu ciudad.</p>
          </form>
          <div class="rvm__ok" id="rvOk" hidden>
            <div class="done__ico">${I.check}</div>
            <p class="rvm__title">¡Gracias por tu <em>reseña</em>!</p>
            <p id="rvOkTxt"></p>
            <button class="btn btn--line btn--sm" type="button" data-rv-close>Cerrar</button>
          </div>
        </div>
      </div>
      <div class="rvx" id="rvView" aria-hidden="true">
        <div class="rvx__bg" data-rvx-close></div>
        <div class="rvx__box" role="dialog" aria-modal="true" aria-label="Foto o video de la reseña">
          <button class="rvx__close mono" type="button" data-rvx-close>Cerrar ${I.x}</button>
          <div class="rvx__body" id="rvxBody"></div>
        </div>
      </div>`;
  }

  function initReviews() {
    const sec = $('#resenas'), list = $('#rvList'), sum = $('#rvSum'), more = $('#rvMore');
    if (!sec) return;
    const cur = bySlug[body.dataset.product] || null;
    let all = [], shown = 6;

    const card = r => {
      const p = byId[r.producto];
      const media = [...(r.fotos || []).map(id => `<button type="button" class="rv-m" data-rv-img="${esc(id)}" aria-label="Ver foto"><img src="${driveImg(id, 500)}" alt="Foto de ${esc(r.nombre)}" loading="lazy" onerror="this.parentNode.classList.add('is-err')"></button>`),
        ...(r.video ? [`<button type="button" class="rv-m rv-m--v" data-rv-vid="${esc(r.video)}" aria-label="Ver video"><img src="${driveImg(r.video, 500)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('is-err')">${rvPlay}</button>`] : [])].join('');
      return `<article class="rv-card${cur && r.producto === cur.id ? ' is-this' : ''}">
        <div class="rv-card__top">${starsHTML(r.estrellas)}<span class="mono muted">${rvDate(r.fecha)}</span></div>
        <p class="rv-card__txt">${esc(r.texto)}</p>
        ${media ? `<div class="rv-card__media">${media}</div>` : ''}
        <p class="rv-card__who"><b>${esc(r.nombre)}</b>${r.ciudad ? ` <span class="muted">· ${esc(r.ciudad)}</span>` : ''}</p>
        ${p ? `<a class="mono rv-card__prod" href="${productUrl(p)}">${cur && p.id === cur.id ? 'Este modelo' : 'Compró'}: ${esc(fullName(p))} · ${esc(p.color)}</a>` : (r.producto_nombre ? `<p class="mono muted">Compró: ${esc(r.producto_nombre)}</p>` : '')}
      </article>`;
    };

    const paint = () => {
      if (!all.length) {
        sum.innerHTML = '';
        list.innerHTML = `<div class="rv-empty"><p class="rv-empty__t">Aún no hay <em>reseñas</em></p><p class="muted">Sé el primero en contar cómo te llegaron tus tenis. Tu opinión ayuda a otros a comprar con confianza.</p></div>`;
        more.hidden = true;
        return;
      }
      const avg = all.reduce((a, r) => a + (Number(r.estrellas) || 0), 0) / all.length;
      sum.innerHTML = `<b class="rv__avg">${avg.toFixed(1).replace('.', ',')}</b><div>${starsHTML(avg)}<p class="mono muted">${all.length} ${all.length === 1 ? 'reseña' : 'reseñas'}</p></div>`;
      const ordered = cur ? [...all.filter(r => r.producto === cur.id), ...all.filter(r => r.producto !== cur.id)] : all;
      list.innerHTML = ordered.slice(0, shown).map(card).join('');
      more.hidden = ordered.length <= shown;
    };

    const fetchList = () => {
      const c = (() => { try { return JSON.parse(sess.get(RV_CACHE) || 'null'); } catch (e) { return null; } })();
      if (c && Date.now() - c.t < 5 * 60e3) { all = c.r; paint(); return; }
      if (!CFG.pedidosApi) { all = []; paint(); return; }
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 12000);
      fetch(CFG.pedidosApi, { method: 'POST', body: JSON.stringify({ accion: 'resenas' }), signal: ctl.signal })
        .then(r => r.json())
        .then(j => { all = j && j.ok && Array.isArray(j.resenas) ? j.resenas : []; sess.set(RV_CACHE, JSON.stringify({ t: Date.now(), r: all })); })
        .catch(() => { all = []; })
        .finally(paint);
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fetchList(); } }, { rootMargin: '900px 0px' });
      io.observe(sec);
    } else fetchList();
    more.addEventListener('click', () => { shown += 6; paint(); });

    /* ----- formulario ----- */
    const modal = $('#rvModal'), form = $('#rvForm'), err = $('#rvErr'), send = $('#rvSend'), prev = $('#rvPrev');
    let rating = 0, fotos = [], video = null;
    const setRate = n => { rating = n; $$('#rvRate [data-rate]').forEach(b => { const on = Number(b.dataset.rate) <= n; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(Number(b.dataset.rate) === n)); }); };
    const paintPrev = () => {
      prev.innerHTML = [...fotos.map((f, i) => `<div class="rv-th"><img src="${f.url}" alt=""><button type="button" data-rm-foto="${i}" aria-label="Quitar foto">${I.x}</button></div>`),
        ...(video ? [`<div class="rv-th rv-th--v"><video src="${video.url}" muted playsinline preload="metadata"></video>${rvPlay}<button type="button" data-rm-video aria-label="Quitar video">${I.x}</button></div>`] : [])].join('');
    };
    const reset = () => {
      form.reset(); setRate(0); fotos.forEach(f => URL.revokeObjectURL(f.url)); if (video) URL.revokeObjectURL(video.url);
      fotos = []; video = null; paintPrev(); err.textContent = ''; form.hidden = false; $('#rvOk').hidden = true;
    };
    const open = () => {
      reset();
      if (cur) $('#rvProd').value = cur.id;
      modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); lock();
      setTimeout(() => $('#rvRate [data-rate="5"]')?.focus(), 80);
    };
    const close = () => { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); unlock(); };

    $('#rvRate').addEventListener('click', e => { const b = e.target.closest('[data-rate]'); if (b) setRate(Number(b.dataset.rate)); });
    $('#rvFotos').addEventListener('change', e => {
      const files = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
      const room = RV_MAX_FOTOS - fotos.length;
      files.slice(0, room).forEach(f => fotos.push({ file: f, url: URL.createObjectURL(f) }));
      err.textContent = files.length > room ? `Puedes subir hasta ${RV_MAX_FOTOS} fotos.` : '';
      e.target.value = ''; paintPrev();
    });
    $('#rvVideo').addEventListener('change', e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (f.size > RV_MAX_VIDEO) { err.textContent = 'El video pesa más de 20 MB. Graba uno más corto (unos 15 segundos) y vuelve a intentar.'; return; }
      if (video) URL.revokeObjectURL(video.url);
      video = { file: f, url: URL.createObjectURL(f) }; err.textContent = ''; paintPrev();
    });
    prev.addEventListener('click', e => {
      const rf = e.target.closest('[data-rm-foto]'); if (rf) { const i = Number(rf.dataset.rmFoto); URL.revokeObjectURL(fotos[i].url); fotos.splice(i, 1); paintPrev(); return; }
      if (e.target.closest('[data-rm-video]')) { URL.revokeObjectURL(video.url); video = null; paintPrev(); }
    });

    /* fotos: se reducen a 1600 px en JPEG antes de enviarlas */
    const shrink = file => new Promise(res => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), 'image/jpeg', .84);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
    const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = '';
      const d = Object.fromEntries(new FormData(form));
      if (!rating) { err.textContent = 'Elige de 1 a 5 estrellas.'; return; }
      if (String(d.nombre || '').trim().length < 2) { err.textContent = 'Escribe tu nombre.'; $('#rvNombre').focus(); return; }
      if (String(d.texto || '').trim().length < 8) { err.textContent = 'Cuéntanos un poco más en tu opinión.'; $('#rvTexto').focus(); return; }
      if (!CFG.pedidosApi) { err.textContent = 'Por ahora no podemos recibir reseñas aquí. Escríbenos por WhatsApp.'; return; }
      send.disabled = true;
      const label = send.firstChild; const old = label.textContent;
      try {
        label.textContent = fotos.length || video ? 'Subiendo fotos y video… ' : 'Enviando… ';
        const fotosB = [];
        for (const f of fotos) {
          const b = await shrink(f.file);
          if (b.size > RV_MAX_FOTO) continue;
          fotosB.push({ tipo: b.type || f.file.type || 'image/jpeg', datos: await b64(b) });
        }
        const vid = video ? { tipo: video.file.type || 'video/mp4', datos: await b64(video.file) } : null;
        const p = byId[d.producto];
        const payload = { accion: 'resenaCrear', website: d.website || '', resena: {
          estrellas: rating, nombre: String(d.nombre).trim(), ciudad: String(d.ciudad || '').trim(), texto: String(d.texto).trim(),
          producto: p ? p.id : '', producto_nombre: p ? `${fullName(p)} · ${p.color}` : '', pedido: String(d.pedido || '').trim(),
          origen: location.pathname, fotos: fotosB, video: vid } };
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 180000);
        const r = await fetch(CFG.pedidosApi, { method: 'POST', body: JSON.stringify(payload), signal: ctl.signal });
        clearTimeout(t);
        const j = await r.json();
        if (!j || !j.ok) throw new Error((j && j.error) || 'error');
        form.hidden = true; $('#rvOk').hidden = false;
        $('#rvOkTxt').textContent = `${String(d.nombre).trim().split(' ')[0]}, recibimos tu reseña${j.fotos && j.video ? ' con tus fotos y tu video' : j.fotos ? (j.fotos > 1 ? ' con tus fotos' : ' con tu foto') : j.video ? ' con tu video' : ''}. La publicamos apenas la revisemos.`;
      } catch (ex) {
        err.innerHTML = `No pudimos enviar tu reseña${video ? ' (si el video es muy pesado, prueba sin él)' : ''}. Intenta de nuevo o <a class="link" href="${waLink('Hola OBSIDIAN 👋 Quiero dejar una reseña de mi compra.')}" target="_blank" rel="noopener">mándanosla por WhatsApp</a>.`;
      } finally {
        send.disabled = false; label.textContent = old;
      }
    });

    /* ----- visor de fotos y videos ----- */
    const view = $('#rvView'), vbody = $('#rvxBody');
    const openView = html => { vbody.innerHTML = html; view.classList.add('is-open'); view.setAttribute('aria-hidden', 'false'); lock(); };
    const closeView = () => { view.classList.remove('is-open'); view.setAttribute('aria-hidden', 'true'); vbody.innerHTML = ''; if (!modal.classList.contains('is-open')) unlock(); };

    document.addEventListener('click', e => {
      if (e.target.closest('[data-rv-open]')) { open(); return; }
      if (e.target.closest('[data-rv-close]')) { close(); return; }
      if (e.target.closest('[data-rvx-close]')) { closeView(); return; }
      const im = e.target.closest('[data-rv-img]'); if (im) { openView(`<img src="${driveImg(im.dataset.rvImg, 1600)}" alt="Foto de la reseña">`); return; }
      const vd = e.target.closest('[data-rv-vid]'); if (vd) openView(`<iframe src="${driveVideo(vd.dataset.rvVid)}" allow="autoplay; fullscreen" allowfullscreen title="Video de la reseña"></iframe>`);
    });
    addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (view.classList.contains('is-open')) closeView(); else if (modal.classList.contains('is-open')) close();
    });
    if (location.hash === '#escribir-resena') setTimeout(open, 600);
  }

  /* =====================================================================
     Bolsa (carrito)
     ===================================================================== */
  const CART_KEY = 'obs-cart-v1';
  const Cart = {
    items: [],
    load() { this.items = (store.get(CART_KEY, []) || []).filter(i => byId[i.id] && i.qty > 0); },
    save() { store.set(CART_KEY, this.items); renderBag(); },
    add(id, talla, qty = 1, color = '', foto = 0) {
      const f = this.items.find(i => i.id === id && i.talla === talla && (i.color || '') === color);
      if (f) f.qty = Math.min(10, f.qty + qty); else this.items.push({ id, talla, qty: Math.min(10, qty), ...(color ? { color, foto } : {}) });
      this.save();
    },
    setQty(i, q) { if (!this.items[i]) return; if (q <= 0) this.items.splice(i, 1); else this.items[i].qty = Math.min(10, q); this.save(); },
    remove(i) { this.items.splice(i, 1); this.save(); },
    clear() { this.items = []; this.save(); },
    count() { return this.items.reduce((a, i) => a + i.qty, 0); },
    total() { return this.items.reduce((a, i) => a + byId[i.id].precio * i.qty, 0); },
  };
  Cart.load();
  addEventListener('storage', e => { if (e.key === CART_KEY) { Cart.load(); renderBag(); } });

  const lineHTML = (it, idx) => {
    const p = byId[it.id];
    return `<div class="ln" data-idx="${idx}">
      <a class="ln__img" href="${productUrl(p)}"><img src="${u(p.imagenes[(it.foto || 1) - 1] || p.imagenes[0])}" alt="${esc(fullName(p))}" width="520" height="650"></a>
      <div>
        <p class="mono muted">${esc(p.marca)} · N.º ${pad(p.n)}</p>
        <a class="ln__name" href="${productUrl(p)}">${esc(p.nombre)}</a>
        <p class="mono">Talla ${it.talla} · ${esc(it.color || p.color)}</p>
        <div class="qty qty--sm"><button type="button" data-act="dec" aria-label="Quitar uno">−</button><output>${it.qty}</output><button type="button" data-act="inc" aria-label="Agregar uno">+</button></div>
      </div>
      <div class="ln__r"><span class="mono">${fmt(p.precio * it.qty)}</span><button type="button" class="ln__rm mono" data-act="rm">Quitar</button></div>
    </div>`;
  };
  const emptyBagHTML = `<div class="bag-empty"><div class="arch"><img src="${u('img/logo/obsidian-logo-sm.webp')}" alt=""></div><h3>Tu bolsa está <em>vacía</em></h3><p>Todavía no has elegido tu próximo par.</p><a class="btn" href="${u('tienda.html')}">Ir a la tienda ${btnIco}</a></div>`;

  function renderBag() {
    const n = Cart.count();
    $$('.bag-n').forEach(b => { b.textContent = n; });
    const bd = $('.dw__body'), ft = $('.dw__foot');
    if (bd) {
      if (!Cart.items.length) { bd.innerHTML = emptyBagHTML; ft.innerHTML = ''; ft.hidden = true; }
      else {
        ft.hidden = false;
        bd.innerHTML = Cart.items.map(lineHTML).join('');
        ft.innerHTML = `<div class="tot"><span class="mono">Subtotal · ${n} ${n === 1 ? 'par' : 'pares'}</span><b>${fmt(Cart.total())}</b></div>
          <p class="mono muted">${cartCOD() ? 'Pago contraentrega' : 'Pago anticipado por transferencia'}. El envío se confirma por WhatsApp.</p>
          <a class="btn btn--block" href="${u('carrito.html')}">Finalizar pedido ${btnIco}</a>
          <button class="btn btn--line btn--block btn--sm" type="button" data-bag-close>Seguir comprando</button>`;
      }
    }
    document.dispatchEvent(new CustomEvent('cart:change'));
  }
  const bump = () => $$('.bag-n').forEach(b => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });

  function bindLines(container) {
    container?.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const ln = b.closest('.ln'), i = Number(ln.dataset.idx), it = Cart.items[i]; if (!it) return;
      if (b.dataset.act === 'inc') Cart.setQty(i, it.qty + 1);
      else if (b.dataset.act === 'dec' && it.qty > 1) Cart.setQty(i, it.qty - 1);
      else removeLine(ln, i);
    });
  }
  function removeLine(ln, i) {
    if (!ANIM) { Cart.remove(i); return; }
    gsap.to(ln, { x: 50, opacity: 0, duration: .35, ease: 'power2.in', onComplete: () => gsap.to(ln, { height: 0, paddingTop: 0, paddingBottom: 0, duration: .3, onComplete: () => Cart.remove(i) }) });
  }

  let lenis = null;
  const lock = () => lenis?.stop(), unlock = () => lenis?.start();
  function openBag() {
    const d = $('#bag'); if (!d || d.classList.contains('is-open')) return;
    closeMenu(); closeSearch();
    d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false'); lock();
    if (ANIM) gsap.fromTo($$('.dw__body > *'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .06, delay: .3, ease: 'expo.out' });
    setTimeout(() => $('#bag .dw__close')?.focus(), 60);
  }
  function closeBag() { const d = $('#bag'); if (!d?.classList.contains('is-open')) return; d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); unlock(); }

  function flyToBag(img) {
    $('.hd')?.classList.remove('is-hidden');
    const t = $('.hd [data-bag-open]');
    if (!ANIM || !img || !t) { bump(); return; }
    const r = img.getBoundingClientRect(); if (!r.width) { bump(); return; }
    const f = document.createElement('div'); f.className = 'fly';
    f.innerHTML = `<img src="${img.currentSrc || img.src}" alt="">`;
    Object.assign(f.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    document.body.appendChild(f);
    requestAnimationFrame(() => {
      const tr = t.getBoundingClientRect();
      gsap.timeline({ onComplete: () => { f.remove(); bump(); } })
        .to(f, { left: tr.left + tr.width / 2 - 14, top: tr.top + tr.height / 2 - 18, width: 28, height: 36, duration: .95, ease: 'expo.inOut' })
        .to(f, { opacity: 0, duration: .2 });
    });
  }

  let toastT;
  function toast(text, img) {
    const t = $('.toast'); if (!t) return;
    $('span', t).textContent = text;
    const im = $('img', t); if (img) { im.src = img; im.hidden = false; } else im.hidden = true;
    t.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2800);
  }

  /* =====================================================================
     Tarjetas y filas de producto
     ===================================================================== */
  function cardHTML(p) {
    const name = esc(fullName(p));
    const tag = p.agotado ? 'Agotado' : p.etiqueta;
    const quick = p.agotado || p.colores?.length ? '' : `<div class="card__q"><p class="mono">Agregar talla</p><div>${p.tallas.map(t => `<button type="button" data-size="${t}">${t}</button>`).join('')}</div></div>
      <button class="card__plus" type="button" aria-label="Elegir talla de ${name}" aria-expanded="false">${I.plus}</button>`;
    return `<article class="card${p.agotado ? ' is-out' : ''}" data-id="${esc(p.id)}">
      <div class="card__media">
        <a class="card__link" href="${productUrl(p)}" data-cursor="Ver pieza" aria-label="${name}">
          <img class="card__img card__img--a" src="${u(p.imagenes[0])}" alt="${name}" loading="lazy" width="520" height="650">
          <img class="card__img card__img--b" src="${u(p.imagenes[1] || p.imagenes[0])}" alt="" loading="lazy" width="520" height="650">
        </a>
        <span class="card__no mono">N.º ${pad(p.n)}</span>
        ${tag ? `<span class="tag card__tag">${esc(tag)}</span>` : ''}
        ${quick}
      </div>
      <div class="card__meta"><p class="mono">${esc(p.marca)}</p><h3 class="card__name"><a href="${productUrl(p)}">${esc(p.nombre)}</a></h3><span class="card__price" data-price-of="${p.slug}">${fmt(p.precio)}</span><p class="card__color">${esc(colorLabel(p))}</p></div>
    </article>`;
  }
  const rowHTML = p => `<a class="irow${p.agotado ? ' is-out' : ''}" href="${productUrl(p)}" data-id="${esc(p.id)}" data-hover-img="${u(p.imagenes[0])}">
    <span class="mono">${pad(p.n)}</span><span class="mono c-brand">${esc(p.marca)}</span><span class="serif">${esc(p.nombre)}</span><span class="mono c-color muted">${esc(colorLabel(p))}</span><span class="mono c-sizes">${sizeRange(p)}</span>${p.agotado ? '<span class="mono">Agotado</span>' : `<span class="mono" data-price-of="${p.slug}">${fmt(p.precio)}</span>`}${I.arrowUR}</a>`;

  document.addEventListener('click', e => {
    const plus = e.target.closest('.card__plus');
    if (plus) {
      const c = plus.closest('.card'), open = !c.classList.contains('is-open');
      $$('.card.is-open').forEach(x => { x.classList.remove('is-open'); $('.card__plus', x)?.setAttribute('aria-expanded', 'false'); });
      c.classList.toggle('is-open', open); plus.setAttribute('aria-expanded', String(open));
      return;
    }
    const sz = e.target.closest('.card__q button');
    if (sz) {
      const c = sz.closest('.card'), p = byId[c.dataset.id], t = Number(sz.dataset.size);
      Cart.add(p.id, t); c.classList.remove('is-open');
      flyToBag($('.card__img--a', c));
      toast(`${fullName(p)} · talla ${t} en tu bolsa`, u(p.imagenes[0]));
      return;
    }
    if (!e.target.closest('.card__q')) $$('.card.is-open').forEach(x => x.classList.remove('is-open'));
  });

  /* =====================================================================
     Menú, buscador, acordeones, header
     ===================================================================== */
  let menuOpen = false;
  function openMenu(btn) {
    const r = (btn || $('.hd__menu')).getBoundingClientRect();
    const m = $('#menu');
    m.style.setProperty('--mx', (r.left + r.width / 2) + 'px'); m.style.setProperty('--my', (r.top + r.height / 2) + 'px');
    menuOpen = true; html.classList.add('menu-open'); m.setAttribute('aria-hidden', 'false');
    $$('[data-menu-toggle]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    closeBag(); closeSearch(); lock();
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false; html.classList.remove('menu-open'); $('#menu')?.setAttribute('aria-hidden', 'true');
    $$('[data-menu-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false')); unlock();
  }

  function openSearch() {
    const s = $('#search'); if (!s) return;
    closeMenu(); closeBag();
    s.classList.add('is-open'); s.setAttribute('aria-hidden', 'false'); lock();
    setTimeout(() => $('#srInput')?.focus(), 350);
  }
  function closeSearch() { const s = $('#search'); if (!s?.classList.contains('is-open')) return; s.classList.remove('is-open'); s.setAttribute('aria-hidden', 'true'); unlock(); }
  function runSearch(q) {
    const nq = norm(q).trim(), res = $('#srRes'), hint = $('#srHint');
    if (!nq) { res.innerHTML = ''; hint.textContent = 'Escribe una marca, un modelo o un color.'; return; }
    const terms = nq.split(/\s+/);
    const list = PRODUCTS.filter(p => { const h = norm(`${fullName(p)} ${p.marca} ${p.color} ${p.etiqueta} ${(p.colecciones || []).join(' ')}`); return terms.every(t => h.includes(t)); });
    res.innerHTML = list.slice(0, 8).map(p => `<a class="sr__item" href="${productUrl(p)}"><img src="${u(p.imagenes[0])}" alt=""><span><span class="mono muted">${esc(p.marca)} · ${fmt(p.precio)}</span><br><span class="serif">${esc(p.nombre)}</span></span></a>`).join('');
    hint.innerHTML = list.length ? `${list.length} ${list.length === 1 ? 'resultado' : 'resultados'} · <a class="link" href="${u('tienda.html')}?q=${encodeURIComponent(q.trim())}">Ver todos en la tienda</a>` : 'Sin resultados. Prueba con otra palabra.';
  }

  function initAccordions(root = document) {
    $$('.acc__btn', root).forEach(btn => {
      if (btn._acc) return; btn._acc = 1;
      const item = btn.closest('.acc__item'), panel = $('.acc__panel', item);
      btn.setAttribute('aria-expanded', item.classList.contains('is-open'));
      if (item.classList.contains('is-open')) panel.style.height = 'auto';
      btn.addEventListener('click', () => {
        const open = !item.classList.contains('is-open');
        panel.style.height = panel.scrollHeight + 'px';
        if (!open) { void panel.offsetHeight; panel.style.height = '0px'; }
        item.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', open);
        const done = () => { if (open) panel.style.height = 'auto'; panel.removeEventListener('transitionend', done); if (ANIM) ScrollTrigger.refresh(); };
        panel.addEventListener('transitionend', done);
      });
    });
  }

  function initUI() {
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-menu-toggle]')) { e.preventDefault(); menuOpen ? closeMenu() : openMenu(t.closest('[data-menu-toggle]')); return; }
      if (t.closest('[data-bag-open]')) { e.preventDefault(); openBag(); return; }
      if (t.closest('[data-bag-close]')) { e.preventDefault(); closeBag(); return; }
      if (t.closest('[data-search-open]')) { e.preventDefault(); openSearch(); return; }
      if (t.closest('[data-search-close]')) { e.preventDefault(); closeSearch(); return; }
      if (t.closest('[data-top]')) { e.preventDefault(); lenis ? lenis.scrollTo(0, { duration: 1.8 }) : scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeBag(); closeMenu(); closeSearch(); }
      if (e.key === '/' && !e.target.closest('input, textarea, select')) { e.preventDefault(); openSearch(); }
    });
    bindLines($('.dw__body'));
    $('#srInput')?.addEventListener('input', e => runSearch(e.target.value));
    $('#srForm')?.addEventListener('submit', e => { e.preventDefault(); const q = $('#srInput').value.trim(); if (q) go(`${u('tienda.html')}?q=${encodeURIComponent(q)}`); });

    /* vista previa de imágenes en el menú */
    $$('.mn__big').forEach(a => a.addEventListener('pointerenter', () => {
      $$('.mn__preview img').forEach((im, i) => im.classList.toggle('on', i === Number(a.dataset.pv)));
    }));

    /* header: esconder al bajar, barra de progreso */
    const hd = $('.hd'), bar = $('.progress');
    let lastY = scrollY, tick = false;
    const onScroll = () => {
      const y = scrollY;
      if (!menuOpen) {
        if (y > lastY + 6 && y > 400) { hd.classList.add('is-hidden'); html.classList.add('hd-hidden'); }
        else if (y < lastY - 6 || y < 400) { hd.classList.remove('is-hidden'); html.classList.remove('hd-hidden'); }
      }
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      lastY = y; tick = false;
    };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    /* precarga de páginas al pasar el mouse */
    const pre = new Set();
    document.addEventListener('pointerover', e => {
      const a = e.target.closest('a[href]'); if (!a) return;
      let url; try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || pre.has(url.pathname) || url.pathname === location.pathname) return;
      pre.add(url.pathname);
      const l = document.createElement('link'); l.rel = 'prefetch'; l.href = url.pathname; document.head.appendChild(l);
    }, { passive: true });
  }

  /* imagen flotante que sigue al cursor (índices, marcas) */
  function initHoverImages() {
    if (!FINE) return;
    const box = $('.fimg'), img = $('img', box);
    const xTo = ANIM ? gsap.quickTo(box, 'x', { duration: .6, ease: 'power3' }) : v => { box.style.left = v + 'px'; };
    const yTo = ANIM ? gsap.quickTo(box, 'y', { duration: .6, ease: 'power3' }) : v => { box.style.top = v + 'px'; };
    let cur = null;
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-hover-img]');
      if (el === cur) return;
      cur = el;
      if (!el) { box.classList.remove('is-on'); return; }
      if (img.getAttribute('src') !== el.dataset.hoverImg) img.src = el.dataset.hoverImg;
      box.classList.add('is-on');
    });
    addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
  }

  /* =====================================================================
     Transiciones entre páginas + preloader
     ===================================================================== */
  function titleFor(url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const file = parts.pop() || 'index.html', dir = parts.pop() || '';
    const slug = file.replace(/\.html$/, '');
    if (dir === 'productos' && bySlug[slug]) return bySlug[slug].nombre;
    if (dir === 'marcas') return brands().find(([b]) => slugify(b) === slug)?.[0] || 'Marcas';
    if (dir === 'colecciones' && COLLECTIONS[slug]) return COLLECTIONS[slug].name;
    return PAGE_TITLES[file] || 'Obsidian';
  }
  let leaving = false;
  function go(href) {
    let url; try { url = new URL(href, location.href); } catch (e) { location.href = href; return; }
    if (!ANIM) { location.href = url.href; return; }
    if (leaving) return; leaving = true;
    const title = titleFor(url);
    sess.set('obs-tt', title);
    $('#trTitle').textContent = title;
    gsap.set('.tr', { visibility: 'visible' });
    gsap.timeline({ onComplete: () => { location.href = url.href; } })
      .set('.tr__panel', { yPercent: 100 })
      .set('.tr__title span', { yPercent: 110 })
      .set('.tr__logo', { opacity: 0, rotate: -90 })
      .to('.tr__panel', { yPercent: 0, duration: .85, ease: 'expo.inOut' })
      .to('.tr__line', { scaleX: 1, duration: .7, ease: 'expo.inOut' }, '-=.55')
      .to('.tr__title span', { yPercent: 0, duration: .7, ease: 'expo.out' }, '-=.45')
      .to('.tr__logo', { opacity: 1, rotate: 0, duration: .6, ease: 'expo.out' }, '<');
  }
  addEventListener('pageshow', e => {
    if (!e.persisted) return;
    leaving = false;
    if (ANIM) gsap.set('.tr', { visibility: 'hidden' });
    html.classList.remove('is-nav', 'is-first', 'cover');
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return;
    let url; try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || !/^(https?|file):$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) { e.preventDefault(); closeMenu(); scrollToHash(url.hash); }
      return;
    }
    if (!ANIM) return;
    e.preventDefault(); closeMenu(); closeBag(); closeSearch(); go(url.href);
  });
  function scrollToHash(hash) {
    let el = null; try { el = document.querySelector(hash); } catch (e) { el = null; }
    if (!el) return;
    const off = -((parseInt(getComputedStyle(html).getPropertyValue('--nav-h')) || 70) + 20);
    if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.6 }); else scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: 'smooth' });
  }

  function runPreloader() {
    return new Promise(resolve => {
      sess.set('obs-seen', '1');
      const pl = $('.pl'), imgs = $$('.pl__frame img'), cnt = $('#plCount'), o = { v: 0 };
      let k = 0; const flick = setInterval(() => { imgs[k].classList.remove('on'); k = (k + 1) % imgs.length; imgs[k].classList.add('on'); }, 150);
      const loaded = new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
      const tl = gsap.timeline()
        .from('.pl__frame', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.1, ease: 'expo.inOut' })
        .from('.pl__word span', { yPercent: 110, duration: 1.2, stagger: .06, ease: 'expo.out' }, .25)
        .to(o, { v: 100, duration: 2, ease: 'power2.inOut', onUpdate: () => { cnt.textContent = String(Math.round(o.v)).padStart(3, '0'); } }, 0);
      Promise.all([tl.then(), Promise.race([loaded, new Promise(r => setTimeout(r, 3200))])]).then(() => {
        clearInterval(flick);
        gsap.timeline({ onComplete: () => { pl.remove(); html.classList.remove('is-first'); } })
          .to('.pl__word span', { yPercent: -110, duration: .7, stagger: .03, ease: 'expo.in' })
          .to('.pl__frame', { scale: 1.5, opacity: 0, duration: .9, ease: 'expo.in' }, '<')
          .to('.pl__meta', { opacity: 0, duration: .3 }, '<')
          .to(pl, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, '-=.3')
          .add(resolve, '-=.8');
      });
    });
  }
  function runEnter() {
    const tt = sess.get('obs-tt'); if (tt) $('#trTitle').textContent = tt;
    return new Promise(resolve => {
      gsap.timeline({ onComplete: () => { html.classList.remove('is-nav'); gsap.set('.tr, .tr__panel, .tr__line, .tr__title span, .tr__logo', { clearProps: 'all' }); } })
        .set('.tr__line', { scaleX: 1 })
        .to('.tr__title span', { yPercent: -110, duration: .55, ease: 'expo.in', delay: .1 })
        .to('.tr__logo', { opacity: 0, duration: .3 }, '<')
        .to('.tr__panel', { yPercent: -100, duration: .9, ease: 'expo.inOut' }, '-=.15')
        .add(resolve, '-=.6');
    });
  }
  function runIntro() {
    html.classList.remove('cover');
    if (!ANIM) { html.classList.remove('is-first', 'is-nav'); return Promise.resolve(); }
    if (html.classList.contains('is-first')) return runPreloader();
    if (html.classList.contains('is-nav')) return runEnter();
    return Promise.resolve();
  }

  /* =====================================================================
     Scroll suave, cursor, magnetismo, apariciones
     ===================================================================== */
  function initLenis() {
    if (!ANIM || !window.Lenis) return;
    lenis = new Lenis({ duration: 1.1, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  function initCursor() {
    if (!FINE || !ANIM) return;
    html.classList.add('has-cursor');
    const c = $('.cur'), dot = $('.cur__dot'), lab = $('.cur__label');
    const dx = gsap.quickTo(dot, 'x', { duration: .15, ease: 'power3' }), dy = gsap.quickTo(dot, 'y', { duration: .15, ease: 'power3' });
    const lx = gsap.quickTo(lab, 'x', { duration: .5, ease: 'power3' }), ly = gsap.quickTo(lab, 'y', { duration: .5, ease: 'power3' });
    addEventListener('pointermove', e => { dx(e.clientX); dy(e.clientY); lx(e.clientX); ly(e.clientY); c.style.opacity = 1; }, { passive: true });
    document.addEventListener('pointerover', e => {
      const l = e.target.closest('[data-cursor]');
      if (l) { lab.textContent = l.dataset.cursor; c.classList.add('is-label'); c.classList.remove('is-link'); return; }
      c.classList.remove('is-label');
      c.classList.toggle('is-link', !!e.target.closest('a, button, select, label, [role="button"]'));
    });
    html.addEventListener('mouseleave', () => { c.style.opacity = 0; });
  }
  function initMagnetic() {
    if (!FINE || !ANIM) return;
    $$('[data-magnetic]').forEach(el => {
      if (el._mag) return; el._mag = 1;
      const s = parseFloat(el.dataset.magnetic) || .3;
      const xTo = gsap.quickTo(el, 'x', { duration: .8, ease: 'elastic.out(1, .4)' }), yTo = gsap.quickTo(el, 'y', { duration: .8, ease: 'elastic.out(1, .4)' });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * s); yTo((e.clientY - r.top - r.height / 2) * s); });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  function splitWords(el) {
    if (el.classList.contains('is-split')) return $$('.wi', el);
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const i = document.createElement('span'); i.className = 'wi'; i.textContent = part;
            w.appendChild(i); frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el); el.classList.add('is-split');
    return $$('.wi', el);
  }
  const splitIn = (el, vars = {}) => gsap.fromTo(splitWords(el), { yPercent: 120 }, { yPercent: 0, duration: 1.3, stagger: .06, ease: 'expo.out', ...vars });

  function initReveals() {
    if (!ANIM) return;
    $$('[data-split]:not([data-split="manual"])').forEach(el => { if (el._r) return; el._r = 1; splitIn(el, { scrollTrigger: { trigger: el, start: 'top 90%', once: true } }); });
    $$('[data-reveal]').forEach(el => {
      if (el._r) return; el._r = 1;
      gsap.fromTo(el, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', delay: parseFloat(el.dataset.delay) || 0, scrollTrigger: { trigger: el, start: 'top 93%', once: true },
        onStart: () => el.classList.add('is-done'), onComplete: () => gsap.set(el, { clearProps: 'opacity,transform' }) });
    });
    $$('[data-stagger]').forEach(el => {
      if (el._r || !el.children.length) return; el._r = 1;
      gsap.fromTo(el.children, { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: .07, scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onStart: () => el.classList.add('is-done'), onComplete: () => gsap.set(el.children, { clearProps: 'opacity,transform' }) });
    });
    $$('[data-img]').forEach(el => {
      if (el._r) return; el._r = 1;
      const st = { trigger: el, start: 'top 90%', once: true };
      gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut', scrollTrigger: st });
      const img = el.dataset.img !== 'clip' && $('img', el);
      if (img) gsap.fromTo(img, { scale: 1.35 }, { scale: 1, duration: 2, ease: 'expo.out', scrollTrigger: { ...st } });
    });
    $$('[data-parallax]').forEach(el => {
      if (el._p) return; el._p = 1;
      const a = parseFloat(el.dataset.parallax) || 8;
      gsap.fromTo(el, { yPercent: -a }, { yPercent: a, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    $$('[data-speed]').forEach(el => {
      if (el._s) return; el._s = 1;
      gsap.to(el, { yPercent: (parseFloat(el.dataset.speed) || 0) * -100, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    $$('[data-count]').forEach(el => {
      if (el._c) return; el._c = 1;
      const end = parseFloat(el.dataset.count) || parseFloat(el.textContent) || 0, o = { v: 0 }, padN = Number(el.dataset.pad || 0);
      gsap.to(o, { v: end, duration: 2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true }, onUpdate: () => { el.textContent = String(Math.round(o.v)).padStart(padN, '0'); } });
    });
    const g = $('.ft__giant span');
    if (g && !g._r) { g._r = 1; gsap.fromTo(g, { yPercent: 100 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.ft__giant', start: 'top bottom', end: 'bottom bottom', scrub: true } }); }
  }

  function initMarquees() {
    $$('.mq').forEach(mq => {
      if (mq._m) return; mq._m = 1;
      const track = $('.mq__track', mq), group = $('.mq__group', track), unit = group.innerHTML;
      let guard = 0; while (group.offsetWidth < innerWidth * 1.1 && guard++ < 8) group.insertAdjacentHTML('beforeend', unit);
      track.appendChild(group.cloneNode(true)).setAttribute('aria-hidden', 'true');
      if (!ANIM) return;
      const dir = mq.dataset.dir === 'right' ? 1 : -1;
      const tw = gsap.fromTo(track, { xPercent: dir < 0 ? 0 : -50 }, { xPercent: dir < 0 ? -50 : 0, duration: parseFloat(mq.dataset.duration) || 36, ease: 'none', repeat: -1 });
      let base = 1, boost = 0;
      ScrollTrigger.create({ trigger: mq, start: 'top bottom', end: 'bottom top', onUpdate: s => { base = s.direction; boost = Math.min(5, Math.abs(s.getVelocity()) / 350); } });
      gsap.ticker.add(() => { boost *= .93; tw.timeScale(base * (1 + boost)); });
    });
  }

  /* =====================================================================
     PÁGINAS
     ===================================================================== */

  /* ---------- INICIO ---------- */
  function initHome() {
    $('#homeIndex').innerHTML = PRODUCTS.slice(0, 10).map(rowHTML).join('');
    $$('[data-count-gen]').forEach(el => { el.textContent = PRODUCTS.filter(p => forGender(p, el.dataset.countGen)).length; });
    $$('[data-count-new]').forEach(el => { el.textContent = PRODUCTS.filter(p => NEW_TAGS.includes(p.etiqueta)).length; });
    $$('[data-count-col]').forEach(el => { el.textContent = PRODUCTS.filter(p => (p.colecciones || []).includes(el.dataset.countCol)).length; });
    $$('[data-count-brand]').forEach(el => { el.textContent = PRODUCTS.filter(p => p.marca === el.dataset.countBrand).length; });

    /* hero: diapositivas en el arco */
    const slides = $$('.hero__slides img'), cap = $('#heroCap'), capP = $('#heroCapP'), link = $('.hero__slides');
    let k = 0;
    const setCap = i => {
      const p = bySlug[slides[i].dataset.slug]; if (!p) return;
      cap.textContent = `N.º ${pad(p.n)} — ${p.marca}`; capP.textContent = fmt(p.precio); link.href = productUrl(p);
    };
    setCap(0);
    if (slides.length > 1) {
      setInterval(() => {
        if (document.hidden) return;
        const prev = slides[k]; k = (k + 1) % slides.length; const next = slides[k];
        next.style.zIndex = 2; prev.style.zIndex = 1;
        if (ANIM) {
          gsap.fromTo(next, { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.25 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 1.4, ease: 'expo.inOut', onComplete: () => { prev.classList.remove('on'); next.classList.add('on'); } });
        } else { prev.classList.remove('on'); next.classList.add('on'); }
        setCap(k);
      }, 3200);
    }
    if (!ANIM) {
      const win = $('.portal__win'); if (win) win.style.clipPath = 'none';
      $('.portal__words')?.remove();
      return null;
    }
    gsap.set('.portal__text', { opacity: 0 });
    return gsap.timeline({ paused: true })
      .add(splitIn($('.hero__title'), { stagger: .08, duration: 1.5 }), 0)
      .from('.hero__arch', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut' }, .05)
      .from('.hero__slides img.on', { scale: 1.4, duration: 2.2, ease: 'expo.out' }, .3)
      .from('.hero__top > *, .hero__side > *, .hero__strip > *', { y: 24, opacity: 0, duration: 1, stagger: .06, ease: 'expo.out' }, .5)
      .from('.hero__cbtn', { scale: 0, rotate: -120, duration: 1.4, ease: 'expo.out' }, .8);
  }

  function homeFx() {
    if (!ANIM) return;
    const mm = gsap.matchMedia();
    /* portal: la ventana ovalada se abre a pantalla completa */
    const portal = $('.portal');
    if (portal) {
      gsap.timeline({ scrollTrigger: { trigger: portal, start: 'top top', end: '+=130%', pin: true, scrub: 1, refreshPriority: 2, anticipatePin: 1 } })
        .to('.portal__words span:first-child', { xPercent: -60, opacity: 0, ease: 'power1.in', duration: .5 }, 0)
        .to('.portal__words span:last-child', { xPercent: 60, opacity: 0, ease: 'power1.in', duration: .5 }, 0)
        .to('.portal__win', { clipPath: 'ellipse(80% 80% at 50% 50%)', ease: 'power2.inOut', duration: 1 }, 0)
        .fromTo('.portal__logo', { scale: 1, rotate: 0 }, { scale: .55, rotate: 200, opacity: .2, ease: 'power2.inOut', duration: 1 }, 0)
        .to('.portal__text', { opacity: 1, duration: .35 }, .7)
        .from('.portal__text > *', { y: 40, stagger: .08, duration: .35 }, .7);
    }
    /* sala oscura: recorrido horizontal */
    const sala = $('.sala'), track = $('#salaTrack');
    if (sala && track) {
      mm.add('(min-width: 981px)', () => {
        const pieces = $$('.piece', track), bar = $('.sala__bar i'), cur = $('#salaCur');
        const dist = () => Math.max(0, track.scrollWidth - innerWidth);
        const tw = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: sala, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1, refreshPriority: 1,
          onUpdate: s => { gsap.set(bar, { scaleX: s.progress }); cur.textContent = pad(Math.min(pieces.length, Math.floor(s.progress * pieces.length) + 1)); } } });
        pieces.forEach(pc => {
          gsap.fromTo($('img', pc), { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: pc, containerAnimation: tw, start: 'left right', end: 'right left', scrub: true } });
          gsap.from($('.piece__n', pc), { yPercent: 60, opacity: 0, ease: 'none', scrollTrigger: { trigger: pc, containerAnimation: tw, start: 'left right', end: 'left 45%', scrub: true } });
        });
      });
    }
    /* colecciones apiladas: la anterior se encoge cuando llega la siguiente */
    mm.add('(min-width: 981px)', () => {
      const cards = $$('.scard');
      cards.slice(0, -1).forEach((c, i) => {
        gsap.to(c, { scale: .9, ease: 'none', scrollTrigger: { trigger: cards[i + 1], start: 'top 85%', end: 'top 20%', scrub: true } });
      });
    });
  }

  /* ---------- LISTADOS (tienda, novedades, hombre, mujer, marcas, colecciones) ---------- */
  function initListing() {
    let preset = {};
    try { preset = JSON.parse(body.dataset.preset || '{}'); } catch (e) { preset = {}; }
    const full = body.dataset.filters === 'full';
    const base = PRODUCTS.filter(p =>
      (!preset.marca || p.marca === preset.marca) && (!preset.col || (p.colecciones || []).includes(preset.col)) &&
      (!preset.genero || forGender(p, preset.genero)) && (!preset.nuevos || NEW_TAGS.includes(p.etiqueta)));
    const grid = $('#lgrid'), index = $('#lindex'), empty = $('#lempty');
    grid.innerHTML = base.map(cardHTML).join('');
    index.innerHTML = base.map(rowHTML).join('');
    const cards = Object.fromEntries($$('.card', grid).map(c => [c.dataset.id, c]));
    const rows = Object.fromEntries($$('.irow', index).map(r => [r.dataset.id, r]));
    const params = new URLSearchParams(location.search);
    const st = {
      q: full ? params.get('q') || '' : '', marca: full ? params.get('marca') || '' : '', col: full ? params.get('col') || '' : '',
      precio: full ? params.get('precio') || '' : '', genero: preset.genero ? '' : params.get('genero') || '', orden: params.get('orden') || 'destacados',
      vista: params.get('vista') === 'indice' ? 'indice' : (store.get('obs-vista', 'galeria') === 'indice' ? 'indice' : 'galeria'),
    };
    const PRICE_BANDS = [['0-100000', 'Hasta $100.000'], ['100001-130000', 'Entre $100.000 y $130.000'], ['130001-', 'Más de $130.000']];
    const inBand = (precio, v) => { if (!v.includes('-')) return precio === Number(v); const [lo, hi] = v.split('-'); return precio >= Number(lo) && (!hi || precio <= Number(hi)); };
    const bands = PRICE_BANDS.filter(([v]) => base.some(p => inBand(p.precio, v)));
    const chip = (k, v, l, n) => `<button type="button" class="chip mono" data-k="${k}" data-v="${esc(v)}">${esc(l)}${n != null ? ` <small>${n}</small>` : ''}</button>`;
    const gWrap = $('#lgen');
    if (gWrap) gWrap.innerHTML = preset.genero ? '' : [['', 'Todos'], ['Hombre', 'Hombre'], ['Mujer', 'Mujer'], ...(base.some(p => p.genero === 'Niños') ? [['Niños', 'Niños']] : [])].map(([v, l]) => chip('genero', v, l)).join('');
    if (full) {
      $('#fBrand').innerHTML = [chip('marca', '', 'Todas'), ...brands().map(([b, n]) => chip('marca', b, b, n))].join('');
      $('#fCol').innerHTML = [chip('col', '', 'Todas'), ...Object.entries(COLLECTIONS).map(([k, c]) => chip('col', k, c.name))].join('');
      $('#fPrice').innerHTML = [chip('precio', '', 'Todos'), ...bands.map(([v, l]) => chip('precio', v, l, base.filter(p => inBand(p.precio, v)).length))].join('');
      $('#lq').value = st.q;
    }
    $('#lsort').value = st.orden;
    const labels = { q: v => `“${v}”`, marca: v => v, col: v => COLLECTIONS[v]?.name || v, precio: v => (PRICE_BANDS.find(b => b[0] === v) || [, fmt(Number(v))])[1], genero: v => v };

    function apply(animate) {
      const nq = norm(st.q).trim(), terms = nq ? nq.split(/\s+/) : [];
      let list = base.filter(p => {
        const h = norm(`${fullName(p)} ${p.marca} ${p.color} ${p.etiqueta}`);
        return terms.every(t => h.includes(t)) && (!st.marca || p.marca === st.marca) && (!st.col || (p.colecciones || []).includes(st.col)) &&
          (!st.precio || inBand(p.precio, st.precio)) && forGender(p, st.genero);
      });
      if (st.orden === 'precio-asc') list.sort((a, b) => a.precio - b.precio || a.rank - b.rank);
      else if (st.orden === 'precio-desc') list.sort((a, b) => b.precio - a.precio || a.rank - b.rank);
      else if (st.orden === 'nombre') list.sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
      else list.sort((a, b) => a.rank - b.rank);
      const show = new Set(list.map(p => p.id));
      const isGrid = st.vista === 'galeria';
      grid.hidden = !isGrid; index.hidden = isGrid;
      const state = animate && isGrid && ANIM && window.Flip ? Flip.getState($$('.card', grid)) : null;
      base.forEach(p => { cards[p.id].hidden = !show.has(p.id); rows[p.id].hidden = !show.has(p.id); });
      list.forEach(p => { grid.appendChild(cards[p.id]); index.appendChild(rows[p.id]); });
      if (state) Flip.from(state, { duration: .8, ease: 'expo.inOut', stagger: .012, absolute: true, prune: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .7, delay: .2, ease: 'expo.out' }), onComplete: () => ScrollTrigger.refresh() });
      else if (ANIM) { if (animate && !isGrid) gsap.from($$('.irow:not([hidden])', index).slice(0, 12), { opacity: 0, x: -30, stagger: .03, duration: .7, ease: 'expo.out' }); ScrollTrigger.refresh(); }
      $$('[data-lcount]').forEach(el => { el.textContent = list.length; });
      empty.hidden = list.length > 0;
      $$('.ltools [data-k], .fpanel [data-k]').forEach(b => b.classList.toggle('is-on', st[b.dataset.k] === b.dataset.v));
      $$('[data-vista]').forEach(b => b.classList.toggle('is-on', b.dataset.vista === st.vista));
      const act = $('#lactive');
      if (act) act.innerHTML = ['q', 'marca', 'col', 'precio'].filter(k => st[k]).map(k => `<button type="button" class="mono" data-clear="${k}">${esc(labels[k](st[k]))} ${I.x}</button>`).join('');
      const fb = $('#ftoggle b'); if (fb) { const n = ['marca', 'col', 'precio'].filter(k => st[k]).length; fb.textContent = n ? `(${n})` : ''; }
      const q = new URLSearchParams();
      ['q', 'marca', 'col', 'precio', 'genero'].forEach(k => { if (st[k]) q.set(k, st[k]); });
      if (st.orden !== 'destacados') q.set('orden', st.orden);
      if (st.vista === 'indice') q.set('vista', 'indice');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    }
    document.addEventListener('click', e => {
      const b = e.target.closest('.ltools [data-k], .fpanel [data-k]');
      if (b) { st[b.dataset.k] = b.dataset.v; apply(true); return; }
      const v = e.target.closest('[data-vista]');
      if (v) { st.vista = v.dataset.vista; store.set('obs-vista', st.vista); apply(true); return; }
      const c = e.target.closest('[data-clear]');
      if (c) { st[c.dataset.clear] = ''; if (c.dataset.clear === 'q') $('#lq').value = ''; apply(true); return; }
      if (e.target.closest('[data-reset]')) { Object.assign(st, { q: '', marca: '', col: '', precio: '', genero: '' }); if ($('#lq')) $('#lq').value = ''; apply(true); }
    });
    $('#lsort').addEventListener('change', e => { st.orden = e.target.value; apply(true); });
    let qt; $('#lq')?.addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value.trim(); apply(true); }, 220); });
    $('#ftoggle')?.addEventListener('click', () => { const p = $('#fpanel'); p.hidden = !p.hidden; $('#ftoggle').setAttribute('aria-expanded', String(!p.hidden)); if (ANIM && !p.hidden) gsap.from(p.children, { opacity: 0, y: 16, stagger: .05, duration: .6, ease: 'expo.out' }); if (ANIM) ScrollTrigger.refresh(); });
    if (full && (st.marca || st.col || st.precio)) $('#fpanel').hidden = false;
    apply(false);
    if (!ANIM) return null;
    const first = st.vista === 'galeria' ? $$('.card:not([hidden])', grid).slice(0, 8) : $$('.irow:not([hidden])', index).slice(0, 10);
    return gsap.timeline({ paused: true }).from(first, { y: 70, opacity: 0, duration: 1.2, stagger: .06, ease: 'expo.out', clearProps: 'opacity,transform' }, .4);
  }

  /* ---------- PRODUCTO ---------- */
  function initProduct() {
    const p = bySlug[body.dataset.product];
    if (!p) return null;
    const name = fullName(p);
    $$('[data-price]').forEach(el => { el.textContent = fmt(p.precio); });
    const sizesEl = $('#sizes'), hint = $('#sizeHint'), addBtn = $('#addBtn'), waBtn = $('#waBtn');
    $$('.size', sizesEl).forEach(b => { b.disabled = p.agotado || !p.tallas.includes(Number(b.dataset.size)); });
    if (p.agotado) { addBtn.disabled = true; addBtn.firstChild.textContent = 'Agotado '; }
    let size = null, qty = 1, color = '', foto = 0;
    const waMsg = () => `Hola OBSIDIAN 👋 Quiero este par:\n\n• ${qty} × ${name} (${color || p.color}) — Talla ${size} — ${fmt(p.precio * qty)}\n\n¿Está disponible? ${location.href}${refLine()}`;
    sizesEl.addEventListener('click', e => {
      const b = e.target.closest('.size'); if (!b) return;
      size = Number(b.dataset.size);
      $$('.size', sizesEl).forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
      hint.textContent = ''; waBtn.href = waLink(waMsg());
    });
    $$('[data-q]').forEach(b => b.addEventListener('click', () => { qty = Math.max(1, Math.min(10, qty + Number(b.dataset.q))); $('#qty').textContent = qty; if (size) waBtn.href = waLink(waMsg()); }));
    /* color: obligatorio cuando el producto viene en varios colores */
    const colorsEl = $('#colors'), colorHint = $('#colorHint'), shotImgs = $$('.pdp__shot img'), orig = shotImgs.map(i => i.getAttribute('src'));
    const showFoto = k => {
      shotImgs.forEach((im, i) => { im.src = orig[i]; });
      if (k > 0 && shotImgs[k]) { shotImgs[0].src = orig[k]; shotImgs[k].src = orig[0]; }
      const st = $('.pdp__stack');
      if (st.scrollWidth > st.clientWidth) st.scrollTo({ left: 0, behavior: 'smooth' });
      else if (shotImgs[0].getBoundingClientRect().bottom < 120) { if (lenis) lenis.scrollTo(0); else scrollTo({ top: 0, behavior: 'smooth' }); }
    };
    colorsEl?.addEventListener('click', e => {
      const b = e.target.closest('.sw'); if (!b) return;
      color = b.dataset.color; foto = Number(b.dataset.foto) || 1;
      $$('.sw', colorsEl).forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on); });
      $('#colorName').textContent = color; colorHint.textContent = '';
      showFoto(foto - 1);
      if (size) waBtn.href = waLink(waMsg());
    });
    const needColor = () => {
      if (!colorsEl || color) return false;
      colorHint.textContent = 'Elige el color para continuar.';
      colorsEl.classList.remove('shake'); void colorsEl.offsetWidth; colorsEl.classList.add('shake');
      const r = colorsEl.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight) { if (lenis) lenis.scrollTo(colorsEl, { offset: -160 }); else colorsEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return true;
    };
    const need = () => {
      if (needColor()) return true;
      if (size) return false;
      hint.textContent = 'Elige tu talla para continuar.';
      sizesEl.classList.remove('shake'); void sizesEl.offsetWidth; sizesEl.classList.add('shake');
      const r = sizesEl.getBoundingClientRect();
      if (r.top < 90 || r.bottom > innerHeight) { lenis ? lenis.scrollTo(sizesEl, { offset: -160 }) : sizesEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return true;
    };
    const add = () => {
      if (p.agotado || need()) return;
      Cart.add(p.id, size, qty, color, foto);
      flyToBag($('.pdp__shot img'));
      toast(`${name}${color ? ` · ${color}` : ''} · talla ${size} en tu bolsa`, u(p.imagenes[(foto || 1) - 1] || p.imagenes[0]));
      setTimeout(openBag, ANIM ? 1250 : 0);
    };
    addBtn.addEventListener('click', add);
    $('#mbarAdd')?.addEventListener('click', add);
    waBtn.addEventListener('click', e => { if (need()) e.preventDefault(); else waBtn.href = waLink(waMsg()); });
    waBtn.target = '_blank'; waBtn.rel = 'noopener';

    /* contador de fotos */
    const shots = $$('.pdp__shot'), cnt = $('#shotCur'), stack = $('.pdp__stack');
    const setCnt = i => { cnt.textContent = pad(i + 1); };
    if (ANIM) gsap.matchMedia().add('(min-width: 981px)', () => {
      shots.forEach((s, i) => ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle: self => { if (self.isActive) setCnt(i); } }));
    });
    stack.addEventListener('scroll', () => { if (stack.scrollWidth > stack.clientWidth) setCnt(Math.round(stack.scrollLeft / (shots[0].offsetWidth + 8))); }, { passive: true });

    /* columna de información: si es más alta que la pantalla, se pega por abajo */
    const info = $('.pdp__info');
    const fitInfo = () => {
      info.style.top = '';
      if (getComputedStyle(info).position !== 'sticky') return;
      const nav = (parseInt(getComputedStyle(html).getPropertyValue('--nav-h')) || 72) + 20;
      if (info.offsetHeight + nav > innerHeight) info.style.top = `${innerHeight - info.offsetHeight - 24}px`;
    };
    fitInfo(); addEventListener('resize', fitInfo);
    (document.fonts?.ready || Promise.resolve()).then(fitInfo);

    /* barra fija en móvil */
    const mbar = $('#mbar');
    if (mbar && 'IntersectionObserver' in window) new IntersectionObserver(([en]) => mbar.classList.toggle('is-on', !en.isIntersecting && en.boundingClientRect.top < 0)).observe($('.pdp__buy'));

    /* relacionados */
    const same = PRODUCTS.filter(x => x.id !== p.id && x.marca === p.marca).slice(0, 4);
    const fill = same.length < 4 ? PRODUCTS.filter(x => x.id !== p.id && x.marca !== p.marca && (x.colecciones || []).some(c => (p.colecciones || []).includes(c))) : [];
    $('#relGrid').innerHTML = [...same, ...fill].slice(0, 4).map(cardHTML).join('');

    if (!ANIM) return null;
    return gsap.timeline({ paused: true })
      .from('.pdp__shot:first-child', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' }, 0)
      .from('.pdp__shot:first-child img', { scale: 1.4, duration: 2, ease: 'expo.out' }, .2)
      .add(splitIn($('.pdp__name')), .25)
      .from('.pdp__info > *:not(.pdp__name)', { y: 24, opacity: 0, duration: 1, stagger: .04, ease: 'expo.out', clearProps: 'opacity,transform' }, .35);
  }

  /* ---------- VIDEOS (inicio y páginas de producto) ---------- */
  function initReels() {
    const vids = $$('.reel video');
    if (!vids.length) return;
    const load = v => { if (!v.src && v.dataset.src) v.src = v.dataset.src; };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) { load(v); if (!REDUCED) v.play().catch(() => {}); } else v.pause();
    }), { threshold: 0.35 }) : null;
    vids.forEach(v => { if (io) io.observe(v); else load(v); });
    const label = (b, on) => { b.textContent = on ? 'Silenciar' : 'Activar sonido'; b.setAttribute('aria-pressed', on); };
    $$('.reel__snd').forEach(b => b.addEventListener('click', () => {
      const v = b.closest('.reel').querySelector('video');
      const on = v.muted;
      vids.forEach(x => { x.muted = true; label(x.closest('.reel').querySelector('.reel__snd'), false); });
      load(v); v.muted = !on; label(b, on);
      if (on) v.play().catch(() => {});
    }));
  }

  /* ---------- CONTACTO ---------- */
  function initContact() {
    if (!CFG.instagram) $('#chIg')?.remove(); else { $('#chIg').href = CFG.instagram; $('#chIgU').textContent = CFG.instagramUser || 'Instagram'; }
    if (!CFG.tiktok) $('#chTk')?.remove(); else { $('#chTk').href = CFG.tiktok; $('#chTkU').textContent = CFG.tiktokUser || 'TikTok'; }
    if (!CFG.email) $('#chMail')?.remove(); else { $('#chMail').href = 'mailto:' + CFG.email; $('#chMailU').textContent = CFG.email; }
    const chan = $('.chan'); if (chan) chan.style.gridTemplateColumns = innerWidth > 980 ? `repeat(${chan.children.length}, minmax(0, 1fr))` : '';
    const form = $('#contactForm'); if (!form) return null;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const okN = d.nombre.trim().length > 1, okM = d.mensaje.trim().length > 3;
      $('#cNombre').closest('.field').classList.toggle('bad', !okN);
      $('#cMensaje').closest('.field').classList.toggle('bad', !okM);
      if (!okN || !okM) return;
      openWA(waLink(`Hola OBSIDIAN 👋 Soy ${d.nombre.trim()}${d.ciudad.trim() ? ' de ' + d.ciudad.trim() : ''}.\nMotivo: ${d.motivo}\n\n${d.mensaje.trim()}${refLine()}`), $('#cFallback'));
      toast('Mensaje listo en WhatsApp');
    });
    return null;
  }

  /* ---------- BOLSA / PEDIDO ---------- */
  function initCart() {
    const list = $('#cartList'), sum = $('#receipt'), FKEY = 'obs-checkout';
    bindLines(list);
    const render = () => {
      const n = Cart.count();
      $('#cartCount').textContent = pad(n);
      if (!Cart.items.length) { list.innerHTML = emptyBagHTML; sum.hidden = $('#checkoutDone').hidden; return; }
      sum.hidden = false;
      list.innerHTML = Cart.items.map(lineHTML).join('');
      $('#sumItems').textContent = `${n} ${n === 1 ? 'par' : 'pares'}`;
      $('#sumSub').textContent = fmt(Cart.total());
      $('#sumTotal').textContent = fmt(Cart.total());
      const ref = getRef(), refRow = $('#sumRefRow');
      if (refRow) { refRow.hidden = !ref; $('#sumRef').textContent = ref; }
      const cod = cartCOD(), mixed = !cod && Cart.items.some(i => isCOD(byId[i.id]));
      $('#payTitle').textContent = cod ? 'Pago contraentrega' : 'Pago anticipado por transferencia';
      $('#payDetail').textContent = cod ? 'Pagas cuando recibes tus tenis.'
        : `${mixed ? 'Tu pedido trae modelos que no son contraentrega, así que todo se paga por adelantado. ' : ''}Te mandamos los datos de pago por WhatsApp y despachamos apenas confirmemos el pago.`;
    };
    document.addEventListener('cart:change', render);
    render();

    const form = $('#checkout'), done = $('#checkoutDone'), saved = store.get(FKEY, {});
    Object.entries(saved).forEach(([k, v]) => { if (form.elements[k] && k !== 'website') form.elements[k].value = v; });
    form.addEventListener('input', () => { const d = Object.fromEntries(new FormData(form)); delete d.website; store.set(FKEY, d); });
    const rules = {
      nombre: v => v.trim().length >= 3 || 'Escribe tu nombre completo.',
      celular: v => /^\d{7,12}$/.test(v.replace(/\D/g, '')) || 'Escribe un número de celular válido.',
      ciudad: v => v.trim().length >= 3 || 'Escribe tu ciudad.',
      direccion: v => v.trim().length >= 5 || 'Escribe la dirección de entrega.',
      barrio: v => v.trim().length >= 3 || 'Escribe tu barrio.',
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!Cart.items.length) return;
      const d = Object.fromEntries(new FormData(form)); let bad = null;
      Object.entries(rules).forEach(([k, fn]) => {
        const r = fn(d[k] || ''), f = form.elements[k].closest('.field');
        f.classList.toggle('bad', r !== true); $('.err', f).textContent = r === true ? '' : r;
        if (r !== true && !bad) bad = form.elements[k];
      });
      if (bad) { bad.focus(); return; }
      await RefPrices.ready;
      const items = Cart.items.map(i => { const p = byId[i.id]; return { id: p.id, slug: p.slug, marca: p.marca, nombre: p.nombre, color: i.color || p.color, talla: i.talla, cantidad: i.qty, precio: p.precio }; });
      const pedido = { nombre: d.nombre.trim(), celular: d.celular.trim(), ciudad: d.ciudad.trim(), direccion: d.direccion.trim(), barrio: (d.barrio || '').trim(), notas: (d.notas || '').trim(), items, subtotal: Cart.total(), origen: location.host || 'local', ref: getRef(), pago: cartCOD() ? 'Contraentrega' : 'Anticipado' };
      const btn = $('button[type="submit"]', form), btnHTML = btn.innerHTML;
      let numero = '';
      if (CFG.pedidosApi) {
        btn.disabled = true; btn.innerHTML = 'Registrando pedido…';
        try {
          const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
          const r = await fetch(CFG.pedidosApi, { method: 'POST', body: JSON.stringify({ accion: 'crear', pedido, website: d.website || '' }), signal: ctl.signal });
          clearTimeout(tm);
          const j = await r.json(); if (j && j.ok) numero = j.numero;
        } catch (err) { numero = ''; }
        btn.disabled = false; btn.innerHTML = btnHTML;
      }
      const lines = items.map(i => `• ${i.cantidad} × ${fullName(byId[i.id])} (${i.color}) — Talla ${i.talla} — ${fmt(i.precio * i.cantidad)}`).join('\n');
      const msg = `Hola OBSIDIAN 👋 ${numero ? `Acabo de hacer el pedido *${numero}*` : 'Quiero hacer este pedido'}:\n\n${lines}\n\nSubtotal: ${fmt(pedido.subtotal)}\nEnvío: por confirmar\n\n` +
        `Nombre: ${pedido.nombre}\nCelular: ${pedido.celular}\nCiudad: ${pedido.ciudad}\nDirección: ${pedido.direccion}` +
        (pedido.barrio ? `\nBarrio: ${pedido.barrio}` : '') + (pedido.notas ? `\nNotas: ${pedido.notas}` : '') + `\n\nForma de pago: ${pedido.pago === 'Contraentrega' ? 'Contraentrega' : 'Pago anticipado por transferencia'}` + (pedido.ref ? `\nVendedor: ${pedido.ref}` : '');
      const wa = waLink(msg);
      $('#doneNum').textContent = numero ? `Pedido ${numero}` : 'Pedido listo';
      const pre = pedido.pago !== 'Contraentrega';
      $('#doneTxt').textContent = numero
        ? `Registramos tu pedido. Envíanos el mensaje por WhatsApp y te confirmamos disponibilidad y envío${pre ? ', y te mandamos los datos para pagar' : ''}.`
        : `Envíanos el mensaje por WhatsApp para confirmar tu pedido. Te respondemos con disponibilidad y costo de envío${pre ? ', y con los datos para pagar' : ''}.`;
      $('#doneWa').href = wa;
      form.hidden = true; done.hidden = false;
      openWA(wa);
      if (numero) { Cart.clear(); store.del(FKEY); }
      if (ANIM) gsap.from('#checkoutDone > *', { y: 20, opacity: 0, stagger: .08, duration: .9, ease: 'expo.out' });
    });
    $('#doneClear')?.addEventListener('click', () => { Cart.clear(); });
    $('#doneBack')?.addEventListener('click', () => { done.hidden = true; form.hidden = false; render(); });
    return null;
  }

  /* =====================================================================
     Arranque
     ===================================================================== */
  injectChrome();
  applyConfig();
  renderBag();
  initUI();
  initHoverImages();
  initLenis();
  lenis?.stop();

  const PAGES = { home: initHome, listing: initListing, product: initProduct, contact: initContact, cart: initCart };
  let pageTl = null;
  try { pageTl = PAGES[PAGE]?.() || null; } catch (err) { console.error('[OBSIDIAN]', err); }
  initAccordions();
  initReels();
  try { initReviews(); } catch (err) { console.error('[OBSIDIAN reseñas]', err); }
  initCursor();
  initMagnetic();

  runIntro().then(() => {
    lenis?.start();
    pageTl?.play();
    if (PAGE === 'home') homeFx();
    initReveals();
    (document.fonts?.ready || Promise.resolve()).then(() => { initMarquees(); if (ANIM) ScrollTrigger.refresh(); });
    if (location.hash) setTimeout(() => scrollToHash(location.hash), 300);
  });
  addEventListener('load', () => { if (ANIM) ScrollTrigger.refresh(); });
})();
