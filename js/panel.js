/* =====================================================================
   OBSIDIAN — panel de pedidos
   Lee y actualiza los pedidos guardados en Google Sheets (pedidosApi).
   Sin conexión configurada ofrece un modo de demostración.
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.OBSIDIAN_CONFIG || {};
  const API = String(CFG.pedidosApi || '').trim();
  const EXTRA = Number(CFG.aumentoPrecio) || 0;
  const PRODUCTS = (window.OBSIDIAN_PRODUCTS || []).map(p => ({ ...p, precio: p.precio + EXTRA }));
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const ESTADOS = ['Nuevo', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
  const KEY = 'obs-panel-clave';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const keep = {
    get() { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
    set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY, v); } catch (e) { /* bloqueado */ } },
    clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { /* bloqueado */ } },
  };
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
  $$('.btn__ico:empty').forEach(el => { el.innerHTML = arrow + arrow; });

  const dfDay = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' });
  const dfFull = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const dfTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
  const toDate = v => { const d = new Date(v); return isNaN(d) ? null : d; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  let clave = '', demo = false, pedidos = [], filtro = 'Todos', q = '', abierto = null, timer = null;

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

  async function api(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(API, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
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
      pedidos = j.pedidos || [];
      start();
    } catch (e) {
      err.textContent = 'No se pudo conectar con la hoja. Revisa tu internet y la URL en js/config.js.';
    } finally { btn.disabled = false; }
  }
  function start() {
    view('app');
    $('#demoBar').hidden = !demo;
    $('#csvBtn').hidden = false;
    setStatus(demo ? 'demo' : 'on');
    stamp();
    render();
    clearInterval(timer);
    if (!demo) timer = setInterval(() => { if (!document.hidden) load(true); }, 60000);
  }
  function logout(msg) {
    clearInterval(timer); keep.clear(); clave = ''; demo = false; pedidos = []; closeDetail();
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
      pedidos = j.pedidos || [];
      const nuevos = pedidos.filter(p => !before.has(String(p.numero))).length;
      setStatus('on'); stamp(); render();
      if (abierto) openDetail(abierto, true);
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
    const ahora = Date.now();
    return nombres.map((n, i) => {
      const picks = [PRODUCTS[(i * 3) % PRODUCTS.length]];
      if (i % 3 === 0) picks.push(PRODUCTS[(i * 5 + 2) % PRODUCTS.length]);
      const detalle = picks.filter(Boolean).map((p, k) => ({ id: p.id, slug: p.slug, marca: p.marca, nombre: p.nombre, color: p.color, talla: p.tallas[(i + k) % p.tallas.length], cantidad: 1, precio: p.precio }));
      return {
        numero: 'OB-' + (1010 - i), fecha: new Date(ahora - (i * 9 + 1) * 3600e3).toISOString(), estado: estados[i],
        nombre: `Ejemplo · ${n}`, celular: '300000' + String(1000 + i), ciudad: ciudades[i], direccion: `Calle 00 # 00-${10 + i}`, barrio: 'Barrio de ejemplo',
        notas: i % 4 === 0 ? 'Entregar en portería' : '', productos: detalle.map(d => `${d.cantidad} × ${d.marca} ${d.nombre} (T${d.talla})`).join(' | '),
        pares: detalle.length, subtotal: detalle.reduce((a, d) => a + d.precio * d.cantidad, 0), detalle, nota_interna: i === 2 ? 'Cliente pidió entrega en la tarde.' : '', origen: 'demostración',
      };
    });
  }

  /* ---------- render ---------- */
  const items = p => (Array.isArray(p.detalle) && p.detalle.length) ? p.detalle : [];
  const resumen = p => {
    const it = items(p);
    if (!it.length) return esc(p.productos || '');
    const first = it.slice(0, 2).map(i => `${i.cantidad > 1 ? i.cantidad + ' × ' : ''}${esc(i.marca)} ${esc(i.nombre)} · T${esc(i.talla)}`).join(', ');
    return first + (it.length > 2 ? ` y ${it.length - 2} más` : '');
  };
  function visible() {
    const nq = norm(q).trim();
    return pedidos.filter(p => (filtro === 'Todos' || p.estado === filtro) &&
      (!nq || norm(`${p.numero} ${p.nombre} ${p.celular} ${p.ciudad} ${p.productos}`).includes(nq)));
  }
  function render() {
    const hoy = new Date();
    const vivos = pedidos.filter(p => p.estado !== 'Cancelado');
    const mes = vivos.filter(p => { const d = toDate(p.fecha); return d && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear(); });
    const nNew = pedidos.filter(p => p.estado === 'Nuevo').length;
    $('#kNew b').textContent = nNew; $('#kNew').classList.toggle('is-alert', nNew > 0);
    $('#kToday b').textContent = pedidos.filter(p => { const d = toDate(p.fecha); return d && sameDay(d, hoy); }).length;
    $('#kMonth b').textContent = fmt(mes.reduce((a, p) => a + Number(p.subtotal || 0), 0));
    $('#kMonth p:last-child').textContent = `${mes.length} ${mes.length === 1 ? 'pedido' : 'pedidos'} sin cancelados`;
    $('#kAvg b').textContent = fmt(vivos.length ? vivos.reduce((a, p) => a + Number(p.subtotal || 0), 0) / vivos.length : 0);
    $('#totalTxt').textContent = `${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} en total`;
    document.title = nNew ? `(${nNew}) Panel OBSIDIAN` : 'Panel OBSIDIAN';

    const count = e => e === 'Todos' ? pedidos.length : pedidos.filter(p => p.estado === e).length;
    $('#chips').innerHTML = ['Todos', ...ESTADOS].map(e => `<button type="button" class="chip mono${filtro === e ? ' is-on' : ''}"${e !== 'Todos' ? ` data-e="${e}"` : ''} data-f="${e}">${e} <small>${count(e)}</small></button>`).join('');

    const list = visible();
    $('#list').innerHTML = list.map(p => {
      const d = toDate(p.fecha);
      return `<button type="button" class="pn-row${p.estado === 'Nuevo' ? ' is-new' : ''}" data-n="${esc(p.numero)}">
        <span class="c-num"><span class="mono num">${esc(p.numero)}</span><br><span class="mono muted">${d ? dfDay.format(d) + ' · ' + dfTime.format(d) : ''}</span></span>
        <span class="c-cli"><span class="serif">${esc(p.nombre)}</span><br><span class="mono muted">${esc(p.ciudad)}</span></span>
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

  /* ---------- detalle ---------- */
  const waNumber = cel => { const d = String(cel || '').replace(/\D/g, ''); return d.length === 10 && d[0] === '3' ? '57' + d : d; };
  function waText(p) {
    const nombre = String(p.nombre || '').replace(/^Ejemplo · /, '').split(' ')[0];
    const lista = items(p).map(i => `• ${i.cantidad} × ${i.marca} ${i.nombre} — Talla ${i.talla}`).join('\n') || p.productos;
    if (p.estado === 'Enviado') return `Hola ${nombre} 👋 Te escribimos de OBSIDIAN: tu pedido ${p.numero} ya va en camino.`;
    if (p.estado === 'Entregado') return `Hola ${nombre} 👋 Gracias por comprar en OBSIDIAN. ¿Cómo te quedaron tus tenis? (pedido ${p.numero})`;
    return `Hola ${nombre} 👋 Te escribimos de OBSIDIAN sobre tu pedido ${p.numero}:\n\n${lista}\n\nSubtotal: ${fmt(p.subtotal)}\n¿Confirmamos los datos de envío a ${p.ciudad}?`;
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
          <a class="btn btn--block" href="https://wa.me/${waNumber(p.celular)}?text=${encodeURIComponent(waText(p))}" target="_blank" rel="noopener">Escribir por WhatsApp <span class="btn__ico">${arrow}${arrow}</span></a>
          <button class="btn btn--line btn--block btn--sm" type="button" data-copy>Copiar datos de envío</button>
        </div>
      </section>
      <section class="pn-sec"><h3 class="mono muted">Productos · ${its.reduce((a, i) => a + Number(i.cantidad || 1), 0) || p.pares || 0} ${Number(p.pares) === 1 ? 'par' : 'pares'}</h3>
        ${its.length ? its.map(i => {
          const cat = byId[i.id];
          const diff = cat && Number(cat.precio) !== Number(i.precio);
          return `<div class="pn-item">${cat ? `<img src="${esc(cat.imagenes[0])}" alt="">` : '<span></span>'}<div><p class="mono muted">${esc(i.marca)}</p><p class="serif">${esc(i.nombre)}</p><p class="mono">${esc(i.color)} · Talla ${esc(i.talla)} · ${i.cantidad} ${Number(i.cantidad) === 1 ? 'par' : 'pares'}</p>${diff ? `<p class="mono pn-warn">El catálogo hoy dice ${fmt(cat.precio)}</p>` : ''}</div><span class="mono">${fmt(i.precio * i.cantidad)}</span></div>`;
        }).join('') : `<p>${esc(p.productos)}</p>`}
        <div class="tot" style="margin-top:.8rem"><span class="mono">Subtotal</span><b>${fmt(p.subtotal)}</b></div>
        <p class="mono muted">El envío se acuerda con el cliente por WhatsApp.</p>
      </section>
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
    const prev = { estado: p.estado, nota_interna: p.nota_interna };
    if (patch.estado) p.estado = patch.estado;
    if (typeof patch.nota === 'string') p.nota_interna = patch.nota;
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
    const t = [p.nombre, p.celular, p.direccion, p.barrio, p.ciudad, p.notas].filter(Boolean).join('\n');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Datos copiados'); } catch (e) { toast('Selecciona y copia los datos manualmente'); } ta.remove(); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(() => toast('Datos copiados'), fallback); else fallback();
  }

  function exportCSV() {
    const cols = ['numero', 'fecha', 'estado', 'nombre', 'celular', 'ciudad', 'direccion', 'barrio', 'notas', 'productos', 'pares', 'subtotal', 'nota_interna'];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.join(';'), ...visible().map(p => cols.map(c => cell(p[c])).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `pedidos-obsidian-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- eventos ---------- */
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); enter($('#clave').value.trim(), $('#recordar').checked); });
  $('#demoBtn').addEventListener('click', () => { demo = true; pedidos = demoData(); start(); });
  $('#refreshBtn').addEventListener('click', () => { if (demo) { toast('En la demostración no hay pedidos nuevos'); return; } load(false); });
  $('#logoutBtn').addEventListener('click', () => logout(''));
  $('#csvBtn').addEventListener('click', exportCSV);
  $('#q').addEventListener('input', e => { q = e.target.value; render(); });
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-f]'); if (f) { filtro = f.dataset.f; render(); return; }
    const row = e.target.closest('.pn-row'); if (row) { openDetail(row.dataset.n); return; }
    if (e.target.closest('[data-close]')) { closeDetail(); return; }
    const s = e.target.closest('[data-set]'); if (s && abierto) { update(abierto, { estado: s.dataset.set }); return; }
    if (e.target.closest('[data-copy]')) { copyShipping(); return; }
    if (e.target.closest('[data-save-note]') && abierto) update(abierto, { nota: $('#nota').value.trim() });
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && clave && !demo) load(true); });

  /* ---------- arranque ---------- */
  $('#setup').hidden = !!API;
  const saved = keep.get();
  if (API && saved) { $('#clave').value = saved; enter(saved, true); }
  else view('login');
})();
