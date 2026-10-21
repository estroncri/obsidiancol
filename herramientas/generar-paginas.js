#!/usr/bin/env node
/* =====================================================================
   OBSIDIAN — generador de páginas
   Crea todas las páginas HTML a partir de js/productos.js y js/config.js.

   Uso (desde la carpeta del sitio):
     node herramientas/generar-paginas.js

   Vuelve a ejecutarlo cuando agregues o quites productos, marcas o
   colecciones. Cambiar precios o textos de productos.js no lo requiere.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.resolve(__dirname, '..');
const DOMAIN = 'https://obsidiancol.shop';
const load = (file, key) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(SITE, file), 'utf8'), ctx); return ctx.window[key]; };
const CFG = load('js/config.js', 'OBSIDIAN_CONFIG') || {};
const RAW = load('js/productos.js', 'OBSIDIAN_PRODUCTS') || [];

/* ---------- utilidades ---------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
const pad = n => String(n).padStart(2, '0');
const fullName = p => (norm(p.nombre).startsWith(norm(p.marca)) || /^air jordan/i.test(p.nombre)) ? p.nombre : `${p.marca} ${p.nombre}`;
const EXTRA = Number(CFG.aumentoPrecio) || 0;
const P = RAW.map((p, i) => ({ ...p, precio: p.precio + EXTRA, n: i + 1, slug: p.slug || slugify(`${fullName(p)} ${p.color}`) }));
const bySlug = Object.fromEntries(P.map(p => [p.slug, p]));
const byId = Object.fromEntries(P.map(p => [p.id, p]));
const range = list => { const s = [...new Set(list.flatMap(p => p.tallas))].sort((a, b) => a - b); return s.length ? `${s[0]}–${s[s.length - 1]}` : '—'; };
const minPrice = list => Math.min(...list.map(p => p.precio));
const forGender = (p, g) => !g || p.genero === g || (p.genero === 'Unisex' && g !== 'Niños');
const ADULT = P.filter(p => p.genero !== 'Niños'), KIDS = P.filter(p => p.genero === 'Niños');
const genRange = g => range(P.filter(p => p.genero === g));
/* botones de talla de la página de cada producto: adultos siempre ven 36–44 (y más si el modelo lo tiene); niños, su rango */
/* mismo modelo en otros colores (productos aparte con igual marca y nombre) */
const SIBS = {}; P.forEach(p => { if (!p.colores) (SIBS[norm(`${p.marca}|${p.nombre}`)] ||= []).push(p); });
const siblings = p => (p.colores ? [] : SIBS[norm(`${p.marca}|${p.nombre}`)] || []);
const sizeGrid = p => { const k = p.genero === 'Niños', lo = Math.min(...p.tallas, k ? Infinity : 36), hi = Math.max(...p.tallas, k ? -Infinity : 44); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); };
const NEW_TAGS = ['Nuevo', 'Tendencia', 'Edición especial', 'Colaboración'];

const COLS = [
  { k: 'blackout', name: 'Blackout', em: 'Black<em>out</em>', desc: 'Negro sobre negro. Pares oscuros, serios y poderosos, hechos para la noche y para combinar con todo.', img: 'lv-skate-black-4', dark: true },
  { k: 'icons', name: 'Icons', em: 'Ic<em>ons</em>', desc: 'Las siluetas que definieron la cultura sneaker. Clásicos de siempre que nunca fallan.', img: 'af1-mid-2' },
  { k: 'luxury', name: 'Luxury', em: 'Lux<em>ury</em>', desc: 'Piezas de lujo y colaboraciones. Volumen, textura y presencia en cada paso.', img: 'nocta-blanco-1', dark: true },
  { k: 'runner', name: 'Runner', em: 'Run<em>ner</em>', desc: 'Estética running: capas técnicas, amortiguación y actitud de calle.', img: 'asics-verde-1' },
].map(c => ({ ...c, items: P.filter(p => (p.colecciones || []).includes(c.k)) }));

const BRAND_DESC = {
  Nike: 'Del Air Force 1 al Shox TL y el NOCTA: las siluetas que definieron la calle, en sus colores más buscados.',
  Jordan: 'El legado Jordan: Jordan 1, Jordan 3 y Jordan 4 Black Cat, también en tallas de niño.',
  Adidas: 'Samba, Superstar, running y chanclas: las tres franjas en sus modelos más pedidos.',
  'Louis Vuitton': 'El LV Skate en negro: volumen, textura y la firma Vuitton.',
  Puma: 'Gamuza XL y estética de terraza retro para el día a día.',
  ASICS: 'Tecnología GEL y estética runner de los 2000.',
  Numeris: 'Las más pedidas de la tienda: lona, puntera de cuero, cordones gruesos y suela plataforma.',
  BAPE: 'Bape Sta: la silueta japonesa de A Bathing Ape, en charol y con su estrella a un lado.',
};
const BRANDS = [...new Set(P.map(p => p.marca))].map(m => ({ name: m, slug: slugify(m), items: P.filter(p => p.marca === m), desc: BRAND_DESC[m] || `Todos los modelos ${m} de OBSIDIAN.` }))
  .sort((a, b) => b.items.length - a.items.length);

