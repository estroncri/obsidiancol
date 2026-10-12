/* =====================================================================
   OBSIDIAN — panel de pedidos, vendedores y costos
   Lee y actualiza lo guardado en Google Sheets (pedidosApi).
   Sin conexión configurada ofrece un modo de demostración.
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.OBSIDIAN_CONFIG || {};
  const API = String(CFG.pedidosApi || '').trim();
  const SITE = `https://${CFG.dominio || 'obsidiancol.shop'}`;
  const EXTRA = Number(CFG.aumentoPrecio) || 0;
  const PRODUCTS = (window.OBSIDIAN_PRODUCTS || []).map(p => ({ ...p, precio: p.precio + EXTRA }));
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const ESTADOS = ['Nuevo', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
  const KEY = 'obs-panel-clave';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cleanCode = v => norm(v).replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  const fullName = p => (norm(p.nombre).startsWith(norm(p.marca)) || /^air jordan/i.test(p.nombre)) ? p.nombre : `${p.marca} ${p.nombre}`;
  const firstName = n => String(n || '').replace(/^Ejemplo · /, '').split(' ')[0];
  const keep = {
    get() { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
    set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY, v); } catch (e) { /* bloqueado */ } },
    clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { /* bloqueado */ } },
  };
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
  const btnIco = `<span class="btn__ico">${arrow}${arrow}</span>`;
  $$('.btn__ico:empty').forEach(el => { el.innerHTML = arrow + arrow; });

  const dfDay = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' });
  const dfFull = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const dfTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
  const toDate = v => { const d = new Date(v); return isNaN(d) ? null : d; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const thisMonth = p => { const d = toDate(p.fecha), h = new Date(); return d && d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear(); };

  let clave = '', demo = false, filtro = 'Todos', q = '', abierto = null, timer = null, tab = 'pedidos', editando = null, pagando = null;
  let pedidos = [], vendedores = [], costos = {}, precios = {};
  let dirty = {}; // cambios sin guardar en la tabla de costos: { id: { costo, base } }

  /* ---------- utilidades de interfaz ---------- */
  let toastT;
  function toast(t) {
    const el = $('.toast'); $('span', el).textContent = t; el.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 2600);
  }
  function setStatus(s) {
    const el = $('#status');
    el.dataset.s = s;
    el.textContent = { on: 'Conectado a Google Sheets', demo: 'Demostración', off: 'Sin conexión', cargando: 'Cargando…' }[s] || s;
  }
  function view(v) { $('#login').hidden = v !== 'login'; $('#app').hidden = v !== 'app'; }
  function copyText(t, ok = 'Copiado') {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(ok); } catch (e) { toast('Selecciona el texto y cópialo'); } ta.remove(); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(() => toast(ok), fallback); else fallback();
  }
  const typingIn = sel => { const a = document.activeElement; return !!(a && a.closest && a.closest(sel) && /INPUT|TEXTAREA/.test(a.tagName)); };

  async function api(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(API, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  function take(j) {
    pedidos = j.pedidos || []; vendedores = j.vendedores || []; costos = j.costos || {}; precios = j.precios || {};
  }

  /* ---------- acceso ---------- */
  async function enter(key, remember) {
    const err = $('#loginErr'), btn = $('#loginBtn');
    err.textContent = '';
    if (!API) { err.textContent = 'Primero conecta tu hoja de pedidos (pasos abajo).'; return; }
    if (!key) { err.textContent = 'Escribe tu clave.'; $('#clave').focus(); return; }
    btn.disabled = true;
    try {
      const j = await api({ accion: 'listar', clave: key });
      if (!j.ok) {
        err.textContent = {
          clave: 'La clave no es correcta.',
          sin_clave: 'Aún no defines tu clave. Abre tu hoja "OBSIDIAN Pedidos" en Google Sheets → menú OBSIDIAN → Definir clave del panel.',
          bloqueado: 'Demasiados intentos fallidos. Espera 10 minutos y vuelve a intentar.',
        }[j.error] || 'La hoja respondió con un error. Revisa la instalación del script.';
        keep.clear(); return;
      }
      clave = key; demo = false; keep.set(key, remember);
      take(j);
      start();
    } catch (e) {
      err.textContent = 'No se pudo conectar con la hoja. Revisa tu internet y la URL en js/config.js.';
    } finally { btn.disabled = false; }
  }
  function start() {
    view('app');
    $('#demoBar').hidden = !demo;
    setStatus(demo ? 'demo' : 'on');
    stamp();
    render();
    clearInterval(timer);
    if (!demo) timer = setInterval(() => { if (!document.hidden) load(true); }, 60000);
  }
  function logout(msg) {
    clearInterval(timer); keep.clear(); clave = ''; demo = false; pedidos = []; vendedores = []; costos = {}; precios = {}; dirty = {}; closeDetail();
    view('login'); $('#clave').value = ''; $('#loginErr').textContent = msg || '';
    document.title = 'Panel OBSIDIAN';
  }
  const stamp = () => { $('#updated').textContent = demo ? '' : `Actualizado ${dfTime.format(new Date())}`; };

  async function load(silent) {
    if (demo) { render(); return; }
    setStatus('cargando');
    try {
      const j = await api({ accion: 'listar', clave });
      if (!j.ok) { if (j.error === 'clave') { logout('Tu clave cambió. Vuelve a entrar.'); return; } throw new Error(j.error); }
      const before = new Set(pedidos.map(p => String(p.numero)));
      take(j);
      const nuevos = pedidos.filter(p => !before.has(String(p.numero))).length;
      setStatus('on'); stamp(); render();
      if (abierto && !typingIn('#detBody')) openDetail(abierto, true);
      if (silent && nuevos && before.size) toast(`${nuevos} ${nuevos === 1 ? 'pedido nuevo' : 'pedidos nuevos'}`);
    } catch (e) {
      setStatus('off');
      if (!silent) toast('No se pudo actualizar. Revisa tu conexión.');
    }
  }

  /* ---------- datos de ejemplo ---------- */
  function demoData() {
    const nombres = ['Laura M.', 'Andrés P.', 'Camila R.', 'Juan D.', 'Valentina S.', 'Sebastián G.', 'Mariana T.', 'Felipe C.', 'Daniela V.', 'Tomás L.'];
    const ciudades = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Cartagena', 'Pereira', 'Manizales', 'Santa Marta', 'Cúcuta'];
    const estados = ['Nuevo', 'Nuevo', 'Confirmado', 'Nuevo', 'Enviado', 'Entregado', 'Confirmado', 'Entregado', 'Cancelado', 'Entregado'];
    const refs = ['', 'carlos', '', 'sofia', '', 'carlos', 'sofia', 'carlos', '', 'sofia'];
    const ahora = Date.now();
    const cs = {};
    PRODUCTS.forEach((p, i) => { if (i % 4 !== 3) cs[p.id] = { nombre: `${fullName(p)} ${p.color}`, costo: Math.round(p.precio * .62 / 1000) * 1000, base: Math.round(p.precio * .74 / 1000) * 1000 }; });
    if (cs['af1-white']) Object.assign(cs['af1-white'], { costo: 90000, base: 100000 });
    const pr = { carlos: {}, sofia: {} };
    Object.keys(cs).forEach((id, i) => { if (i % 2 === 0) pr.carlos[id] = cs[id].base + 30000; if (i % 3 === 0) pr.sofia[id] = cs[id].base + 25000; });
    const lista = nombres.map((n, i) => {
      const picks = [PRODUCTS[(i * 3) % PRODUCTS.length]];
      if (i % 3 === 0) picks.push(PRODUCTS[(i * 5 + 2) % PRODUCTS.length]);
      const ref = refs[i];
      const detalle = picks.filter(Boolean).map((p, k) => {
        const c = cs[p.id] || {};
        return { id: p.id, slug: p.slug, marca: p.marca, nombre: p.nombre, color: p.color, talla: p.tallas[(i + k) % p.tallas.length], cantidad: 1, precio: (ref && pr[ref][p.id]) || p.precio, base: c.base || 0, costo: c.costo || 0 };
      });
      return {
        numero: 'OB-' + (1010 - i), fecha: new Date(ahora - (i * 9 + 1) * 3600e3).toISOString(), estado: estados[i],
        nombre: `Ejemplo · ${n}`, celular: '300000' + String(1000 + i), ciudad: ciudades[i], direccion: `Calle 00 # 00-${10 + i}`, barrio: 'Barrio de ejemplo',
        notas: i % 4 === 0 ? 'Entregar en portería' : '', productos: detalle.map(d => `${d.cantidad} × ${d.marca} ${d.nombre} (T${d.talla})`).join(' | '),
        pares: detalle.length, subtotal: detalle.reduce((a, d) => a + d.precio * d.cantidad, 0), detalle, nota_interna: i === 2 ? 'Cliente pidió entrega en la tarde.' : '',
        origen: 'demostración', referido: ref, comision_pagada: i === 9 ? new Date(ahora - 86400e3).toISOString() : '',
      };
    });
    const vend = [
      { codigo: 'carlos', nombre: 'Ejemplo · Carlos R.', celular: '3000000101', pin: '481516', creado: new Date(ahora - 20 * 86400e3).toISOString(), activo: true },
      { codigo: 'sofia', nombre: 'Ejemplo · Sofía M.', celular: '3000000102', pin: '230842', creado: new Date(ahora - 12 * 86400e3).toISOString(), activo: true },
    ];
    return { pedidos: lista, vendedores: vend, costos: cs, precios: pr };
  }

  /* ---------- cálculos ---------- */
  const items = p => (Array.isArray(p.detalle) && p.detalle.length) ? p.detalle : [];
  const vendOf = code => vendedores.find(r => r.codigo === code);
  const linkOf = code => `${SITE}/?ref=${code}`;
  const isPaid = p => !!String(p.comision_pagada || '').trim();
  /* igual que en la hoja: costo y precio vendedor guardados en el pedido, o los de hoy si faltaban */
  function gan(p) {
    const ref = String(p.referido || '');
    let v = 0, mia = 0, completa = true;
    items(p).forEach(i => {
      const c = costos[i.id] || {};
      const base = Number(i.base) || c.base || 0, costo = Number(i.costo) || c.costo || 0;
      const cant = Number(i.cantidad) || 1, precio = Number(i.precio) || 0;
      if (ref && base) v += Math.max(0, precio - base) * cant;
      if (costo) mia += ((ref && base ? base : precio) - costo) * cant; else completa = false;
    });
    if (!items(p).length) completa = false;
    return { vendedor: v, mia: completa ? mia : null };
  }
  function vendStats(code) {
    const mine = pedidos.filter(p => p.referido === code);
    const vivos = mine.filter(p => p.estado !== 'Cancelado');
    const entregados = mine.filter(p => p.estado === 'Entregado');
    const curso = vivos.filter(p => p.estado !== 'Entregado');
    const sum = (list, f) => list.reduce((a, p) => a + f(p), 0);
    return {
      pedidos: vivos.length, entregados: entregados.length, enCurso: curso.length,
      ventas: sum(entregados, p => Number(p.subtotal || 0)),
      porPagar: sum(entregados.filter(p => !isPaid(p)), p => gan(p).vendedor),
      pagado: sum(entregados.filter(isPaid), p => gan(p).vendedor),
      estimado: sum(curso, p => gan(p).vendedor),
      precios: Object.values(precios[code] || {}).filter(Boolean).length,
    };
  }
  /* precio que debió tener un artículo: el del vendedor si puso uno, si no el del catálogo */
  const expected = (p, id) => { const v = p.referido && precios[p.referido] ? Number(precios[p.referido][id]) : 0; return v || (byId[id] ? byId[id].precio : 0); };

  /* ---------- render general ---------- */
  function render() {
    renderOrders();
    renderVendors();
    if (!typingIn('#costList')) renderCosts();
  }

  /* ---------- pedidos ---------- */
  const resumen = p => {
    const it = items(p);
    if (!it.length) return esc(p.productos || '');
    const first = it.slice(0, 2).map(i => `${i.cantidad > 1 ? i.cantidad + ' × ' : ''}${esc(i.marca)} ${esc(i.nombre)} · T${esc(i.talla)}`).join(', ');
    return first + (it.length > 2 ? ` y ${it.length - 2} más` : '');
  };
  function visible() {
    const nq = norm(q).trim();
    return pedidos.filter(p => (filtro === 'Todos' || p.estado === filtro) &&
      (!nq || norm(`${p.numero} ${p.nombre} ${p.celular} ${p.ciudad} ${p.productos} ${p.referido}`).includes(nq)));
  }
  function monthGain() {
    const mes = pedidos.filter(p => p.estado !== 'Cancelado' && thisMonth(p));
    let total = 0, faltan = 0;
    mes.forEach(p => { const g = gan(p).mia; if (g === null) faltan++; else total += g; });
    return { total, faltan, n: mes.length };
  }
  function renderOrders() {
    const hoy = new Date();
    const vivos = pedidos.filter(p => p.estado !== 'Cancelado');
    const mes = vivos.filter(thisMonth);
    const nNew = pedidos.filter(p => p.estado === 'Nuevo').length;
    $('#kNew b').textContent = nNew; $('#kNew').classList.toggle('is-alert', nNew > 0);
    $('#kToday b').textContent = pedidos.filter(p => { const d = toDate(p.fecha); return d && sameDay(d, hoy); }).length;
    $('#kMonth b').textContent = fmt(mes.reduce((a, p) => a + Number(p.subtotal || 0), 0));
    $('#kMonth p:last-child').textContent = `${mes.length} ${mes.length === 1 ? 'pedido' : 'pedidos'} sin cancelados`;
    const mg = monthGain();
    $('#kGain b').textContent = fmt(mg.total);
    $('#kGain p:last-child').textContent = mg.faltan ? `${mg.faltan} ${mg.faltan === 1 ? 'pedido' : 'pedidos'} sin costo: llénalo en Costos` : 'sin cancelados';
    $('#totalTxt').textContent = `${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} en total`;
    $('#tabPedN').textContent = nNew ? `(${nNew})` : '';
    document.title = nNew ? `(${nNew}) Panel OBSIDIAN` : 'Panel OBSIDIAN';

    const count = e => e === 'Todos' ? pedidos.length : pedidos.filter(p => p.estado === e).length;
    $('#chips').innerHTML = ['Todos', ...ESTADOS].map(e => `<button type="button" class="chip mono${filtro === e ? ' is-on' : ''}"${e !== 'Todos' ? ` data-e="${e}"` : ''} data-f="${e}">${e} <small>${count(e)}</small></button>`).join('');

    const list = visible();
    $('#list').innerHTML = list.map(p => {
      const d = toDate(p.fecha);
      const v = p.referido ? vendOf(p.referido) : null;
      return `<button type="button" class="pn-row${p.estado === 'Nuevo' ? ' is-new' : ''}" data-n="${esc(p.numero)}">
        <span class="c-num"><span class="mono num">${esc(p.numero)}</span><br><span class="mono muted">${d ? dfDay.format(d) + ' · ' + dfTime.format(d) : ''}</span></span>
        <span class="c-cli"><span class="serif">${esc(p.nombre)}</span><br><span class="mono muted">${esc(p.ciudad)}</span>${p.referido ? `<span class="pn-refchip">${esc(v ? firstName(v.nombre) : p.referido)}</span>` : ''}</span>
        <span class="c-prod pn-prod">${resumen(p)}</span>
        <span class="c-tot mono num">${fmt(p.subtotal)}</span>
        <span class="c-st"><span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span></span>
        <span class="c-go" aria-hidden="true">›</span>
      </button>`;
    }).join('');
    $('#empty').hidden = list.length > 0;
    $('#emptyTxt').textContent = pedidos.length ? 'Ningún pedido coincide con el filtro o la búsqueda.' : 'Cuando alguien haga un pedido en la tienda, aparecerá aquí.';

    const tally = new Map();
    vivos.forEach(p => items(p).forEach(i => tally.set(i.id, (tally.get(i.id) || 0) + Number(i.cantidad || 1))));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('#top5').innerHTML = top.length ? top.map(([id, n]) => {
      const p = byId[id];
      return `<li>${p ? `<img src="${esc(p.imagenes[0])}" alt="">` : '<span></span>'}<span><span class="mono muted">${esc(p ? p.marca : '')}</span><br><span class="serif">${esc(p ? p.nombre : id)}</span></span><span class="mono">${n} ${n === 1 ? 'par' : 'pares'}</span></li>`;
    }).join('') : '<li><span></span><span class="muted">Aún no hay datos suficientes.</span><span></span></li>';
  }

  /* ---------- vendedores ---------- */
  const waNumber = cel => { const d = String(cel || '').replace(/\D/g, ''); return d.length === 10 && d[0] === '3' ? '57' + d : d; };
  const accessMsg = r => `¡Hola ${firstName(r.nombre)}! 👋 Ya eres vendedor de OBSIDIAN.\n\n` +
    `Tu enlace para compartir:\n${linkOf(r.codigo)}\nQuien compre con ese enlace ve tus precios y la venta queda a tu nombre.\n\n` +
    `Pon tus precios y mira tus ventas y ganancias aquí:\n${SITE}/vendedores.html?codigo=${r.codigo}\nCódigo: ${r.codigo}\nPIN: ${r.pin}`;
  function renderVendors() {
    const activos = vendedores.filter(r => r.activo !== false);
    let ventas = 0, due = 0, paid = 0;
    vendedores.forEach(r => { const s = vendStats(r.codigo); ventas += s.ventas; due += s.porPagar; paid += s.pagado; });
    $('#vkActive b').textContent = activos.length;
    $('#vkSales b').textContent = fmt(ventas);
    $('#vkDue b').textContent = fmt(due); $('#vkDue').classList.toggle('is-alert', due > 0);
    $('#vkPaid b').textContent = fmt(paid);
    const conRef = pedidos.filter(p => p.referido && p.estado !== 'Cancelado').length;
    $('#venTotalTxt').textContent = `${conRef} ${conRef === 1 ? 'pedido de vendedores' : 'pedidos de vendedores'}`;
    $('#tabVenN').textContent = due > 0 ? `(${fmt(due)})` : '';

    const known = new Set(vendedores.map(r => r.codigo));
    const unknown = [...new Set(pedidos.map(p => p.referido).filter(c => c && !known.has(c)))];
    const cards = vendedores.slice().sort((a, b) => vendStats(b.codigo).porPagar - vendStats(a.codigo).porPagar || String(a.nombre).localeCompare(String(b.nombre), 'es')).map(r => {
      const s = vendStats(r.codigo), link = linkOf(r.codigo), wa = waNumber(r.celular), msg = accessMsg(r);
      const confirmPay = pagando === r.codigo;
      const own = Object.entries(precios[r.codigo] || {}).filter(([, v]) => v).map(([id, v]) => {
        const p = byId[id], c = costos[id] || {};
        return `<li><span>${esc(p ? fullName(p) + ' · ' + p.color : id)}</span><span class="mono">${fmt(v)}${c.base ? ` <small class="muted">gana ${fmt(v - c.base)}</small>` : ''}</span></li>`;
      });
      return `<article class="pn-ref${r.activo === false ? ' is-off' : ''}">
        <div class="pn-ref__top"><div><p class="serif">${esc(r.nombre || r.codigo)}</p><p class="mono muted">Código ${esc(r.codigo)} · PIN ${esc(r.pin || '—')}${r.celular ? ' · ' + esc(r.celular) : ''}</p></div><span class="pill" data-e="${r.activo === false ? 'Cancelado' : 'Entregado'}">${r.activo === false ? 'Inactivo' : 'Activo'}</span></div>
        <div class="pn-ref__link"><label class="sr-only" for="lk-${esc(r.codigo)}">Enlace de ${esc(r.nombre)}</label><input id="lk-${esc(r.codigo)}" readonly value="${esc(link)}"><button class="chip mono" type="button" data-copy-link="${esc(link)}">Copiar</button></div>
        <dl class="pn-ref__stats mono">
          <div><dt>Pedidos</dt><dd>${s.pedidos}</dd></div>
          <div><dt>Entregados</dt><dd>${s.entregados}</dd></div>
          <div><dt>Ventas</dt><dd>${fmt(s.ventas)}</dd></div>
          <div><dt>Por pagarle</dt><dd class="${s.porPagar > 0 ? 'due' : ''}">${fmt(s.porPagar)}</dd></div>
          <div><dt>Pagado</dt><dd>${fmt(s.pagado)}</dd></div>
        </dl>
        <details class="pn-own"><summary class="mono">${s.precios ? `Sus precios · ${s.precios} ${s.precios === 1 ? 'modelo' : 'modelos'}` : 'Aún no pone precios propios (vende al precio de la tienda)'}</summary>${own.length ? `<ul>${own.join('')}</ul>` : ''}</details>
        <div class="pn-ref__btns">
          ${wa ? `<a class="btn btn--sm" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar acceso por WhatsApp ${btnIco}</a>` : `<button class="btn btn--sm" type="button" data-copy-msg="${esc(msg)}">Copiar mensaje de acceso ${btnIco}</button>`}
          ${s.porPagar > 0 ? `<button class="btn btn--line btn--sm" type="button" data-pay="${esc(r.codigo)}">${confirmPay ? `Confirmar: le pagué ${fmt(s.porPagar)}` : `Marcar ${fmt(s.porPagar)} como pagado`}</button>` : ''}
          <button class="link" type="button" data-edit-ven="${esc(r.codigo)}">Editar</button>
        </div>
        ${s.enCurso ? `<p class="mono muted">${s.enCurso} ${s.enCurso === 1 ? 'pedido en curso' : 'pedidos en curso'}: ${fmt(s.estimado)} más cuando se entreguen.</p>` : ''}
      </article>`;
    });
    const unk = unknown.map(c => `<article class="pn-ref is-unknown"><div class="pn-ref__top"><div><p class="serif">Código sin registrar: ${esc(c)}</p><p class="mono muted">${pedidos.filter(p => p.referido === c).length} pedidos llegaron con este código.</p></div></div><div class="pn-ref__btns"><button class="btn btn--line btn--sm" type="button" data-register="${esc(c)}">Registrar este vendedor</button></div></article>`);
    $('#venList').innerHTML = cards.concat(unk).join('') || `<div class="empty"><p class="s-md">Sin <em>vendedores</em></p><p>Crea el primero con el formulario: escribe su nombre y celular y te damos su enlace y su PIN.</p></div>`;
    updatePreview();
  }

  /* formulario de vendedores */
  const newPin = () => { const a = new Uint32Array(1); (crypto.getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.random() * 1e9)); return String(100000 + (a[0] % 900000)); };
  function updatePreview() { $('#vPrev').textContent = linkOf(cleanCode($('#vCod').value) || 'codigo'); }
  function resetForm() {
    editando = null; $('#venForm').reset(); $('#vAct').checked = true; $('#vPin').value = newPin();
    $('#vCod').readOnly = false; delete $('#vCod').dataset.touched; $('#vErr').textContent = '';
    $('#venFormTitle').innerHTML = 'Nuevo <em>vendedor</em>'; $('#vSave').firstChild.textContent = 'Crear vendedor '; $('#vCancel').hidden = true;
    updatePreview();
  }
  function editVendor(code) {
    const r = vendOf(code); if (!r) return;
    editando = code;
    $('#vNombre').value = r.nombre || ''; $('#vCel').value = r.celular || ''; $('#vCod').value = r.codigo; $('#vPin').value = r.pin || newPin(); $('#vAct').checked = r.activo !== false;
    $('#vCod').readOnly = true; $('#vErr').textContent = '';
    $('#venFormTitle').innerHTML = 'Editar <em>vendedor</em>'; $('#vSave').firstChild.textContent = 'Guardar cambios '; $('#vCancel').hidden = false;
    updatePreview();
    $('#tabVendedores .pn-refform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveVendor(e) {
    e.preventDefault();
    const nombre = $('#vNombre').value.trim(), codigo = cleanCode($('#vCod').value), pin = $('#vPin').value.replace(/\D/g, '');
    const err = $('#vErr'); err.textContent = '';
    if (nombre.length < 2) { $('#vNombre').focus(); err.textContent = 'Escribe el nombre del vendedor.'; return; }
    if (codigo.length < 2) { err.textContent = 'El código necesita al menos 2 letras o números.'; return; }
    if (pin.length < 4) { $('#vPin').focus(); err.textContent = 'El PIN debe tener de 4 a 8 números.'; return; }
    if (!editando && vendOf(codigo)) { err.textContent = 'Ese código ya existe. Usa otro, por ejemplo agregando un número.'; return; }
    const datos = { codigo, nombre, celular: $('#vCel').value.trim(), pin, activo: $('#vAct').checked, nuevo: !editando };
    const btn = $('#vSave'); btn.disabled = true;
    try {
      if (!demo) {
        const j = await api({ accion: 'guardarVendedor', clave, vendedor: datos });
        if (!j.ok) { err.textContent = { codigo_existe: 'Ese código ya existe.', pin: 'El PIN debe tener de 4 a 8 números.' }[j.error] || 'No se pudo guardar. Intenta de nuevo.'; return; }
      }
      const prev = vendOf(codigo);
      if (prev) Object.assign(prev, datos); else vendedores.push({ ...datos, creado: new Date().toISOString() });
      delete (vendOf(codigo) || {}).nuevo;
      toast(editando ? 'Vendedor actualizado' : 'Vendedor creado: envíale su acceso por WhatsApp');
      resetForm(); renderVendors();
    } catch (ex) {
      err.textContent = 'No se pudo conectar con la hoja. Intenta de nuevo.';
    } finally { btn.disabled = false; }
  }
  async function payVendor(code) {
    if (pagando !== code) { pagando = code; renderVendors(); return; }
    pagando = null;
    const ahora = new Date().toISOString();
    const afectados = pedidos.filter(p => p.referido === code && p.estado === 'Entregado' && !isPaid(p));
    afectados.forEach(p => { p.comision_pagada = ahora; });
    renderVendors();
    if (demo) { toast('Marcado como pagado (demostración)'); return; }
    try {
      const j = await api({ accion: 'pagarVendedor', clave, codigo: code });
      if (!j.ok) throw new Error(j.error);
      toast(`Listo: ${j.pagados} ${j.pagados === 1 ? 'pedido marcado como pagado' : 'pedidos marcados como pagados'}`);
    } catch (e) {
      afectados.forEach(p => { p.comision_pagada = ''; }); renderVendors();
      toast('No se pudo guardar el pago. Intenta de nuevo.');
    }
  }

  /* ---------- costos ---------- */
  const costOf = id => ({ ...(costos[id] || { costo: 0, base: 0 }), ...(dirty[id] || {}) });
  function costRow(p) {
    const c = costOf(p.id), d = dirty[p.id];
    const direct = c.costo ? p.precio - c.costo : null, viaV = c.costo && c.base ? c.base - c.costo : null;
    const warn = c.base && c.costo && c.base < c.costo ? 'El precio vendedor es menor que tu costo.' : c.base && c.base > p.precio ? 'Mayor que el precio de la tienda: sus clientes pagarían más.' : '';
    return `<div class="pn-cost${d ? ' is-dirty' : ''}${c.costo && c.base ? ' is-ready' : ''}" role="row" data-id="${esc(p.id)}">
      <div class="pn-cost__name" role="cell"><img src="${esc(p.imagenes[0])}" alt=""><span><span class="mono muted">${esc(p.marca)}</span><br><span class="serif">${esc(p.nombre)}</span><br><span class="mono muted">${esc(p.color)}</span></span></div>
      <div role="cell"><span class="pn-cost__lbl mono">Tienda</span><span class="mono">${fmt(p.precio)}</span></div>
      <label role="cell"><span class="pn-cost__lbl mono">Te cuesta</span><input type="number" inputmode="numeric" min="0" step="1000" data-k="costo" value="${c.costo || ''}" placeholder="—"></label>
      <label role="cell"><span class="pn-cost__lbl mono">Precio vendedor</span><input type="number" inputmode="numeric" min="0" step="1000" data-k="base" value="${c.base || ''}" placeholder="—"></label>
      <div role="cell"><span class="pn-cost__lbl mono">Ganas directo</span><span class="mono${direct !== null && direct < 0 ? ' pn-warn' : ''}">${direct === null ? '—' : fmt(direct)}</span></div>
      <div role="cell"><span class="pn-cost__lbl mono">Ganas con vendedor</span><span class="mono${viaV !== null && viaV < 0 ? ' pn-warn' : ''}">${viaV === null ? '—' : fmt(viaV)}</span></div>
      ${warn ? `<p class="pn-cost__warn mono pn-warn" role="cell">${warn}</p>` : ''}
    </div>`;
  }
  function costKpis() {
    const ready = PRODUCTS.filter(p => { const c = costOf(p.id); return c.costo && c.base; });
    const withCost = PRODUCTS.filter(p => costOf(p.id).costo);
    const avg = (list, f) => list.length ? list.reduce((a, p) => a + f(p), 0) / list.length : 0;
    $('#ckReady b').textContent = `${ready.length}/${PRODUCTS.length}`;
    $('#ckReady').classList.toggle('is-alert', ready.length < PRODUCTS.length);
    const mg = monthGain();
    $('#ckMonth b').textContent = fmt(mg.total);
    $('#ckDirect b').textContent = fmt(avg(withCost, p => p.precio - costOf(p.id).costo));
    $('#ckVend b').textContent = fmt(avg(ready, p => costOf(p.id).base - costOf(p.id).costo));
    const faltan = PRODUCTS.length - ready.length;
    $('#cosTotalTxt').textContent = faltan ? `${faltan} ${faltan === 1 ? 'modelo' : 'modelos'} sin completar` : 'Todos los modelos completos';
    $('#tabCosN').textContent = faltan ? `(${faltan})` : '';
    const n = Object.keys(dirty).length;
    $('#costBar').hidden = !n;
    $('#costDirty').textContent = `${n} ${n === 1 ? 'modelo con cambios' : 'modelos con cambios'} sin guardar`;
  }
  function renderCosts() {
    $('#costList').innerHTML = `<div class="pn-cost pn-cost--head mono" role="row"><span role="columnheader">Modelo</span><span role="columnheader">Tienda</span><span role="columnheader">Te cuesta</span><span role="columnheader">Precio vendedor</span><span role="columnheader">Ganas directo</span><span role="columnheader">Ganas con vendedor</span></div>` +
      PRODUCTS.map(costRow).join('');
    costKpis();
  }
  function onCostInput(e) {
    const inp = e.target.closest('input[data-k]'); if (!inp) return;
    const row = inp.closest('[data-id]'), id = row.dataset.id;
    const vals = { costo: Number($('[data-k="costo"]', row).value) || 0, base: Number($('[data-k="base"]', row).value) || 0 };
    const orig = costos[id] || { costo: 0, base: 0 };
    if (vals.costo === (orig.costo || 0) && vals.base === (orig.base || 0)) delete dirty[id]; else dirty[id] = vals;
    // refresca solo las cifras de la fila, sin perder el foco
    const tmp = document.createElement('div'); tmp.innerHTML = costRow(byId[id]);
    const fresh = tmp.firstElementChild;
    row.className = fresh.className;
    [...row.children].forEach((cell, i) => { if (!cell.matches('label') && fresh.children[i] && !cell.classList.contains('pn-cost__warn')) cell.innerHTML = fresh.children[i].innerHTML; });
    $('.pn-cost__warn', row)?.remove();
    const w = $('.pn-cost__warn', fresh); if (w) row.appendChild(w);
    costKpis();
  }
  async function saveCosts() {
    const ids = Object.keys(dirty); if (!ids.length) return;
    const payload = {};
    ids.forEach(id => { const p = byId[id]; payload[id] = { nombre: p ? `${fullName(p)} · ${p.color}` : id, costo: dirty[id].costo, precio_vendedor: dirty[id].base }; });
    const btn = $('#costSave'); btn.disabled = true;
    try {
      if (!demo) {
        const j = await api({ accion: 'guardarCostos', clave, costos: payload });
        if (!j.ok) throw new Error(j.error);
      }
      ids.forEach(id => { costos[id] = { ...(costos[id] || {}), nombre: payload[id].nombre, costo: dirty[id].costo, base: dirty[id].base }; });
      dirty = {};
      render(); renderCosts();
      toast(demo ? 'Costos guardados (demostración)' : 'Costos guardados en tu hoja');
    } catch (e) {
      toast('No se pudieron guardar los costos. Intenta de nuevo.');
    } finally { btn.disabled = false; }
  }

  /* ---------- detalle de pedido ---------- */
  function waText(p) {
    const nombre = firstName(p.nombre);
    const lista = items(p).map(i => `• ${i.cantidad} × ${i.marca} ${i.nombre} — Talla ${i.talla}`).join('\n') || p.productos;
    if (p.estado === 'Enviado') return `Hola ${nombre} 👋 Te escribimos de OBSIDIAN: tu pedido ${p.numero} ya va en camino.`;
    if (p.estado === 'Entregado') return `Hola ${nombre} 👋 Gracias por comprar en OBSIDIAN. ¿Cómo te quedaron tus tenis? (pedido ${p.numero})`;
    return `Hola ${nombre} 👋 Te escribimos de OBSIDIAN sobre tu pedido ${p.numero}:\n\n${lista}\n\nSubtotal: ${fmt(p.subtotal)}\n¿Confirmamos los datos de envío a ${p.ciudad}?`;
  }
  function moneyBlock(p) {
    const r = p.referido ? vendOf(p.referido) : null, g = gan(p);
    const vEstado = !p.referido ? 'Venta directa: no lleva vendedor.'
      : !r ? 'Este código no está registrado. Regístralo en Vendedores.'
      : p.estado === 'Cancelado' ? 'Pedido cancelado: no genera ganancia.'
      : p.estado !== 'Entregado' ? `Gana ${fmt(g.vendedor)} cuando se entregue.`
      : isPaid(p) ? `Sus ${fmt(g.vendedor)} ya están pagados.` : `Le debes ${fmt(g.vendedor)}.`;
    return `<section class="pn-sec"><h3 class="mono muted">Ganancias</h3>
      <dl class="pn-dl mono">
        <div><dt>Tú ganas</dt><dd>${g.mia === null ? 'Falta el costo de algún modelo (pestaña Costos)' : `<b>${fmt(g.mia)}</b>`}</dd></div>
        <div><dt>Vendedor</dt><dd>${p.referido ? `${esc(r ? r.nombre : p.referido)} <span class="muted">(${esc(p.referido)})</span>` : '—'}</dd></div>
        ${p.referido ? `<div><dt>Él gana</dt><dd>${fmt(g.vendedor)}</dd></div>` : ''}
      </dl>
      <p class="mono muted" style="margin-top:.3rem">${vEstado}</p>
      <div class="pn-refedit"><label class="sr-only" for="refEdit">Vendedor del pedido</label><input id="refEdit" list="refCodes" placeholder="Asignar vendedor (ej. juan)" value="${esc(p.referido || '')}"><button class="chip mono" type="button" data-save-ref>Guardar</button></div>
      <datalist id="refCodes">${vendedores.map(x => `<option value="${esc(x.codigo)}">${esc(x.nombre)}</option>`).join('')}</datalist>
    </section>`;
  }
  function openDetail(num, keepOpen) {
    const p = pedidos.find(x => String(x.numero) === String(num)); if (!p) return;
    abierto = String(p.numero);
    const d = toDate(p.fecha);
    $('#detTitle').innerHTML = `Pedido <em>${esc(p.numero)}</em>`;
    $('#detDate').textContent = d ? dfFull.format(d) : '';
    const its = items(p);
    $('#detBody').innerHTML = `
      <section class="pn-sec"><h3 class="mono muted">Estado</h3><div class="pn-states">${ESTADOS.map(e => `<button type="button" class="chip mono${p.estado === e ? ' is-on' : ''}" data-e="${e}" data-set="${e}">${e}</button>`).join('')}</div></section>
      <section class="pn-sec"><h3 class="mono muted">Cliente</h3>
        <dl class="pn-dl mono">
          <div><dt>Nombre</dt><dd>${esc(p.nombre)}</dd></div>
          <div><dt>Celular</dt><dd>${esc(p.celular)}</dd></div>
          <div><dt>Ciudad</dt><dd>${esc(p.ciudad)}</dd></div>
          <div><dt>Dirección</dt><dd>${esc(p.direccion)}</dd></div>
          ${p.barrio ? `<div><dt>Barrio</dt><dd>${esc(p.barrio)}</dd></div>` : ''}
          ${p.notas ? `<div><dt>Notas</dt><dd>${esc(p.notas)}</dd></div>` : ''}
        </dl>
        <div class="pn-btns">
          <a class="btn btn--block" href="https://wa.me/${waNumber(p.celular)}?text=${encodeURIComponent(waText(p))}" target="_blank" rel="noopener">Escribir por WhatsApp ${btnIco}</a>
          <button class="btn btn--line btn--block btn--sm" type="button" data-copy>Copiar datos de envío</button>
        </div>
      </section>
      <section class="pn-sec"><h3 class="mono muted">Productos · ${its.reduce((a, i) => a + Number(i.cantidad || 1), 0) || p.pares || 0} ${Number(p.pares) === 1 ? 'par' : 'pares'}</h3>
        ${its.length ? its.map(i => {
          const cat = byId[i.id], exp = expected(p, i.id);
          const diff = cat && exp && Number(exp) !== Number(i.precio);
          return `<div class="pn-item">${cat ? `<img src="${esc(cat.imagenes[0])}" alt="">` : '<span></span>'}<div><p class="mono muted">${esc(i.marca)}</p><p class="serif">${esc(i.nombre)}</p><p class="mono">${esc(i.color)} · Talla ${esc(i.talla)} · ${i.cantidad} ${Number(i.cantidad) === 1 ? 'par' : 'pares'}</p>${diff ? `<p class="mono pn-warn">Hoy el precio es ${fmt(exp)}</p>` : ''}</div><span class="mono">${fmt(i.precio * i.cantidad)}</span></div>`;
        }).join('') : `<p>${esc(p.productos)}</p>`}
        <div class="tot" style="margin-top:.8rem"><span class="mono">Subtotal</span><b>${fmt(p.subtotal)}</b></div>
        <p class="mono muted">El envío se acuerda con el cliente por WhatsApp.</p>
      </section>
      ${moneyBlock(p)}
      <section class="pn-sec pn-note"><h3 class="mono muted">Nota interna</h3><label class="sr-only" for="nota">Nota interna</label><textarea id="nota" placeholder="Solo la ves tú. Ej: pagó envío, cambiar a talla 42…">${esc(p.nota_interna || '')}</textarea><p style="margin-top:.6rem"><button class="btn btn--sm" type="button" data-save-note>Guardar nota</button></p></section>
      <p class="mono muted" style="padding:1rem 0">Origen: ${esc(p.origen || '—')}</p>`;
    if (!keepOpen) {
      const dw = $('#det'); dw.classList.add('is-open'); dw.setAttribute('aria-hidden', 'false');
      setTimeout(() => $('#det .dw__close')?.focus(), 60);
    }
  }
  function closeDetail() { abierto = null; const dw = $('#det'); dw.classList.remove('is-open'); dw.setAttribute('aria-hidden', 'true'); }

  async function update(num, patch) {
    const p = pedidos.find(x => String(x.numero) === String(num)); if (!p) return;
    const prev = { estado: p.estado, nota_interna: p.nota_interna, referido: p.referido };
    if (patch.estado) p.estado = patch.estado;
    if (typeof patch.nota === 'string') p.nota_interna = patch.nota;
    if (typeof patch.referido === 'string') p.referido = patch.referido;
    render(); openDetail(num, true);
    if (demo) { toast('Guardado (demostración)'); return; }
    try {
      const j = await api({ accion: 'actualizar', clave, numero: p.numero, ...patch });
      if (!j.ok) throw new Error(j.error);
      toast('Guardado en tu hoja');
    } catch (e) {
      Object.assign(p, prev); render(); openDetail(num, true);
      toast('No se pudo guardar. Intenta de nuevo.');
    }
  }

  function copyShipping() {
    const p = pedidos.find(x => String(x.numero) === abierto); if (!p) return;
    copyText([p.nombre, p.celular, p.direccion, p.barrio, p.ciudad, p.notas].filter(Boolean).join('\n'), 'Datos copiados');
  }

  function exportCSV() {
    const cols = ['numero', 'fecha', 'estado', 'nombre', 'celular', 'ciudad', 'direccion', 'barrio', 'notas', 'productos', 'pares', 'subtotal', 'referido', 'ganancia_vendedor', 'mi_ganancia', 'comision_pagada', 'nota_interna'];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = visible().map(p => { const g = gan(p); return { ...p, ganancia_vendedor: g.vendedor, mi_ganancia: g.mia === null ? '' : g.mia }; });
    const csv = '﻿' + [cols.join(';'), ...rows.map(p => cols.map(c => cell(p[c])).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `pedidos-obsidian-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function setTab(t) {
    tab = t;
    $$('.pn-tabs [data-tab]').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    $('#tabPedidos').hidden = t !== 'pedidos'; $('#tabVendedores').hidden = t !== 'vendedores'; $('#tabCostos').hidden = t !== 'costos';
    $('#csvBtn').hidden = t !== 'pedidos';
  }

  /* ---------- eventos ---------- */
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); enter($('#clave').value.trim(), $('#recordar').checked); });
  $('#demoBtn').addEventListener('click', () => { demo = true; take(demoData()); start(); });
  $('#refreshBtn').addEventListener('click', () => { if (demo) { toast('En la demostración no hay datos nuevos'); return; } load(false); });
  $('#logoutBtn').addEventListener('click', () => logout(''));
  $('#csvBtn').addEventListener('click', exportCSV);
  $('#q').addEventListener('input', e => { q = e.target.value; renderOrders(); });
  $('#venForm').addEventListener('submit', saveVendor);
  $('#vNombre').addEventListener('input', () => { if (!editando && !$('#vCod').dataset.touched) $('#vCod').value = cleanCode($('#vNombre').value.split(/\s+/).slice(0, 2).join('')); updatePreview(); });
  $('#vCod').addEventListener('input', () => { $('#vCod').dataset.touched = $('#vCod').value ? '1' : ''; $('#vCod').value = cleanCode($('#vCod').value); updatePreview(); });
  $('#vPin').addEventListener('input', () => { $('#vPin').value = $('#vPin').value.replace(/\D/g, '').slice(0, 8); });
  $('#vPinNew').addEventListener('click', () => { $('#vPin').value = newPin(); });
  $('#vCancel').addEventListener('click', resetForm);
  $('#costList').addEventListener('input', onCostInput);
  $('#costSave').addEventListener('click', saveCosts);
  document.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { setTab(tb.dataset.tab); return; }
    const f = e.target.closest('[data-f]'); if (f) { filtro = f.dataset.f; renderOrders(); return; }
    const row = e.target.closest('.pn-row'); if (row) { openDetail(row.dataset.n); return; }
    if (e.target.closest('[data-close]')) { closeDetail(); return; }
    const s = e.target.closest('[data-set]'); if (s && abierto) { update(abierto, { estado: s.dataset.set }); return; }
    if (e.target.closest('[data-copy]')) { copyShipping(); return; }
    if (e.target.closest('[data-save-note]') && abierto) { update(abierto, { nota: $('#nota').value.trim() }); return; }
    if (e.target.closest('[data-save-ref]') && abierto) { update(abierto, { referido: cleanCode($('#refEdit').value) }); return; }
    const cl = e.target.closest('[data-copy-link]'); if (cl) { copyText(cl.dataset.copyLink, 'Enlace copiado'); return; }
    const cm = e.target.closest('[data-copy-msg]'); if (cm) { copyText(cm.dataset.copyMsg, 'Mensaje copiado'); return; }
    const pay = e.target.closest('[data-pay]'); if (pay) { payVendor(pay.dataset.pay); return; }
    const ed = e.target.closest('[data-edit-ven]'); if (ed) { editVendor(ed.dataset.editVen); return; }
    const rg = e.target.closest('[data-register]'); if (rg) { resetForm(); $('#vCod').value = rg.dataset.register; $('#vCod').dataset.touched = '1'; updatePreview(); $('#vNombre').focus(); return; }
    if (pagando && !e.target.closest('[data-pay]')) { pagando = null; renderVendors(); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
  addEventListener('beforeunload', e => { if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && clave && !demo) load(true); });

  /* ---------- arranque ---------- */
  $('#setup').hidden = !!API;
  resetForm();
  const saved = keep.get();
  if (API && saved) { $('#clave').value = saved; enter(saved, true); }
  else view('login');
})();