const HELP = [
  ['como-comprar.html', 'Cómo comprar'], ['envios.html', 'Envíos'], ['pagos.html', 'Pagos'], ['cambios.html', 'Cambios'],
  ['guia-de-tallas.html', 'Guía de tallas'], ['preguntas-frecuentes.html', 'Preguntas frecuentes'], ['contacto.html', 'Contacto'], ['privacidad.html', 'Privacidad'],
];
const SIZE_TABLE = [[35, '22', 3.5, 5], [36, '22,5', 4, 5.5], [37, '23', 4.5, 6], [38, '24', 5.5, 7], [39, '24,5', 6.5, 8], [40, '25', 7, 8.5], [41, '26', 8, 9.5], [42, '26,5', 8.5, 10], [43, '27,5', 9.5, 11], [44, '28', 10, 11.5], [45, '29', 11, 12.5]];
const pago = CFG.pago || 'Pago contraentrega', envio = CFG.envio || 'Envíos a toda Colombia', cambios = CFG.cambios || 'Cambios de talla';
/* forma de pago: solo los productos con "contraentrega": true se pagan al recibir; el resto, por adelantado */
const isCOD = p => !!p.contraentrega;
const codTxt = CFG.contraentregaModelos || 'los modelos marcados como contraentrega', CodTxt = codTxt[0].toUpperCase() + codTxt.slice(1);
const payFact = b => { const c = b.filter(isCOD).length; return c && c < b.length ? `<dt class="mono">Contraentrega</dt><dd>${b.filter(isCOD).map(p => esc(`${p.nombre} ${p.color}`)).join(', ')}</dd>` : `<dt class="mono">Pago</dt><dd>${c ? 'Contraentrega' : 'Anticipado'}</dd>`; };
const waNum = String(CFG.whatsapp || '').replace(/^57/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');

/* ---------- plantilla base ---------- */
const FONTS = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
function page({ file, R = '', key, section = '', title, desc, h1, body, attrs = '', flip = false, image = 'img/logo/obsidian-logo.png', jsonld = '', robots = '' }) {
  const url = `${DOMAIN}/${file === 'index.html' ? '' : file}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<meta name="theme-color" content="#edebe6">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="OBSIDIAN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${DOMAIN}/${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="${R}img/logo/favicon.png">
<link rel="apple-touch-icon" href="${R}img/logo/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${R}css/style.css">
<script>(function(d){if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;var c='is-first';try{if(sessionStorage.getItem('obs-seen'))c='is-nav'}catch(e){}d.className+=' cover '+c})(document.documentElement)</script>
${jsonld}</head>
<body data-page="${key}" data-section="${section}" data-root="${R}" data-title="${esc(h1 || title)}"${attrs}>
<main id="main">
${body.trim()}
</main>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" defer></script>
${flip ? '<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/Flip.min.js" defer></script>\n' : ''}<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js" defer></script>
<script src="${R}js/config.js" defer></script>
<script src="${R}js/productos.js" defer></script>
<script src="${R}js/main.js" defer></script>
</body>
</html>
`;
}

const ico = n => `<i data-icon="${n}"></i>`;
const arrowBtn = '<span class="btn__ico"></span>';
const img = (R, s, alt = '', extra = '') => `<img src="${R}img/products/${s}.jpg" alt="${esc(alt)}" loading="lazy" width="520" height="650"${extra}>`;
const pImg = (R, p, i = 0, extra = '') => `<img src="${R}${p.imagenes[i] || p.imagenes[0]}" alt="${esc(fullName(p))}" loading="lazy" width="520" height="650"${extra}>`;
const crumbs = (R, ...items) => `<nav class="crumbs mono" aria-label="Ruta"><a href="${R}index.html">Inicio</a>${items.map(([l, h]) => `<span>/</span>${h ? `<a href="${R}${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`}`).join('')}</nav>`;
const REELS = [['numeris', 'Numeris', 'Las más pedidas'], ['cual-te-llevas', '¿Cuál te llevas?', '5 modelos'], ['uno-o-dos', '¿1 o 2?', '3 duelos'], ['como-pedir', 'Cómo pedir', 'Paso a paso']];
const sh = (left, right, h2, link) => `<div class="sh"><div class="sh__k mono"><span>${left}</span><span>${right}</span></div>${h2 ? `<h2 class="s-lg" data-split>${h2}</h2>` : ''}${link || ''}</div>`;
const mq = (items, attrs = '') => `<div class="mq" ${attrs} aria-hidden="true"><div class="mq__track"><div class="mq__group">${items.map(t => `<span class="mq__item">${esc(t)}<i></i></span>`).join('')}</div></div></div>`;

/* ======================= INICIO ======================= */
function home() {
  const R = '';
  const heroSlides = [['numeris-azul-blanco', 0], ['numeris-negro-suela-blanca', 0], ['air-jordan-4-black-cat', 0], ['louis-vuitton-lv-skate-negro', 0], ['asics-gel-plateado', 0], ['adidas-samba-og', 0], ['nike-shox-tl-negro-plateado', 0], ['air-jordan-3-black-cat', 0]].filter(([s]) => bySlug[s]);
  const sala = [['numeris-azul-blanco', 0], ['numeris-negro-suela-blanca', 0], ['louis-vuitton-lv-skate-negro', 1], ['nike-nocta-negro', 0], ['air-jordan-4-black-cat', 0], ['nike-shox-tl-negro-plateado', 0], ['air-jordan-3-black-cat', 1]].filter(([s]) => bySlug[s]);
  const look = [['louis-vuitton-lv-skate-negro', 3], ['asics-gel-plateado', 0], ['nike-air-force-1-mid', 1], ['air-jordan-3-blanco-gris-cemento', 0], ['puma-suede-xl', 0]].filter(([s]) => bySlug[s]);
  const hm = P.filter(p => forGender(p, 'Hombre')).length, mj = P.filter(p => forGender(p, 'Mujer')).length, nv = P.filter(p => NEW_TAGS.includes(p.etiqueta)).length;
  const body = `
<section class="hero">
  <div class="wrap">
    <div class="hero__top mono"><span>Colección 2026</span><span>Colombia</span><span><b data-n="models">${P.length}</b> modelos</span><span>Tallas ${range(ADULT)}${KIDS.length ? ' · Niños' : ''}</span></div>
    <div class="hero__grid">
      <h1 class="hero__title s-xl" data-split="manual"><span class="hl">Calzado</span><span class="hl hl--in">con <em>filo</em></span><span class="hl">volcánico.</span></h1>
      <figure class="hero__fig">
        <div class="hero__arch arch">
          <a class="hero__slides" href="productos/${heroSlides[0][0]}.html" data-cursor="Ver pieza" aria-label="Ver producto destacado">
            ${heroSlides.map(([s, i], k) => pImg(R, bySlug[s], i, ` data-slug="${s}"${k ? '' : ' class="on"'}`).replace(' loading="lazy"', k ? ' loading="lazy"' : '')).join('\n            ')}
          </a>
        </div>
        <figcaption class="hero__cap mono"><span id="heroCap"></span><span id="heroCapP"></span></figcaption>
      </figure>
      <div class="hero__side">
        <p class="lead">Sneakers seleccionados de Nike, Jordan, Adidas, Louis Vuitton y más. Pides por WhatsApp y te llegan a toda Colombia. <strong>${esc(CodTxt)} los pagas al recibir</strong>.</p>
        <div class="hero__ctas"><a class="btn" href="tienda.html" data-magnetic=".15">Ver la tienda ${arrowBtn}</a><a class="btn btn--line" href="novedades.html">Novedades</a></div>
      </div>
      <a class="cbtn hero__cbtn" href="tienda.html" data-magnetic=".25" aria-label="Comprar ahora">
        <svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><defs><path id="cbr" d="M60,60 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0"/></defs><text><textPath href="#cbr" textLength="312" lengthAdjust="spacing">Comprar ahora · Comprar ahora ·</textPath></text></svg>
        <img src="img/logo/obsidian-logo-sm.webp" alt="" width="44" height="44">
      </a>
    </div>
    <div class="hero__strip mono"><span class="scroll-down"><i></i>Desliza</span><span><span class="dot"></span><span data-cfg="pago">${esc(pago)}</span></span><span data-cfg="envio">${esc(envio)}</span><span data-cfg="cambios">${esc(cambios)}</span></div>
  </div>
</section>

<section class="portal" aria-label="El nombre">
  <div class="portal__win"><div class="marble"></div><img class="portal__logo" src="img/logo/obsidian-logo.webp" alt="" width="900" height="900"></div>
  <div class="portal__words" aria-hidden="true"><span>Nace del</span><span>fuego</span></div>
  <div class="portal__text"><p class="mono">El nombre</p><h2 class="s-lg">Se enfría en segundos y queda <em>afilada</em>.</h2><p class="lead">La obsidiana es vidrio volcánico. Así elegimos cada par: con carácter, sin relleno, para quien camina distinto.</p></div>
</section>

<section class="sala is-dark" aria-label="Sala oscura">
  <div class="marble" style="opacity:.3"></div>
  <div class="sala__pin">
    <div class="wrap sala__head"><div><p class="mono muted">Sala oscura</p><h2 class="s-md" data-split style="margin-top:.8rem">Piezas <em>destacadas</em></h2></div><p class="mono"><b id="salaCur">01</b> / ${pad(sala.length)}</p></div>
    <div class="sala__track" id="salaTrack">
      ${sala.map(([s, i], k) => { const p = bySlug[s]; return `<a class="piece" href="productos/${s}.html" data-cursor="Ver pieza">
        <span class="piece__n">${pad(k + 1)}</span>
        <div class="piece__frame arch">${pImg(R, p, i)}</div>
        <div class="piece__meta"><p class="mono muted">${esc(p.marca)}${p.etiqueta ? ' · ' + esc(p.etiqueta) : ''}</p><h3 class="s-sm">${esc(p.nombre)}</h3><p class="mono"><span data-price-of="${s}">${fmt(p.precio)}</span> — Ver pieza →</p></div>
      </a>`; }).join('\n      ')}
    </div>
    <div class="sala__bar"><i></i></div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    ${sh('Índice', `<span data-n="models">${P.length}</span> modelos`, 'Todo el catálogo, <em>de un vistazo</em>', `<a class="link" href="tienda.html?vista=indice" data-reveal>Ver índice completo ${ico('arrow')}</a>`)}
    <div class="index" id="homeIndex"></div>
  </div>
</section>

${mq(BRANDS.map(b => b.name), 'data-duration="40"')}

<section class="sec">
  <div class="wrap">
    ${sh('Encuentra tu par', `Tallas ${range(ADULT)} EU`, 'Para cada <em>paso</em>')}
    <div class="trio">
      <a class="tcard" href="hombre.html" data-cursor="Ver"><div class="tcard__img arch" data-img="clip">${img(R, 'numeris-negro-1')}</div><div class="tcard__row"><h3 class="s-md">Hombre</h3><p class="mono"><span data-count-gen="Hombre">${hm}</span> modelos</p></div></a>
      <a class="tcard" href="mujer.html" data-cursor="Ver"><div class="tcard__img arch" data-img="clip">${img(R, 'dunk-panda-1')}</div><div class="tcard__row"><h3 class="s-md">Mujer</h3><p class="mono"><span data-count-gen="Mujer">${mj}</span> modelos</p></div></a>
      <a class="tcard" href="novedades.html" data-cursor="Ver"><div class="tcard__img arch" data-img="clip">${img(R, 'nocta-negro-1')}</div><div class="tcard__row"><h3 class="s-md">Novedades</h3><p class="mono"><span data-count-new>${nv}</span> modelos</p></div></a>
    </div>
  </div>
</section>

<section class="sec sec--top0">
  <div class="wrap">
    ${sh('En video', 'TikTok · Instagram', 'Míralos en <em>movimiento</em>', CFG.tiktok ? `<a class="link" href="${esc(CFG.tiktok)}" target="_blank" rel="noopener" data-reveal>Síguenos en TikTok ${ico('arrow')}</a>` : '')}
    <div class="reels">
      ${REELS.map(([v, t, s]) => `<figure class="reel" data-reveal>
        <div class="reel__frame"><video muted loop playsinline preload="none" poster="video/${v}.jpg" data-src="video/${v}.mp4" aria-label="${esc(t)}"></video><button class="reel__snd mono" type="button" aria-pressed="false">Activar sonido</button></div>
        <figcaption class="reel__cap"><span class="s-sm">${esc(t)}</span><span class="mono muted">${esc(s)}</span></figcaption>
      </figure>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="sec sec--top0">
  <div class="wrap">
    ${sh('Colecciones', `${COLS.length} colecciones`, 'Cuatro formas de <em>llevarlo</em>', `<a class="link" href="colecciones.html" data-reveal>Todas las colecciones ${ico('arrow')}</a>`)}
    <div class="stack">
      ${COLS.map((c, i) => `<article class="scard${c.dark ? ' is-dark' : ''}">${c.dark ? '<div class="marble" style="opacity:.25"></div>' : ''}
        <div class="scard__txt"><div><p class="mono muted">${pad(i + 1)} / ${pad(COLS.length)} · <span data-count-col="${c.k}">${c.items.length}</span> modelos</p><h3 class="s-lg">${c.em}</h3><p class="lead">${esc(c.desc)}</p></div><p><a class="btn${c.dark ? ' btn--snow' : ''}" href="colecciones/${c.k}.html">Ver colección ${arrowBtn}</a></p></div>
        <div class="scard__imgs">${c.items.slice(0, 3).map((p, j) => `<a href="productos/${p.slug}.html" data-cursor="Ver pieza" aria-label="${esc(fullName(p))}">${pImg(R, p, j === 0 ? 0 : 1)}</a>`).join('')}</div>
      </article>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="sec sec--top0">
  <div class="wrap">
    ${sh('Marcas', `${BRANDS.length} marcas`, '', `<a class="link" href="marcas.html" data-reveal>Ver todas las marcas ${ico('arrow')}</a>`)}
    <p class="bwords" data-reveal>${BRANDS.map(b => `<a class="bw" href="marcas/${b.slug}.html" data-hover-img="${b.items[0].imagenes[0]}">${esc(b.name)}<sup><span data-count-brand="${esc(b.name)}">${b.items.length}</span></sup></a>`).join('<span class="sep">, </span>')}.</p>
  </div>
</section>

<section class="sec sec--top0">
  <div class="wrap">
    ${sh('Cómo comprar', 'Pedido por WhatsApp', 'Así de <em>simple</em>', `<a class="link" href="como-comprar.html" data-reveal>Ver la guía completa ${ico('arrow')}</a>`)}
    <div class="steps4" data-stagger>
      <div class="st4"><p class="serif">1</p><h3>Elige</h3><p>Entra a la página de cada modelo, mira todas sus fotos y escoge tu talla.</p></div>
      <div class="st4"><p class="serif">2</p><h3>Pide</h3><p>Llena tus datos de envío en la bolsa. El pedido nos llega por WhatsApp.</p></div>
      <div class="st4"><p class="serif">3</p><h3>Confirmamos</h3><p>Te escribimos con la disponibilidad y el costo del envío a tu ciudad.</p></div>
      <div class="st4"><p class="serif">4</p><h3>Paga y recibe</h3><p>${esc(CodTxt)} los pagas al recibir. Los demás modelos, por transferencia antes del envío.</p></div>
    </div>
    <div class="helplinks mono">${HELP.slice(1, 6).map(([h, l]) => `<a class="hlink" href="${h}">${l} ${ico('arrow')}</a>`).join('')}</div>
  </div>
</section>

<section class="sec is-dark" style="position:relative">
  <div class="marble" style="opacity:.22"></div>
  <div class="wrap" style="position:relative">
    ${sh('Lookbook', 'En la calle', 'Cómo se <em>llevan</em>', `<a class="link" href="lookbook.html" data-reveal>Ver el lookbook ${ico('arrow')}</a>`)}
    <div class="lookrow">${look.map(([s, i], k) => `<a href="productos/${s}.html" data-cursor="Ver pieza" data-speed="${[0.06, -0.04, 0.08, -0.06, 0.04][k]}" aria-label="${esc(fullName(bySlug[s]))}">${pImg(R, bySlug[s], i)}</a>`).join('')}</div>
  </div>
</section>`;
  return { file: 'index.html', key: 'home', section: 'home', title: 'OBSIDIAN Sneakers', h1: 'Inicio', desc: `Sneakers seleccionados de Nike, Jordan, Adidas, Louis Vuitton y más. ${pago}. ${envio}.`, body };
}

/* ======================= LISTADOS ======================= */
function listing({ file, R = '', title, h1, h1html, lead, crumbsArr, preset = {}, full = false, heroImg, section = 'shop', others = '', seoTitle, desc }) {
  const base = P.filter(p => (!preset.marca || p.marca === preset.marca) && (!preset.col || (p.colecciones || []).includes(preset.col)) &&
    (!preset.genero || forGender(p, preset.genero)) && (!preset.nuevos || NEW_TAGS.includes(p.etiqueta)));
  const body = `
<section class="lhero">
  <div class="wrap lhero__grid">
    <div>
      ${crumbs(R, ...crumbsArr)}
      <h1 class="s-xl lhero__title" data-split>${h1html || esc(h1)}</h1>
      <p class="lead" data-reveal>${lead}</p>
      <dl class="facts" data-stagger><div><dt class="mono">Modelos</dt><dd><span data-lcount>${base.length}</span></dd></div><div><dt class="mono">Tallas</dt><dd>${range(base)}</dd></div><div><dt class="mono">Desde</dt><dd>${base.length ? fmt(minPrice(base)) : '—'}</dd></div><div>${payFact(base)}</div></dl>
    </div>
    <div class="lhero__arch arch" data-img>${heroImg}</div>
  </div>
</section>
<section class="wrap" style="padding-bottom:clamp(80px,10vw,150px)">
  <div class="ltools mono">
    <div class="ltools__l">${full ? `<label class="lsearch"><span class="sr-only">Buscar en la tienda</span>${ico('search')}<input id="lq" type="search" placeholder="Buscar modelo o color" autocomplete="off"></label><button class="chip mono" type="button" id="ftoggle" aria-expanded="false" aria-controls="fpanel">Filtrar <b></b></button>` : ''}<span id="lgen" style="display:contents"></span></div>
    <div class="ltools__r"><span><b data-lcount>${base.length}</b> modelos</span><label class="sr-only" for="lsort">Ordenar</label><select class="sel mono" id="lsort"><option value="destacados">Destacados</option><option value="precio-asc">Precio ↑</option><option value="precio-desc">Precio ↓</option><option value="nombre">Nombre A–Z</option></select><div class="seg mono" role="group" aria-label="Vista"><button type="button" data-vista="galeria">Galería</button><button type="button" data-vista="indice">Índice</button></div></div>
  </div>
  ${full ? `<div class="fpanel mono" id="fpanel" hidden><div><h4>Marca</h4><div class="chips" id="fBrand"></div></div><div><h4>Colección</h4><div class="chips" id="fCol"></div></div><div><h4>Precio</h4><div class="chips" id="fPrice"></div></div><div><h4>Filtros</h4><div class="chips"><button type="button" class="chip mono" data-reset>Limpiar todo</button></div></div></div>
  <div class="active" id="lactive"></div>` : ''}
  <div class="grid" id="lgrid"></div>
  <div class="index" id="lindex" hidden></div>
  <div class="empty" id="lempty" hidden><p class="s-md">Sin <em>resultados</em></p><p>No encontramos pares con esos filtros.</p><button class="btn" type="button" data-reset>Limpiar filtros ${arrowBtn}</button></div>
  <noscript><ul>${base.map(p => `<li><a href="${R}productos/${p.slug}.html">${esc(fullName(p))} — ${fmt(p.precio)}</a></li>`).join('')}</ul></noscript>
  ${others}
</section>`;
  return { file, R, key: 'listing', section, title: seoTitle || `${h1} | OBSIDIAN`, h1, desc: desc || lead.replace(/<[^>]+>/g, ''), body, flip: true,
    attrs: ` data-preset='${JSON.stringify(preset).replace(/'/g, '&#39;')}'${full ? ' data-filters="full"' : ''}` };
}
const othersBlock = (label, links) => `<div class="sh__k mono" style="margin-top:clamp(60px,8vw,110px)"><span>${label}</span><span></span></div><div class="others mono" style="margin-top:1.2rem">${links}</div>`;

/* ======================= PRODUCTO ======================= */
const swImg = (R, src, alt) => `<img src="${R}${src}" alt="${esc(alt)}" width="64" height="80" loading="lazy">`;
function colorBlock(R, p) {
  if (p.colores?.length) return `<div class="pdp__colors" id="colors">
      <div class="pdp__lab mono"><span>Color</span><span id="colorName" class="muted">Elige uno · ${p.colores.length} colores</span></div>
      <div class="swatches" role="group" aria-label="Elige el color">${p.colores.map(c => `<button type="button" class="sw" data-color="${esc(c.nombre)}" data-foto="${c.foto}" aria-pressed="false" title="${esc(c.nombre)}">${swImg(R, p.imagenes[c.foto - 1] || p.imagenes[0], c.nombre)}</button>`).join('')}</div>
      <p class="size-hint mono" id="colorHint" role="alert"></p>
    </div>`;
  const sib = siblings(p);
  if (sib.length < 2) return '';
  return `<div class="pdp__colors">
      <div class="pdp__lab mono"><span>Color</span><span class="muted">${esc(p.color)} · ${sib.length} colores</span></div>
      <div class="swatches">${sib.map(s => s.id === p.id
        ? `<span class="sw is-on" aria-current="true" title="${esc(s.color)}">${swImg(R, s.imagenes[0], s.color)}</span>`
        : `<a class="sw" href="${R}productos/${s.slug}.html" title="${esc(s.color)} · ${fmt(s.precio)}">${swImg(R, s.imagenes[0], s.color)}</a>`).join('')}</div>
    </div>`;
}
function product(p, i) {
  const R = '../';
  const brand = BRANDS.find(b => b.name === p.marca);
  const prev = P[(i - 1 + P.length) % P.length], next = P[(i + 1) % P.length];
  const gen = p.genero === 'Unisex' ? 'Unisex' : p.genero;
  const cols = COLS.filter(c => (p.colecciones || []).includes(c.k));
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: fullName(p), description: p.descripcion, color: p.color, brand: { '@type': 'Brand', name: p.marca },
    image: p.imagenes.map(s => `${DOMAIN}/${s}`), sku: `OBS-${String(p.n).padStart(3, '0')}`,
    offers: { '@type': 'Offer', priceCurrency: 'COP', price: p.precio, availability: p.agotado ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: `${DOMAIN}/productos/${p.slug}.html` } };
  const body = `
<article class="wrap pdp">
  <div class="pdp__media">
    <div class="pdp__stack">${p.imagenes.map((s, k) => `<figure class="pdp__shot"><img src="${R}${s}" alt="${esc(fullName(p))} — foto ${k + 1}" width="520" height="650"${k ? ' loading="lazy"' : ''}></figure>`).join('')}${p.video ? `<figure class="pdp__shot reel"><video muted loop playsinline preload="none" poster="${R}video/${p.video}.jpg" data-src="${R}video/${p.video}.mp4" aria-label="${esc(fullName(p))} en video"></video><button class="reel__snd mono" type="button" aria-pressed="false">Activar sonido</button></figure>` : ''}</div>
    <p class="pdp__count mono"><b id="shotCur">01</b> / ${pad(p.imagenes.length + (p.video ? 1 : 0))}</p>
  </div>
  <aside class="pdp__info">
    ${crumbs(R, ['Tienda', 'tienda.html'], [p.marca, `marcas/${brand.slug}.html`], [p.nombre])}
    <p class="mono pdp__no">N.º ${pad(p.n)} — <a href="${R}marcas/${brand.slug}.html">${esc(p.marca)}</a>${p.etiqueta ? ` · <span class="ember">${esc(p.etiqueta)}</span>` : ''}</p>
    <h1 class="s-lg pdp__name" data-split="manual">${esc(p.nombre)}</h1>
    <p class="pdp__color">${esc(p.color)} · ${gen} · Tallas ${range([p])}</p>
    <p class="pdp__price" data-price>${fmt(p.precio)}</p>
    <p class="mono muted">${isCOD(p) ? 'Pago contraentrega' : 'Pago anticipado por transferencia'} · <span data-cfg="envio">${esc(envio)}</span></p>
    ${colorBlock(R, p)}
    <div class="pdp__sizes">
      <div class="pdp__lab mono"><span>Talla (EU)</span><a href="${R}guia-de-tallas.html">Guía de tallas</a></div>
      <div class="sizes${sizeGrid(p).length > 10 ? ' sizes--2' : ''}" id="sizes" role="group" aria-label="Elige tu talla" style="--n:${sizeGrid(p).length > 10 ? Math.ceil(sizeGrid(p).length / 2) : sizeGrid(p).length}">${sizeGrid(p).map(t => `<button type="button" class="size" data-size="${t}" aria-pressed="false"${p.tallas.includes(t) && !p.agotado ? '' : ' disabled'}>${t}</button>`).join('')}</div>
      <p class="size-hint mono" id="sizeHint" role="alert"></p>
    </div>
    <div class="pdp__buy">
      <div class="qty"><button type="button" data-q="-1" aria-label="Menos">−</button><output id="qty">1</output><button type="button" data-q="1" aria-label="Más">+</button></div>
      <button class="btn" type="button" id="addBtn" data-magnetic=".12">Agregar a la bolsa ${arrowBtn}</button>
      <a class="btn btn--line" id="waBtn" href="#">Pedir por WhatsApp ${ico('wa')}</a>
    </div>
    <p class="pdp__desc">${esc(p.descripcion)}</p>
    <dl class="spec mono">
      <div><dt>Marca</dt><dd><a href="${R}marcas/${brand.slug}.html">${esc(p.marca)}</a></dd></div>
      <div><dt>Modelo</dt><dd>${esc(p.nombre)}</dd></div>
      <div><dt>Color</dt><dd>${esc(p.color)}</dd></div>
      <div><dt>Tallas</dt><dd>${p.tallas.join(' · ')} (EU)</dd></div>
      ${cols.length ? `<div><dt>Colección</dt><dd>${cols.map(c => `<a href="${R}colecciones/${c.k}.html">${c.name}</a>`).join(', ')}</dd></div>` : ''}
      <div><dt>Referencia</dt><dd>OBS-${String(p.n).padStart(3, '0')}</dd></div>
    </dl>
    <div class="pdp__help mono"><a class="link" href="${R}envios.html">Envíos</a><a class="link" href="${R}pagos.html">Pagos</a><a class="link" href="${R}cambios.html">Cambios</a><a class="link" href="${R}como-comprar.html">Cómo comprar</a></div>
  </aside>
</article>
<section class="sec sec--top0">
  <div class="wrap">
    ${sh(`Más de ${esc(p.marca)}`, `<a class="link" href="${R}marcas/${brand.slug}.html">Ver todo ${esc(p.marca)}</a>`, 'Completa tu <em>rotación</em>')}
    <div class="grid" id="relGrid" data-stagger></div>
  </div>
</section>
<nav class="wrap pnav mono" aria-label="Otros productos" style="margin-bottom:clamp(60px,8vw,120px)">
  <a href="${R}productos/${prev.slug}.html"><span>← Pieza anterior</span><span class="serif">${esc(prev.nombre)}</span></a>
  <a href="${R}productos/${next.slug}.html"><span>Pieza siguiente →</span><span class="serif">${esc(next.nombre)}</span></a>
</nav>
<div class="mbar" id="mbar"><div><p class="serif">${esc(p.nombre)}</p><p class="mono" data-price>${fmt(p.precio)}</p></div><button class="btn btn--sm" type="button" id="mbarAdd">Agregar</button></div>`;
  return { file: `productos/${p.slug}.html`, R, key: 'product', section: 'shop', title: `${fullName(p)} ${p.color} | OBSIDIAN`, h1: p.nombre,
    desc: `${fullName(p)} (${p.color}) por ${fmt(p.precio)}. ${p.descripcion}`.slice(0, 300), body, image: p.imagenes[0],
    attrs: ` data-product="${p.slug}"`, jsonld: `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n` };
}

/* ======================= COLECCIONES / MARCAS (índices) ======================= */
function collectionsIndex() {
  const body = `
<section class="lhero"><div class="wrap">
  ${crumbs('', ['Colecciones'])}
  <h1 class="s-xl lhero__title" data-split>Colec<em>ciones</em></h1>
  <p class="lead" data-reveal>Cuatro formas de llevar OBSIDIAN. Cada colección tiene su propia página con todos sus modelos.</p>
</div></section>
<section class="wrap" style="padding-bottom:clamp(80px,10vw,150px)">
  ${COLS.map(c => `<article class="crow">
    <p class="crow__n">${c.items.length}<br><span class="mono muted">modelos</span></p>
    <div class="crow__txt"><h2 class="s-lg" data-split><a href="colecciones/${c.k}.html">${c.em}</a></h2><p class="lead">${esc(c.desc)}</p><p class="mono muted" style="margin-bottom:1.4rem">Tallas ${range(c.items)} · Desde ${fmt(minPrice(c.items))}</p><a class="btn" href="colecciones/${c.k}.html">Ver ${c.name} ${arrowBtn}</a></div>
    <div class="crow__imgs" data-stagger>${c.items.slice(0, 3).map(p => `<a href="productos/${p.slug}.html" data-cursor="Ver pieza" aria-label="${esc(fullName(p))}">${pImg('', p)}</a>`).join('')}</div>
  </article>`).join('\n  ')}
</section>`;
  return { file: 'colecciones.html', key: 'index', section: 'collections', title: 'Colecciones | OBSIDIAN', h1: 'Colecciones', desc: 'Blackout, Icons, Luxury y Runner: las colecciones de sneakers de OBSIDIAN.', body };
}
function brandsIndex() {
  const body = `
<section class="lhero"><div class="wrap">
  ${crumbs('', ['Marcas'])}
  <h1 class="s-xl lhero__title" data-split>Mar<em>cas</em></h1>
  <p class="lead" data-reveal>${BRANDS.length} marcas, cada una con su página. Pasa el cursor para ver un modelo.</p>
</div></section>
<section class="wrap" style="padding-bottom:clamp(80px,10vw,150px)">
  <div class="index">
    ${BRANDS.map(b => `<a class="brow" href="marcas/${b.slug}.html" data-hover-img="${b.items[0].imagenes[0]}"><span class="mono">${pad(b.items.length)}</span><span class="serif">${esc(b.name)}</span><span class="mono">Tallas ${range(b.items)}</span><span class="mono c-range">Desde ${fmt(minPrice(b.items))}</span>${ico('arrowUR')}</a>`).join('\n    ')}
  </div>
</section>`;
  return { file: 'marcas.html', key: 'index', section: 'brands', title: 'Marcas | OBSIDIAN', h1: 'Marcas', desc: `Compra por marca: ${BRANDS.map(b => b.name).join(', ')}.`, body };
}

/* ======================= LOOKBOOK ======================= */
function lookbook() {
  const shots = [['louis-vuitton-lv-skate-negro', 3], ['nike-air-force-1-mid', 1], ['puma-suede-xl', 0], ['asics-gel-plateado', 0], ['louis-vuitton-lv-skate-negro', 2], ['nike-dunk-low-panda', 0],
    ['air-jordan-1-low-black-patent', 1], ['nike-air-force-1-mid', 2], ['air-jordan-3-black-cat', 1], ['nike-shox-tl-negro-plateado', 0], ['air-jordan-4-black-cat', 0], ['puma-park-lifestyle', 1]].filter(([s]) => bySlug[s]);
  const body = `
<section class="lhero"><div class="wrap">
  ${crumbs('', ['Lookbook'])}
  <h1 class="s-xl lhero__title" data-split>Look<em>book</em></h1>
  <p class="lead" data-reveal>Cómo se ven en la calle. Toca cualquier foto para ir a la página del par.</p>
</div></section>
<section class="wrap" style="padding-bottom:clamp(80px,10vw,150px)">
  <div class="lb">
    ${shots.map(([s, i], k) => { const p = bySlug[s]; return `<a class="lb__it" href="productos/${s}.html" data-cursor="Ver pieza"${k % 2 ? ' data-speed=".05"' : ''}><div class="lb__img" data-img="clip">${pImg('', p, i)}</div><figcaption class="mono"><span>${esc(fullName(p))}</span><span data-price-of="${s}">${fmt(p.precio)}</span></figcaption></a>`; }).join('\n    ')}
  </div>
</section>`;
  return { file: 'lookbook.html', key: 'lookbook', section: 'lookbook', title: 'Lookbook | OBSIDIAN', h1: 'Lookbook', desc: 'Los sneakers de OBSIDIAN en la calle.', body };
}

/* ======================= NOSOTROS ======================= */
function about() {
  const body = `
<section class="lhero">
  <div class="wrap lhero__grid">
    <div>
      ${crumbs('', ['Nosotros'])}
      <h1 class="s-xl lhero__title" data-split>Forjados en <em>obsidiana</em></h1>
      <p class="lead" data-reveal>Una tienda de sneakers para quienes no caminan como los demás.</p>
    </div>
    <div class="lhero__arch arch is-dark" data-img="clip" style="display:grid;place-items:center"><div class="marble"></div><img src="img/logo/obsidian-logo.webp" alt="Logo de OBSIDIAN" style="position:relative;width:72%;height:auto" width="900" height="900"></div>
  </div>
</section>
<section class="wrap" style="padding-bottom:clamp(60px,8vw,110px)">
  <div class="doc__body" style="margin-inline:auto">
    <div class="dsec"><p class="dsec__n">I</p><div><h2>El nombre</h2><p>La obsidiana es vidrio volcánico: nace del fuego, se enfría en segundos y queda negra, brillante y afilada.</p><p>Esa es la idea detrás de OBSIDIAN: pares con carácter, elegidos uno por uno, para quienes quieren que sus tenis hablen antes que ellos.</p></div></div>
    <div class="dsec"><p class="dsec__n">II</p><div><h2>Cómo elegimos</h2><p>Seleccionamos los modelos que marcan tendencia, de los clásicos de siempre a las piezas más buscadas. Cada uno tiene su propia página con todas sus fotos, sus tallas y su precio.</p></div></div>
    <div class="dsec"><p class="dsec__n">III</p><div><h2>Cómo vendemos</h2><p>Haces tu pedido en la web, nos llega por WhatsApp y te confirmamos disponibilidad y envío. ${esc(CodTxt)} los pagas cuando los recibes; los demás modelos, por transferencia antes del despacho. <a href="como-comprar.html">Ver cómo comprar</a>.</p></div></div>
  </div>
</section>
${mq(['Curaduría', 'Confianza', 'Cercanía', 'Actitud'], 'data-duration="34"')}
<section class="sec">
  <div class="wrap">
    ${sh('Lo que nos mueve', '4 valores', 'Nuestros <em>valores</em>')}
    <div class="steps4" data-stagger>
      <div class="st4"><p class="serif">C</p><h3>Curaduría</h3><p>Solo entra al catálogo lo que nosotros mismos usaríamos.</p></div>
      <div class="st4"><p class="serif">C</p><h3>Confianza</h3><p>${esc(CodTxt)} los pagas cuando los tienes en la mano. En los demás modelos pagas solo a la cuenta que te enviamos desde nuestro WhatsApp.</p></div>
      <div class="st4"><p class="serif">C</p><h3>Cercanía</h3><p>Hablas con una persona real por WhatsApp, antes y después de tu compra.</p></div>
      <div class="st4"><p class="serif">A</p><h3>Actitud</h3><p>Estética oscura, limpia y pares con presencia.</p></div>
    </div>
    <div class="helplinks mono"><a class="hlink" href="tienda.html">Ver la tienda ${ico('arrow')}</a><a class="hlink" href="colecciones.html">Colecciones ${ico('arrow')}</a><a class="hlink" href="contacto.html">Contacto ${ico('arrow')}</a></div>
  </div>
</section>`;
  return { file: 'nosotros.html', key: 'about', section: 'about', title: 'Nosotros | OBSIDIAN', h1: 'Nosotros', desc: 'La historia detrás de OBSIDIAN: sneakers con carácter, elegidos uno por uno.', body };
}

/* ======================= AYUDA ======================= */
function doc(file, h1html, h1, lead, sections, extra = '', key = 'help', desc) {
  const toc = `<nav class="toc mono" aria-label="Ayuda"><h4>Ayuda</h4>${HELP.map(([h, l]) => `<a href="${h}"${h === file ? ' class="is-on" aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const body = `
<div class="wrap doc">
  ${toc}
  <article class="doc__body">
    ${crumbs('', ['Ayuda', 'como-comprar.html'], [h1])}
    <h1 class="s-lg" data-split>${h1html}</h1>
    <p class="lead" data-reveal>${lead}</p>
    ${sections.map(([n, t, html]) => `<section class="dsec" data-reveal><p class="dsec__n">${n}</p><div><h2>${t}</h2>${html}</div></section>`).join('\n    ')}
    ${extra}
  </article>
</div>`;
  return { file, key, section: 'help', title: `${h1} | OBSIDIAN`, h1, desc: desc || lead.replace(/<[^>]+>/g, ''), body };
}
const waCallout = (t = '¿Prefieres que te atendamos directamente?') => `<div class="callout" data-reveal><div class="marble"></div><p class="s-sm">${t}</p><a class="btn btn--snow" data-wa href="#">${ico('wa')} Escríbenos</a></div>`;
const cfg = (k, v) => `<span data-cfg="${k}">${esc(v)}</span>`;

function helpPages() {
  const footSvg = `<svg viewBox="0 0 200 320" role="img" aria-label="Cómo medir el pie: del talón a la punta del dedo más largo"><rect x="20" y="10" width="160" height="300" fill="none" stroke="currentColor" stroke-opacity=".25"/><path d="M100 290c-34 0-50-30-50-80 0-40 6-70 12-100 6-34 12-70 40-70 26 0 34 30 36 64 2 30 10 60 10 106 0 50-14 80-48 80Z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="160" y1="30" x2="160" y2="292" stroke="#ff4f1f" stroke-width="2"/><path d="M154 38l6-8 6 8M154 284l6 8 6-8" fill="none" stroke="#ff4f1f" stroke-width="2"/><text x="146" y="166" font-family="JetBrains Mono, monospace" font-size="11" fill="currentColor" text-anchor="end" transform="rotate(-90 146 166)">TALÓN → PUNTA</text></svg>`;
  return [
    doc('como-comprar.html', 'Cómo <em>comprar</em>', 'Cómo comprar', `Comprar en OBSIDIAN toma unos minutos. ${CodTxt} se pagan al recibir y los demás modelos, por transferencia.`, [
      ['1', 'Elige tu par', '<p>Explora la <a href="tienda.html">tienda</a>, filtra por marca, colección o género y entra a la página de cada modelo para ver todas sus fotos.</p>'],
      ['2', 'Escoge tu talla', '<p>Selecciona tu talla en formato EU. Si dudas, revisa la <a href="guia-de-tallas.html">guía de tallas</a> o escríbenos antes de pedir.</p>'],
      ['3', 'Completa tus datos', '<p>En tu bolsa escribes nombre, celular, ciudad y dirección. En la web nunca te pedimos datos de tarjetas ni de cuentas bancarias.</p>'],
      ['4', 'Envía el pedido', '<p>Tu pedido queda registrado y se arma un mensaje de WhatsApp con todo el detalle. Lo envías y te respondemos con disponibilidad y costo de envío.</p>'],
      ['5', 'Paga y recibe', `<p>${cfg('pagoDetalle', CFG.pagoDetalle || 'Pagas cuando recibes tus tenis.')}</p>`],
    ], waCallout()),
    doc('envios.html', 'En<em>víos</em>', 'Envíos', `${esc(envio)}. Te confirmamos el costo y el tiempo antes de despachar.`, [
      ['1', 'Cobertura', `<p>${cfg('envio', envio)}.</p>`],
      ['2', 'Costo', `<p>${cfg('envioDetalle', CFG.envioDetalle || 'El costo depende de tu ciudad.')}</p>`],
      ['3', 'Tiempo de entrega', '<p>Depende de tu ciudad. Te lo confirmamos por WhatsApp junto con el costo, antes de despachar tu pedido.</p>'],
      ['4', 'Seguimiento', '<p>Cuando despachamos tu pedido te avisamos por WhatsApp.</p>'],
      ['5', 'Tu dirección', '<p>Revisa que tu dirección, barrio y celular estén completos. Así evitamos retrasos en la entrega.</p>'],
    ], waCallout('¿Quieres saber cuánto cuesta el envío a tu ciudad?')),
    doc('pagos.html', 'Pa<em>gos</em>', 'Pagos', `${CodTxt} se pagan contraentrega. Los demás modelos se pagan por adelantado, por transferencia.`, [
      ['1', 'Modelos contraentrega', `<p>Estos los pagas en efectivo cuando recibes tus tenis: ${P.filter(isCOD).map(p => `<a href="productos/${p.slug}.html">${esc(fullName(p))} ${esc(p.color)}</a>`).join(', ')}. Los demás Air Force 1 (de colores, Mid y High) se pagan por adelantado.</p>`],
      ['2', 'Demás modelos: pago anticipado', `<p>Pagas por transferencia antes del envío. Te mandamos los datos de pago por WhatsApp${waNum ? ` desde nuestro número oficial, ${waNum}` : ''}: paga solo a esa cuenta y mándanos el comprobante. Despachamos apenas confirmamos el pago.</p>`],
      ['3', 'Cuánto pagas', '<p>El valor de tus productos más el envío. Te confirmamos el total por WhatsApp antes de despachar, así no hay sorpresas.</p>'],
      ['4', 'Sin datos bancarios en la web', '<p>En esta página nunca te pedimos números de tarjeta, claves ni datos de cuentas bancarias.</p>'],
    ], waCallout('¿Tienes una duda sobre el pago?')),
    doc('cambios.html', 'Cam<em>bios</em>', 'Cambios', `${esc(cambios)}. Si no te quedó, te ayudamos.`, [
      ['1', 'Cambios de talla', `<p>${cfg('cambiosDetalle', CFG.cambiosDetalle || 'Escríbenos y te ayudamos con el cambio.')}</p>`],
      ['2', 'Cómo pedirlo', '<p>Escríbenos por WhatsApp con tu número de pedido o tu nombre, el modelo y la talla que necesitas. Te explicamos las condiciones y cómo enviarnos el par.</p>'],
      ['3', 'Antes de pedir', '<p>Revisa la <a href="guia-de-tallas.html">guía de tallas</a>. Si estás entre dos tallas, escríbenos y te recomendamos según el modelo.</p>'],
    ], waCallout('¿Necesitas cambiar tu talla?')),
    doc('guia-de-tallas.html', 'Guía de <em>tallas</em>', 'Guía de tallas', 'Mide tu pie y busca tu talla EU en la tabla. Es una referencia aproximada: puede variar un poco según la marca.', [
      ['1', 'Cómo medir tu pie', `<div class="measure">${footSvg}<ul><li>Pon una hoja en el piso, contra la pared.</li><li>Párate sobre ella con el talón pegado a la pared.</li><li>Marca la punta de tu dedo más largo.</li><li>Mide en centímetros del borde de la hoja a la marca.</li><li>Mide los dos pies y usa la medida mayor.</li></ul></div>`],
      ['2', 'Tabla de equivalencias', `<div class="tablewrap"><table class="sizetable"><thead><tr><th>EU</th><th>Pie (cm)</th><th>US hombre</th><th>US mujer</th></tr></thead><tbody>${SIZE_TABLE.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`],
      ['3', 'Consejos', '<ul><li>Mide tu pie al final del día, cuando está un poco más grande.</li><li>Si estás entre dos tallas, escríbenos antes de pedir.</li><li>Algunos modelos solo vienen en tallas de hombre (40 en adelante) o de mujer (36–39). En cada página ves las tallas disponibles.</li><li>Para niños manejamos tallas de la 24 a la 35: escríbenos la medida del pie y te ayudamos a elegir.</li></ul>'],
    ], waCallout('¿Dudas con tu talla? Te ayudamos.')),
    doc('preguntas-frecuentes.html', 'Preguntas <em>frecuentes</em>', 'Preguntas frecuentes', 'Lo que más nos preguntan. Si no encuentras tu respuesta, escríbenos.', [], `<div class="acc" data-reveal style="margin-top:clamp(30px,4vw,56px)">${[
      ['¿Cómo hago mi pedido?', 'Agrega tus pares a la bolsa, llena tus datos de envío y presiona “Enviar pedido”. Tu pedido queda registrado y se abre WhatsApp con el mensaje listo. <a href="como-comprar.html">Ver la guía</a>.'],
      ['¿Cómo pago?', `${cfg('pago', pago)}. ${cfg('pagoDetalle', CFG.pagoDetalle || '')}`],
      ['¿Cuánto cuesta el envío?', cfg('envioDetalle', CFG.envioDetalle || '')],
      ['¿A qué ciudades envían?', `${cfg('envio', envio)}.`],
      ['¿Y si no me queda la talla?', cfg('cambiosDetalle', CFG.cambiosDetalle || '')],
      ['¿Qué tallas manejan?', 'Tallas EU de la 35 a la 45 para adultos y de la 24 a la 35 para niños. Algunos modelos solo vienen en tallas de hombre (40 en adelante) o de mujer (36–39). Revisa la <a href="guia-de-tallas.html">guía de tallas</a>.'],
      ['¿Tengo que pagar algo en la web?', `No. En la web solo armas tu pedido. ${CodTxt} los pagas al recibir; para los demás modelos te mandamos los datos de pago por WhatsApp.`],
      ['¿Cómo los contacto?', 'Por WhatsApp desde cualquier botón “Escríbenos” o desde la página de <a href="contacto.html">contacto</a>.'],
    ].map(([q, a]) => `<div class="acc__item"><button type="button" class="acc__btn">${q}<i></i></button><div class="acc__panel"><div><p>${a}</p></div></div></div>`).join('')}</div>${waCallout('¿No encontraste tu respuesta?')}`),
    doc('contacto.html', 'Con<em>tacto</em>', 'Contacto', '¿Dudas con tu talla, un modelo o tu pedido? Escríbenos y te respondemos por WhatsApp.', [], `
    <div class="chan" data-stagger style="margin-top:clamp(30px,4vw,56px)">
      <a data-wa href="#">${ico('wa')}<div><p class="mono muted">Canal principal</p><p class="s-sm">WhatsApp</p><p class="muted">Pedidos, tallas y disponibilidad.</p></div><span class="link">Escribir ahora</span></a>
      <a id="chIg" href="#" target="_blank" rel="noopener">${ico('ig')}<div><p class="mono muted">Síguenos</p><p class="s-sm">Instagram</p><p class="muted" id="chIgU"></p></div><span class="link">Ver perfil</span></a>
      <a id="chTk" href="#" target="_blank" rel="noopener">${ico('tk')}<div><p class="mono muted">Síguenos</p><p class="s-sm">TikTok</p><p class="muted" id="chTkU"></p></div><span class="link">Ver perfil</span></a>
      <a id="chMail" href="#">${ico('mail')}<div><p class="mono muted">Correo</p><p class="s-sm">Email</p><p class="muted" id="chMailU"></p></div><span class="link">Escribir correo</span></a>
    </div>
    <section class="dsec" data-reveal><p class="dsec__n">→</p><div><h2>Escríbenos aquí</h2><p style="margin-bottom:1.4rem">Tu mensaje se abre en WhatsApp, listo para enviar.</p>
      <form class="form" id="contactForm" novalidate>
        <div class="field"><label class="mono" for="cNombre">Nombre</label><input id="cNombre" name="nombre" autocomplete="name" required></div>
        <div class="field"><label class="mono" for="cCiudad">Ciudad</label><input id="cCiudad" name="ciudad" autocomplete="address-level2"></div>
        <div class="field full"><label class="mono" for="cMotivo">Motivo</label><select id="cMotivo" name="motivo"><option>Quiero hacer un pedido</option><option>Duda de tallas</option><option>Cambio de talla</option><option>Otro</option></select></div>
        <div class="field full"><label class="mono" for="cMensaje">Mensaje</label><textarea id="cMensaje" name="mensaje" rows="4" required></textarea></div>
        <button class="btn full" type="submit">Enviar por WhatsApp ${ico('wa')}</button>
        <a class="link full" id="cFallback" href="#" target="_blank" rel="noopener" hidden>Si WhatsApp no se abrió, toca aquí</a>
      </form></div></section>`, 'contact'),
    doc('privacidad.html', 'Priva<em>cidad</em>', 'Privacidad', 'Cómo tratamos los datos que nos das cuando haces un pedido.', [
      ['1', 'Qué datos pedimos', '<p>Nombre, celular, ciudad, dirección, barrio y notas de entrega. Solo los pedimos cuando haces un pedido.</p>'],
      ['2', 'Para qué los usamos', '<p>Para preparar, confirmar y entregar tu pedido, y para comunicarnos contigo por WhatsApp sobre ese pedido.</p>'],
      ['3', 'Dónde se guardan', '<p>Tu pedido queda registrado en nuestro sistema de pedidos para poder gestionarlo. Además, tu navegador guarda tu bolsa y tus datos de envío en este dispositivo para que no tengas que escribirlos de nuevo; puedes borrarlos limpiando los datos del sitio en tu navegador.</p>'],
      ['4', 'Con quién los compartimos', '<p>No vendemos tus datos. Solo los compartimos con la transportadora que entrega tu pedido.</p>'],
      ['5', 'Enlaces de vendedores', '<p>Si llegas a la tienda por el enlace de uno de nuestros vendedores (por ejemplo <em>obsidiancol.shop/?ref=juan</em>), tu navegador guarda ese código durante 30 días, te mostramos los precios de ese vendedor y lo agregamos a tu pedido para saber quién te atendió. No guarda nada más sobre ti.</p>'],
      ['6', 'Tus derechos', '<p>Conforme a la Ley 1581 de 2012 de protección de datos personales, puedes pedirnos por WhatsApp que consultemos, actualicemos o eliminemos tus datos.</p>'],
    ]),
  ];
}

/* ======================= BOLSA ======================= */
function cartPage() {
  const body = `
<section class="lhero" style="padding-bottom:30px"><div class="wrap">
  ${crumbs('', ['Tu bolsa'])}
  <h1 class="s-xl lhero__title" data-split>Tu <em>bolsa</em> <span class="muted" id="cartCount">00</span></h1>
</div></section>
<section class="wrap cartpage">
  <div class="cartpage__list" id="cartList"></div>
  <aside class="receipt" id="receipt" hidden>
    <h2>Recibo</h2>
    <p class="mono muted">OBSIDIAN · ${esc(CFG.dominio || 'obsidiancol.shop')}</p>
    <div class="rrows mono"><div><span>Productos</span><span id="sumItems"></span></div><div><span>Subtotal</span><span id="sumSub"></span></div><div><span>Envío</span><span>Se confirma por WhatsApp</span></div><div id="sumRefRow" hidden><span>Vendedor</span><span id="sumRef"></span></div></div>
    <div class="tot"><span class="mono">Total productos</span><b id="sumTotal"></b></div>
    <div class="paynote">${ico('cash')}<div><strong id="payTitle">${esc(pago)}</strong><br><span id="payDetail">${esc(CFG.pagoDetalle || '')}</span></div></div>
    <form class="form" id="checkout" novalidate>
      <div class="field full"><label class="mono" for="oNombre">Nombre completo</label><input id="oNombre" name="nombre" autocomplete="name" required><span class="err"></span></div>
      <div class="field"><label class="mono" for="oCel">Celular</label><input id="oCel" name="celular" type="tel" inputmode="tel" autocomplete="tel" required><span class="err"></span></div>
      <div class="field"><label class="mono" for="oCiudad">Ciudad</label><input id="oCiudad" name="ciudad" autocomplete="address-level2" required><span class="err"></span></div>
      <div class="field full"><label class="mono" for="oDir">Dirección</label><input id="oDir" name="direccion" autocomplete="street-address" required><span class="err"></span></div>
      <div class="field full"><label class="mono" for="oBarrio">Barrio</label><input id="oBarrio" name="barrio" autocomplete="address-level3" required><span class="err"></span></div>
      <div class="field full"><label class="mono" for="oNotas">Notas para la entrega (opcional)</label><textarea id="oNotas" name="notas" rows="2"></textarea></div>
      <div class="sr-only" aria-hidden="true"><label for="oWeb">No llenar este campo</label><input id="oWeb" name="website" tabindex="-1" autocomplete="off"></div>
      <button class="btn btn--block full" type="submit">Enviar pedido ${arrowBtn}</button>
      <p class="mono muted full">Al enviar aceptas nuestra <a class="link" href="privacidad.html">política de privacidad</a>.</p>
    </form>
    <div class="done" id="checkoutDone" hidden>
      <div class="done__ico">${ico('check')}</div>
      <h3 id="doneNum">Pedido listo</h3>
      <p id="doneTxt"></p>
      <div class="row"><a class="btn btn--block" id="doneWa" href="#" target="_blank" rel="noopener">Enviar por WhatsApp ${ico('wa')}</a><button class="btn btn--line btn--block btn--sm" type="button" id="doneBack">Volver</button><button class="link" type="button" id="doneClear" style="justify-self:center;margin-top:.6rem">Vaciar bolsa</button></div>
    </div>
  </aside>
</section>`;
  return { file: 'carrito.html', key: 'cart', section: 'cart', title: 'Tu bolsa | OBSIDIAN', h1: 'Tu bolsa', desc: 'Tu bolsa OBSIDIAN. Finaliza tu pedido por WhatsApp.', body, robots: 'noindex' };
}

/* ======================= 404 ======================= */
function notFound() {
  const R = '/';
  const body = `
<section class="nf"><div class="wrap">
  <p class="mono muted">Error 404</p>
  <p class="nf__n">404</p>
  <p>Esta página se perdió en la oscuridad. Vuelve al inicio o sigue explorando la tienda.</p>
  <div class="row"><a class="btn" href="${R}index.html">Ir al inicio ${arrowBtn}</a><a class="btn btn--line" href="${R}tienda.html">Ver la tienda</a></div>
</div></section>`;
  return { file: '404.html', R, key: 'notfound', title: 'Página no encontrada | OBSIDIAN', h1: 'Error 404', desc: 'Esta página no existe.', body, robots: 'noindex' };
}

/* ======================= construir ======================= */
const pages = [
  home(),
  listing({ file: 'tienda.html', title: 'Tienda', h1: 'Tienda', h1html: 'Tien<em>da</em>', lead: `Los ${P.length} modelos de OBSIDIAN. Busca, filtra por marca, colección o precio y cambia entre galería e índice.`, crumbsArr: [['Tienda']], full: true, heroImg: `<img src="img/products/numeris-azul-1.jpg" alt="" width="520" height="650">`, seoTitle: 'Tienda | OBSIDIAN' }),
  listing({ file: 'novedades.html', title: 'Novedades', h1: 'Novedades', h1html: 'Nove<em>dades</em>', lead: 'Lo nuevo y lo que está marcando tendencia: lanzamientos, colaboraciones y ediciones especiales.', crumbsArr: [['Tienda', 'tienda.html'], ['Novedades']], preset: { nuevos: true }, heroImg: `<img src="img/products/numeris-negro-1.jpg" alt="" width="520" height="650">` }),
  listing({ file: 'hombre.html', title: 'Hombre', h1: 'Hombre', h1html: 'Hom<em>bre</em>', lead: `Modelos disponibles en tallas de hombre (${genRange('Hombre')}), incluidos los unisex.`, crumbsArr: [['Tienda', 'tienda.html'], ['Hombre']], preset: { genero: 'Hombre' }, heroImg: `<img src="img/products/numeris-azul-1.jpg" alt="" width="520" height="650">` }),
  listing({ file: 'mujer.html', title: 'Mujer', h1: 'Mujer', h1html: 'Mu<em>jer</em>', lead: `Modelos disponibles en tallas de mujer (${genRange('Mujer')}), incluidos los unisex.`, crumbsArr: [['Tienda', 'tienda.html'], ['Mujer']], preset: { genero: 'Mujer' }, heroImg: `<img src="img/products/dunk-panda-1.jpg" alt="" width="520" height="650">` }),
  ...(KIDS.length ? [listing({ file: 'ninos.html', title: 'Niños', h1: 'Niños', h1html: 'Ni<em>ños</em>', lead: `Tenis para los más pequeños, en tallas de niño (${genRange('Niños')}).`, crumbsArr: [['Tienda', 'tienda.html'], ['Niños']], preset: { genero: 'Niños' }, heroImg: `<img src="${KIDS[0].imagenes[0]}" alt="" width="520" height="650">` })] : []),
  collectionsIndex(),
  ...COLS.map(c => listing({ file: `colecciones/${c.k}.html`, R: '../', title: c.name, h1: c.name, h1html: c.em, lead: esc(c.desc), crumbsArr: [['Colecciones', 'colecciones.html'], [c.name]], preset: { col: c.k }, section: 'collections',
    heroImg: `<img src="../img/products/${c.img}.jpg" alt="" width="520" height="650">`, seoTitle: `Colección ${c.name} | OBSIDIAN`,
    others: othersBlock('Otras colecciones', COLS.filter(o => o.k !== c.k).map(o => `<a class="chip mono" href="../colecciones/${o.k}.html">${o.name} <small>${o.items.length}</small></a>`).join('')) })),
  brandsIndex(),
  ...BRANDS.map(b => listing({ file: `marcas/${b.slug}.html`, R: '../', title: b.name, h1: b.name, lead: esc(b.desc), crumbsArr: [['Marcas', 'marcas.html'], [b.name]], preset: { marca: b.name }, section: 'brands',
    heroImg: `<img src="../${b.items[0].imagenes[0]}" alt="" width="520" height="650">`, seoTitle: `${b.name} | OBSIDIAN`,
    others: othersBlock('Otras marcas', BRANDS.filter(o => o.slug !== b.slug).map(o => `<a class="chip mono" href="../marcas/${o.slug}.html">${esc(o.name)} <small>${o.items.length}</small></a>`).join('')) })),
  ...P.map(product),
  lookbook(),
  about(),
  ...helpPages(),
  cartPage(),
  notFound(),
];

for (const dir of ['productos', 'marcas', 'colecciones']) {
  const d = path.join(SITE, dir);
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(d)) if (f.endsWith('.html')) fs.unlinkSync(path.join(d, f));
}
for (const pg of pages) fs.writeFileSync(path.join(SITE, pg.file), page(pg));
const indexable = pages.filter(pg => !pg.robots).map(pg => pg.file === 'index.html' ? '' : pg.file);
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(f => `  <url><loc>${DOMAIN}/${f}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Listo: ${pages.length} páginas generadas (${P.length} productos, ${BRANDS.length} marcas, ${COLS.length} colecciones).`);
